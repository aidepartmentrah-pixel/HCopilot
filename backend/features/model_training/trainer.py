# =============================================================================
# model_training/trainer.py — Flow Prediction Training Engine
# =============================================================================
#
# Owns three things for the Flow Prediction XGBoost model:
#   1. The actual training logic — reuses FlowDataProcessor (the same class
#      flow_prediction/api.py uses for live inference) so training and
#      serving can never engineer features differently. Hyperparameters and
#      features match backend/models/reference/FlowPrediction-original-
#      notebook.ipynb, which already validated XGBoost as the best of
#      {XGBoost, ElasticNet, 4 ensembles} via walk-forward evaluation.
#   2. Run history/versioning — every run gets its own folder under
#      RUNS_DIR and a TrainingRuns row with real, persisted metrics, instead
#      of the old scripts/train_flow_prediction_model.py behavior of
#      silently overwriting the one live file with no history.
#   3. Concurrency control — a single in-process lock, which is safe because
#      backend/Dockerfile runs uvicorn with no --workers (one process).
#
# TRAIN == DEPLOY:
#   Training this one model on ~thousands of rows takes low single-digit
#   seconds, so there's no separate "review before it goes live" step the
#   way a much larger multi-model pipeline might need — train_and_deploy()
#   both trains AND overwrites the live model path in one call. Rollback is
#   still possible via promote_run(), which redeploys any past completed
#   run's artifact without retraining.
#
# WHY THE LIVE PATH IS IMPORTED, NOT RE-DERIVED:
#   LIVE_MODEL_PATH is imported from features.flow_prediction.api rather
#   than reconstructed here, so the two features can never point at two
#   different files if one of them is ever renamed/moved.
# =============================================================================

import json
import os
import shutil
import threading
import uuid
from datetime import datetime
from typing import Optional

import joblib
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

from db.session import SessionLocal
from db.models import TrainingRun
from features.flow_prediction.data_processor import FlowDataProcessor
from features.flow_prediction.api import MODEL_PATH as LIVE_MODEL_PATH

MODEL_NAME = "flow_prediction"

FEATURES = ["temperature_2m_mean", "dayofweek", "month", "weekofyear",
            "y_lag_1", "y_lag_7", "y_roll_7"]

# Matches the winning configuration from the reference notebook's
# walk-forward comparison (XGBoost MAE 11.37 vs ElasticNet 13.33 vs the
# best ensemble 11.52).
HYPERPARAMETERS = {
    "n_estimators": 500,
    "learning_rate": 0.03,
    "max_depth": 5,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_lambda": 1.0,
    "random_state": 42,
}

BACKEND_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
RUNS_DIR = os.path.join(BACKEND_ROOT, "models", "AIModels", "training_runs")

# Below this many post-feature-engineering rows, an 80/20 chronological
# split is too small to produce a meaningful holdout metric.
MIN_ROWS_TO_TRAIN = 20

# How many non-live run artifacts (the .pkl binaries, not the DB history
# rows) to keep on disk. Bounds disk usage for both real deployments (no
# ops team watching an air-gapped hospital server) and repeated test runs.
RETENTION_KEEP_N = 20

_lock = threading.Lock()
_current_run_id: Optional[str] = None


class TrainingInProgressError(Exception):
    """Raised when a train/promote is attempted while one is already running."""


class InsufficientDataError(ValueError):
    """Raised when there isn't enough data to train a meaningful model."""


class RunNotFoundError(LookupError):
    """Raised when a run_id doesn't exist in TrainingRuns."""


class InvalidRunStateError(ValueError):
    """Raised when an operation isn't valid for a run's current status/artifact state."""


class LiveRunProtectedError(Exception):
    """Raised when an operation would remove the currently-live run."""


def _mape(y_true, y_pred, eps: float = 1e-8) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = np.maximum(np.abs(y_true), eps)
    return float(np.mean(np.abs((y_true - y_pred) / denom)) * 100.0)


def _smape(y_true, y_pred, eps: float = 1e-8) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = np.maximum((np.abs(y_true) + np.abs(y_pred)) / 2.0, eps)
    return float(np.mean(np.abs(y_true - y_pred) / denom) * 100.0)


def make_model() -> XGBRegressor:
    """Build a fresh, untrained estimator with the winning hyperparameters."""
    return XGBRegressor(**HYPERPARAMETERS)


def _serialize_run(row: TrainingRun) -> dict:
    """Shared response shape used by every endpoint (train/list/detail/live)."""
    return {
        "run_id": row.run_id,
        "model_name": row.model_name,
        "status": row.status,
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "finished_at": row.finished_at.isoformat() if row.finished_at else None,
        "row_count_train": row.row_count_train,
        "row_count_test": row.row_count_test,
        "train_data_start": row.train_data_start,
        "train_data_end": row.train_data_end,
        "hyperparameters": json.loads(row.hyperparameters) if row.hyperparameters else None,
        "metrics": {
            "mae": row.mae,
            "rmse": row.rmse,
            "mse": row.mse,
            "r2": row.r2,
            "mape": row.mape,
            "smape": row.smape,
        },
        "artifact_path": row.artifact_path,
        "is_live": bool(row.is_live),
        "error_message": row.error_message,
    }


def is_training_in_progress() -> dict:
    """Whether a train/promote is currently holding the lock, and its run_id."""
    return {"training_in_progress": _lock.locked(), "current_run_id": _current_run_id}


def train_and_deploy(model_name: str = MODEL_NAME) -> dict:
    """
    Retrain the model from the latest HistoricalEdStays/DailyWeather data and
    deploy it as the live model.

    Steps: acquire the lock (non-blocking) -> insert a 'running' TrainingRuns
    row -> build features via FlowDataProcessor (reused, not duplicated) ->
    chronological 80/20 holdout fit for real metrics -> fit the final model
    on the complete dataset -> write a versioned artifact -> copy it onto the
    live model path -> mark this run 'completed' and is_live, clear is_live
    on the previous live run -> prune old artifacts beyond the retention cap.

    Any failure marks the row 'failed' with the error message and re-raises,
    so history stays honest even when training itself blows up.

    Raises:
        TrainingInProgressError: another run is already in progress.
        InsufficientDataError: too few rows after feature engineering.
    """
    global _current_run_id

    if not _lock.acquire(blocking=False):
        raise TrainingInProgressError("A training run is already in progress")

    run_id = f"{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}_{uuid.uuid4().hex[:8]}"
    _current_run_id = run_id

    try:
        with SessionLocal() as session:
            run_row = TrainingRun(
                run_id=run_id,
                model_name=model_name,
                started_at=datetime.utcnow(),
                status="running",
                hyperparameters=json.dumps(HYPERPARAMETERS),
            )
            session.add(run_row)
            session.commit()
            row_id = run_row.id

        try:
            processor = FlowDataProcessor()
            master_df = processor.load_and_prepare_data()
            ml_df = processor.create_features(master_df)

            if len(ml_df) < MIN_ROWS_TO_TRAIN:
                raise InsufficientDataError(
                    f"Only {len(ml_df)} rows after feature engineering "
                    f"(need at least {MIN_ROWS_TO_TRAIN})"
                )

            # Chronological 80/20 holdout — matches scripts/train_flow_prediction_model.py.
            split_date = ml_df["date"].quantile(0.8)
            train_df = ml_df[ml_df["date"] <= split_date]
            test_df = ml_df[ml_df["date"] > split_date]

            holdout_model = make_model()
            holdout_model.fit(train_df[FEATURES], train_df["y"])
            preds = holdout_model.predict(test_df[FEATURES])

            y_true = test_df["y"].values
            mse = float(mean_squared_error(y_true, preds))
            metrics = {
                "mae": float(mean_absolute_error(y_true, preds)),
                "rmse": float(np.sqrt(mse)),
                "mse": mse,
                "r2": float(r2_score(y_true, preds)),
                "mape": _mape(y_true, preds),
                "smape": _smape(y_true, preds),
            }

            # Final model: fit on the complete dataset for deployment.
            final_model = make_model()
            final_model.fit(ml_df[FEATURES], ml_df["y"])

            run_dir = os.path.join(RUNS_DIR, run_id)
            os.makedirs(run_dir, exist_ok=True)
            artifact_abs_path = os.path.join(run_dir, "model.pkl")
            joblib.dump({"model": final_model, "features": FEATURES}, artifact_abs_path)

            # Copy (not move) so the versioned artifact and the live file are
            # independent — a later retention prune can never delete the
            # live model out from under the API.
            os.makedirs(os.path.dirname(LIVE_MODEL_PATH), exist_ok=True)
            shutil.copyfile(artifact_abs_path, LIVE_MODEL_PATH)

            relative_artifact_path = os.path.relpath(artifact_abs_path, BACKEND_ROOT).replace("\\", "/")

            with SessionLocal() as session:
                session.query(TrainingRun).filter(
                    TrainingRun.model_name == model_name,
                    TrainingRun.is_live == True,  # noqa: E712 — see _prune_old_artifacts
                ).update({"is_live": False})

                row = session.query(TrainingRun).filter(TrainingRun.id == row_id).first()
                row.status = "completed"
                row.finished_at = datetime.utcnow()
                row.row_count_train = int(len(train_df))
                row.row_count_test = int(len(test_df))
                row.train_data_start = ml_df["date"].min().strftime("%Y-%m-%d")
                row.train_data_end = ml_df["date"].max().strftime("%Y-%m-%d")
                row.mae, row.rmse, row.mse = metrics["mae"], metrics["rmse"], metrics["mse"]
                row.r2, row.mape, row.smape = metrics["r2"], metrics["mape"], metrics["smape"]
                row.artifact_path = relative_artifact_path
                row.is_live = True
                session.commit()
                result = _serialize_run(row)

            _prune_old_artifacts(model_name)
            return result

        except Exception as e:
            with SessionLocal() as session:
                row = session.query(TrainingRun).filter(TrainingRun.id == row_id).first()
                if row is not None:
                    row.status = "failed"
                    row.finished_at = datetime.utcnow()
                    row.error_message = str(e)[:1000]
                    session.commit()
            raise

    finally:
        _current_run_id = None
        _lock.release()


def _prune_old_artifacts(model_name: str, keep_n: int = RETENTION_KEEP_N) -> None:
    """
    Delete run-folder .pkl binaries beyond the retention cap for non-live
    runs (ordered newest-first). DB rows/metrics are kept forever — they're
    cheap; only the bulky artifacts are pruned.
    """
    with SessionLocal() as session:
        rows = (
            session.query(TrainingRun)
            .filter(
                TrainingRun.model_name == model_name,
                TrainingRun.artifact_path.isnot(None),
                TrainingRun.is_live == False,  # noqa: E712 — MSSQL rejects "IS 1"/"IS 0"; needs a real equality comparison, not .is_()
            )
            .order_by(TrainingRun.started_at.desc())
            .all()
        )
        for row in rows[keep_n:]:
            run_dir = os.path.dirname(os.path.join(BACKEND_ROOT, row.artifact_path))
            if os.path.isdir(run_dir):
                shutil.rmtree(run_dir, ignore_errors=True)
            row.artifact_path = None
        session.commit()


def list_runs(model_name: Optional[str] = MODEL_NAME, limit: int = 50) -> list:
    """Past training runs for a model, most recent first."""
    with SessionLocal() as session:
        q = session.query(TrainingRun)
        if model_name:
            q = q.filter(TrainingRun.model_name == model_name)
        rows = q.order_by(TrainingRun.started_at.desc()).limit(limit).all()
        return [_serialize_run(r) for r in rows]


def get_run(run_id: str) -> Optional[dict]:
    """One run's detail, or None if run_id doesn't exist."""
    with SessionLocal() as session:
        row = session.query(TrainingRun).filter(TrainingRun.run_id == run_id).first()
        return _serialize_run(row) if row else None


def get_live_run(model_name: str = MODEL_NAME) -> Optional[dict]:
    """The currently-deployed run for a model, or None if none is recorded yet."""
    with SessionLocal() as session:
        row = session.query(TrainingRun).filter(
            TrainingRun.model_name == model_name,
            TrainingRun.is_live == True,  # noqa: E712 — see _prune_old_artifacts
        ).first()
        return _serialize_run(row) if row else None


def promote_run(run_id: str) -> dict:
    """
    Redeploy an existing completed run as the live model, without retraining
    — the rollback mechanism for run history.

    Raises:
        TrainingInProgressError: a training run is currently in progress
            (promote also writes the live path, so it shares the same lock).
        RunNotFoundError: run_id doesn't exist.
        InvalidRunStateError: run isn't completed, or its artifact is missing
            (pruned by retention or deleted).
    """
    if not _lock.acquire(blocking=False):
        raise TrainingInProgressError("A training run is already in progress")
    try:
        with SessionLocal() as session:
            row = session.query(TrainingRun).filter(TrainingRun.run_id == run_id).first()
            if row is None:
                raise RunNotFoundError(f"Training run '{run_id}' not found")
            if row.status != "completed":
                raise InvalidRunStateError(f"Cannot promote run '{run_id}': status is '{row.status}'")
            if not row.artifact_path:
                raise InvalidRunStateError(
                    f"Training run '{run_id}' has no artifact (pruned by retention policy)"
                )
            abs_path = os.path.join(BACKEND_ROOT, row.artifact_path)
            if not os.path.exists(abs_path):
                raise InvalidRunStateError(f"Artifact file for run '{run_id}' is missing on disk")

            os.makedirs(os.path.dirname(LIVE_MODEL_PATH), exist_ok=True)
            shutil.copyfile(abs_path, LIVE_MODEL_PATH)

            session.query(TrainingRun).filter(
                TrainingRun.model_name == row.model_name,
                TrainingRun.is_live == True,  # noqa: E712 — see _prune_old_artifacts
            ).update({"is_live": False})
            row.is_live = True
            session.commit()
            return _serialize_run(row)
    finally:
        _lock.release()


def delete_run(run_id: str) -> None:
    """
    Delete a run's history row and artifact.

    Raises:
        RunNotFoundError: run_id doesn't exist.
        LiveRunProtectedError: the run is currently live (promote a
            different run first).
    """
    with SessionLocal() as session:
        row = session.query(TrainingRun).filter(TrainingRun.run_id == run_id).first()
        if row is None:
            raise RunNotFoundError(f"Training run '{run_id}' not found")
        if row.is_live:
            raise LiveRunProtectedError(
                f"Cannot delete the live run '{run_id}'; promote a different run first"
            )
        if row.artifact_path:
            run_dir = os.path.dirname(os.path.join(BACKEND_ROOT, row.artifact_path))
            if os.path.isdir(run_dir):
                shutil.rmtree(run_dir, ignore_errors=True)
        session.delete(row)
        session.commit()


def reconcile_stuck_runs() -> int:
    """
    Mark any TrainingRuns row left at status='running' (e.g. by a killed
    process) as failed. The in-process lock that would represent a
    genuinely active run cannot survive a process restart, so a leftover
    'running' row would otherwise look permanently in-progress. Called from
    app.py's startup event. Returns the number of rows reconciled.
    """
    with SessionLocal() as session:
        stuck = session.query(TrainingRun).filter(TrainingRun.status == "running").all()
        for row in stuck:
            row.status = "failed"
            row.finished_at = row.finished_at or datetime.utcnow()
            row.error_message = "Interrupted by server restart"
        session.commit()
        return len(stuck)

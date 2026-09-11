# =============================================================================
# model_training/api.py — Flow Prediction Model Training HTTP Endpoints
# =============================================================================
#
# Exposes an API to retrain, inspect, roll back, and export the Flow
# Prediction XGBoost model — the operational control surface that was
# previously reachable only by a developer running
# scripts/train_flow_prediction_model.py by hand, with no persisted history.
#
# ENDPOINTS:
#   POST   /train                  — retrain + deploy (synchronous)
#   GET    /status                 — is a run currently in progress
#   GET    /runs                   — run history, most recent first
#   GET    /runs/{run_id}          — one run's detail
#   GET    /live                   — currently-deployed run's metrics
#   GET    /runs/{run_id}/export   — download that run's .pkl
#   POST   /runs/{run_id}/promote  — redeploy an existing run, no retrain
#   DELETE /runs/{run_id}          — delete a non-live run
#
# Train and promote both write the SAME fixed live path that
# features/flow_prediction/api.py already reads via an mtime-based cache —
# that feature needs zero code changes to pick up a freshly (re)trained
# model.
#
# No backend role-enforcement exists anywhere in this app today (auth only
# controls which frontend sections/tabs an account can see) — these
# endpoints are unauthenticated like every other endpoint here, not a new
# gap introduced by this feature.
# =============================================================================

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from . import trainer

router = APIRouter()


@router.post("/train")
async def train_model(model_name: str = trainer.MODEL_NAME):
    """
    Retrain the model from the latest HistoricalEdStays/DailyWeather data
    and deploy it as the live model immediately.

    Returns the full run record (status, metrics, artifact_path, is_live).

    Raises:
        HTTPException 409: a training run is already in progress.
        HTTPException 422: not enough data to train.
    """
    try:
        return trainer.train_and_deploy(model_name)
    except trainer.TrainingInProgressError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except trainer.InsufficientDataError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_status():
    """Whether a training run is currently in progress, and its run_id if so."""
    return trainer.is_training_in_progress()


@router.get("/runs")
async def list_runs(model_name: str = trainer.MODEL_NAME, limit: int = 50):
    """List past training runs for a model, most recent first."""
    runs = trainer.list_runs(model_name=model_name, limit=limit)
    return {"runs": runs, "count": len(runs)}


@router.get("/runs/{run_id}")
async def get_run(run_id: str):
    """One training run's full detail.

    Raises:
        HTTPException 404: run_id doesn't exist.
    """
    run = trainer.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Training run '{run_id}' not found")
    return run


@router.get("/live")
async def get_live(model_name: str = trainer.MODEL_NAME):
    """
    The currently-deployed run's metrics — the "model accuracy" signal that
    /api/flow-prediction/stats cannot provide (that endpoint reports
    dataset statistics, not model performance).

    Raises:
        HTTPException 404: no run has been recorded as live yet (e.g. a
            fresh deploy where the live .pkl predates this feature).
    """
    run = trainer.get_live_run(model_name=model_name)
    if run is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No training run is recorded as live yet for '{model_name}' — "
                "the current model file predates this feature. Trigger a new training run."
            ),
        )
    return run


@router.get("/runs/{run_id}/export")
async def export_run(run_id: str):
    """
    Download a specific run's trained model artifact (.pkl).

    Raises:
        HTTPException 404: run not found, has no artifact, or the artifact
            file is missing on disk (pruned by retention policy or deleted).
    """
    run = trainer.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Training run '{run_id}' not found")
    if not run["artifact_path"]:
        raise HTTPException(
            status_code=404,
            detail=f"Training run '{run_id}' has no artifact (status={run['status']})",
        )
    abs_path = os.path.join(trainer.BACKEND_ROOT, run["artifact_path"])
    if not os.path.exists(abs_path):
        raise HTTPException(
            status_code=404,
            detail=(
                f"Artifact file for run '{run_id}' is missing on disk "
                "(pruned by retention policy or deleted)"
            ),
        )
    return FileResponse(
        abs_path,
        media_type="application/octet-stream",
        filename=f"Flow_prediction_{run_id}.pkl",
    )


@router.post("/runs/{run_id}/promote")
async def promote_run(run_id: str):
    """
    Redeploy an existing completed run as the live model, without
    retraining — the rollback/manual-selection mechanism for run history.

    Raises:
        HTTPException 404: run not found.
        HTTPException 409: a training run is currently in progress.
        HTTPException 422: run isn't in a promotable state (failed, or its
            artifact was pruned/deleted).
    """
    try:
        return trainer.promote_run(run_id)
    except trainer.RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except trainer.TrainingInProgressError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except trainer.InvalidRunStateError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/runs/{run_id}")
async def delete_run(run_id: str):
    """
    Delete a training run's history row and artifact.

    Raises:
        HTTPException 404: run not found.
        HTTPException 409: the run is currently live (promote a different
            run first).
    """
    try:
        trainer.delete_run(run_id)
        return {"deleted": run_id}
    except trainer.RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except trainer.LiveRunProtectedError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

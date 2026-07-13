# =============================================================================
# flow_prediction/api.py — Patient Flow Prediction HTTP Endpoints
# =============================================================================
#
# Exposes the trained XGBoost model for patient-flow forecasting.
#
# ENDPOINTS:
#   GET /api/flow-prediction/predict?days=N   — N-day ahead forecast
#   GET /api/flow-prediction/historical?days=N — last N days of actual counts
#   GET /api/flow-prediction/stats            — aggregate statistics on the dataset
#
# CACHING STRATEGY (important for performance):
#   Loading the model file (~large .pkl) and building the feature DataFrame from
#   the 61 MB edstays CSV is expensive.  Both are cached in module-level variables
#   and only reloaded when the underlying file changes (mtime comparison):
#
#     _model_data / _model_mtime : the loaded joblib dict {model, features}
#     _ml_df / _ml_df_mtime      : the fully-featured DataFrame for historical
#                                  context and lag seeding
#
#   This means the first request after startup is slow; subsequent requests are
#   fast (microseconds) as long as neither file is modified on disk.
#
# AUTO-REGRESSIVE PREDICTION:
#   The model predicts one day at a time.  For the first prediction day, lags
#   are seeded from real historical values.  For each subsequent day, the previous
#   day's prediction is fed back as the lag input.  This auto-regressive loop is
#   the key mechanism that makes multi-day forecasts possible with a single model
#   trained on univariate lags.
# =============================================================================

from fastapi import APIRouter, HTTPException
import joblib
import os
import pandas as pd
import numpy as np
from .data_processor import FlowDataProcessor
from db.session import SessionLocal
from db.models import HistoricalEdStay

router = APIRouter()

# Path to the model binary — still filesystem-based (see model_files/api.py's registry)
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "models", "AIModels", "Flow_prediction.pkl")

# ── Module-level cache ────────────────────────────────────────────────────────
# These four module-level variables persist across requests within the same
# server process.
#
# _model_data  : joblib dict {model: XGBRegressor, features: list[str]}
# _model_mtime : float — mtime of Flow_prediction.pkl at load time
# _ml_df       : pd.DataFrame — engineered feature DataFrame (date, y, lags, etc.)
# _ml_df_row_count : int — row count of HistoricalEdStays at build time; any
#                    mismatch (e.g. a future incremental import) triggers a rebuild

_model_data:  dict  = None
_model_mtime: float = 0.0

_ml_df            = None
_ml_df_row_count: int = -1


def _get_model_data() -> dict:
    """
    Return the cached model dict, reloading from disk if the .pkl file has changed.

    The model file is loaded via joblib which handles the XGBoost serialisation
    format.  The dict contains at minimum {model: estimator, features: list}.

    Returns:
        dict with 'model' (trained estimator) and 'features' (ordered feature list).

    Raises:
        HTTPException(404) : If the model file does not exist on disk.
    """
    global _model_data, _model_mtime
    if not os.path.exists(MODEL_PATH):
        raise HTTPException(status_code=404, detail="Model file not found")
    mtime = os.path.getmtime(MODEL_PATH)
    # Only reload if the file has been modified since the last load
    if _model_data is None or _model_mtime != mtime:
        _model_data  = joblib.load(MODEL_PATH)
        _model_mtime = mtime
    return _model_data


def _get_ml_df():
    """
    Return the cached feature DataFrame, rebuilding only when HistoricalEdStays changes.

    Building the DataFrame requires reading ~425k rows and engineering
    lag/rolling features, which takes a few seconds.  The result is cached until
    the row count of HistoricalEdStays changes (e.g. a future incremental import).

    Returns:
        pd.DataFrame with columns: date, y, temperature_2m_mean, dayofweek,
        month, weekofyear, y_lag_1, y_lag_7, y_roll_7.

    Raises:
        HTTPException(404) : If HistoricalEdStays has no rows.
    """
    global _ml_df, _ml_df_row_count
    with SessionLocal() as session:
        row_count = session.query(HistoricalEdStay).count()
    if row_count == 0:
        raise HTTPException(status_code=404, detail="HistoricalEdStays dataset is empty")
    # Rebuild the feature DataFrame only if the row count has changed
    if _ml_df is None or _ml_df_row_count != row_count:
        processor    = FlowDataProcessor()
        master_df    = processor.load_and_prepare_data()
        _ml_df       = processor.create_features(master_df)
        _ml_df_row_count = row_count
    return _ml_df


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/predict")
async def predict_flow(days: int = 30):
    """
    Generate a multi-day patient-flow forecast using an auto-regressive loop.

    For each future day the model receives:
      - temperature_2m_mean : 7-day average from the most recent real data
      - dayofweek, month, weekofyear : from the future calendar date
      - y_lag_1  : yesterday's predicted count (real data for day 1)
      - y_lag_7  : same day last week's count (real data for days 1-7)
      - y_roll_7 : 7-day rolling mean (mix of real + predicted for days 1-7)

    The predicted value for each day is appended to pred_history so it can
    feed the next day's lag inputs.

    Args:
        days : Number of future days to forecast (default 30).

    Returns:
        dict with predictions list, total_days, and model_features.
        Each prediction item: {date, predicted_patients, temperature, day_of_week}.

    Raises:
        HTTPException(404) : Model file or edstays dataset missing.
        HTTPException(500) : Unexpected error during prediction.
    """
    try:
        model_data = _get_model_data()
        model      = model_data["model"]
        features   = model_data["features"]
        ml_df      = _get_ml_df()

        last_date    = ml_df["date"].max()
        pred_history = []  # accumulates predictions so they can serve as lags
        predictions  = []

        for day in range(days):
            future_date = last_date + pd.Timedelta(days=day + 1)
            # Use the last 7 days' average temperature as a static weather proxy
            last_temp = ml_df["temperature_2m_mean"].tail(7).mean()

            if day == 0:
                # Seed lags from real historical values on the first prediction day
                y_lag_1  = ml_df["y"].iloc[-1]
                y_lag_7  = ml_df["y"].iloc[-7]
                y_roll_7 = ml_df["y"].tail(7).mean()
            else:
                # For subsequent days, lags come from previous predictions
                y_lag_1 = pred_history[-1] if pred_history else ml_df["y"].iloc[-1]
                if day >= 7:
                    # Fully within the predicted window — use only predicted history
                    y_lag_7  = pred_history[-7]
                    y_roll_7 = np.mean(pred_history[-7:])
                else:
                    # Transitional: mix real historical tail with predictions so far
                    recent   = list(ml_df["y"].tail(7 - day).values) + pred_history
                    y_lag_7  = recent[0] if len(recent) >= 7 else ml_df["y"].iloc[-7]
                    y_roll_7 = np.mean(recent[-7:]) if len(recent) >= 7 else np.mean(recent)

            # Build the single-row feature DataFrame for this day's prediction
            X_pred = pd.DataFrame([{
                "temperature_2m_mean": last_temp,
                "dayofweek":           future_date.dayofweek,
                "month":               future_date.month,
                "weekofyear":          future_date.isocalendar().week,
                "y_lag_1":             y_lag_1,
                "y_lag_7":             y_lag_7,
                "y_roll_7":            y_roll_7,
            }])

            pred = model.predict(X_pred[features])[0]
            pred_history.append(pred)
            predictions.append({
                "date":               future_date.strftime("%Y-%m-%d"),
                "predicted_patients": float(pred),
                "temperature":        float(last_temp),
                "day_of_week":        int(future_date.dayofweek),
            })

        return {
            "predictions":    predictions,
            "total_days":     len(predictions),
            "model_features": features,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/historical")
async def get_historical_data(days: int = 90):
    """
    Return the last N days of actual patient counts from the processed dataset.

    Args:
        days : Number of recent days to return (default 90).

    Returns:
        dict with historical list and total_days.
        Each item: {date, actual_patients, temperature, day_of_week}.

    Raises:
        HTTPException(404/500) : If dataset or model is unavailable.
    """
    try:
        ml_df       = _get_ml_df()
        recent_data = ml_df.tail(days)

        historical = [
            {
                "date":            row["date"].strftime("%Y-%m-%d"),
                "actual_patients": int(row["y"]),
                "temperature":     float(row["temperature_2m_mean"]) if pd.notna(row["temperature_2m_mean"]) else None,
                "day_of_week":     int(row["dayofweek"]),
            }
            for _, row in recent_data.iterrows()
        ]

        return {"historical": historical, "total_days": len(historical)}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_statistics():
    """
    Return aggregate statistics about the historical daily-patient dataset.

    Returns:
        dict with total_records, date_range, avg/max/min/std daily patient counts.

    Raises:
        HTTPException(404/500) : If dataset or model is unavailable.
    """
    try:
        ml_df = _get_ml_df()

        return {
            "total_records":      int(len(ml_df)),
            "date_range": {
                "start": ml_df["date"].min().strftime("%Y-%m-%d"),
                "end":   ml_df["date"].max().strftime("%Y-%m-%d"),
            },
            "avg_daily_patients": float(ml_df["y"].mean()),
            "max_daily_patients": int(ml_df["y"].max()),
            "min_daily_patients": int(ml_df["y"].min()),
            "std_daily_patients": float(ml_df["y"].std()),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# scripts/train_flow_prediction_model.py — Train and save Flow_prediction.pkl
# =============================================================================
#
# Stage 2: retrains the patient-flow XGBoost model sourcing data from SQL
# Server (HistoricalEdStays / DailyWeather) instead of the original static
# edstays_with_synth.csv / meteo.csv files, via the now DB-backed
# FlowDataProcessor.
#
# Hyperparameters match the reference notebook (backend/models/reference/
# FlowPrediction-original-notebook.ipynb), which already validated XGBoost as
# the best of {XGBoost, ElasticNet, 4 ensembles} via walk-forward evaluation
# (XGBoost MAE 11.37 on the original dataset). This script does a quick
# single 80/20 holdout check (not a full walk-forward re-run) to confirm the
# retrained model is sane, then fits the final model on the complete dataset
# — matching the notebook's own final "Save the best model" step.
#
# Run from backend/:  .venv\Scripts\python.exe scripts\train_flow_prediction_model.py
# =============================================================================

import os
import sys
import joblib
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from features.flow_prediction.data_processor import FlowDataProcessor

MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "models", "AIModels", "Flow_prediction.pkl")

FEATURES = ["temperature_2m_mean", "dayofweek", "month", "weekofyear",
            "y_lag_1", "y_lag_7", "y_roll_7"]


def make_model():
    return XGBRegressor(
        n_estimators=500,
        learning_rate=0.03,
        max_depth=5,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_lambda=1.0,
        random_state=42,
    )


def main():
    print("Loading and engineering features from HistoricalEdStays/DailyWeather...")
    processor = FlowDataProcessor()
    master_df = processor.load_and_prepare_data()
    ml_df = processor.create_features(master_df)
    print(f"  {len(ml_df)} daily rows after feature engineering "
          f"({ml_df['date'].min().date()} .. {ml_df['date'].max().date()})")

    # Quick 80/20 chronological holdout check (single fit, not full walk-forward
    # re-run — the notebook already validated XGBoost's superiority that way).
    split_date = ml_df["date"].quantile(0.8)
    train = ml_df[ml_df["date"] <= split_date]
    test = ml_df[ml_df["date"] > split_date]
    print(f"Holdout check: train={len(train)} rows, test={len(test)} rows")

    holdout_model = make_model()
    holdout_model.fit(train[FEATURES], train["y"])
    preds = holdout_model.predict(test[FEATURES])

    mae = mean_absolute_error(test["y"], preds)
    rmse = np.sqrt(mean_squared_error(test["y"], preds))
    r2 = r2_score(test["y"], preds)
    print(f"Holdout metrics: MAE={mae:.2f}  RMSE={rmse:.2f}  R2={r2:.3f}")

    # Final model: fit on the complete dataset for deployment (matches the
    # notebook's own final step).
    print("Fitting final model on the complete dataset...")
    final_model = make_model()
    final_model.fit(ml_df[FEATURES], ml_df["y"])

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump({"model": final_model, "features": FEATURES}, MODEL_PATH)
    print(f"Saved model to {MODEL_PATH}")


if __name__ == "__main__":
    main()

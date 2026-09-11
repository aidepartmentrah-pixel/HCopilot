# =============================================================================
# scripts/train_flow_prediction_model.py — CLI wrapper for the training engine
# =============================================================================
#
# Stage 3: this used to contain its own copy of the training/holdout/save
# logic. That logic now lives in features/model_training/trainer.py (also
# used by POST /api/model-training/train), so the CLI and the API can never
# drift apart. This script is a thin wrapper kept specifically as an
# offline/no-server fallback — this app deploys air-gapped to hospitals, and
# being able to retrain from a shell even if the API process is unhealthy
# has real value there.
#
# Run from backend/:  .venv\Scripts\python.exe scripts\train_flow_prediction_model.py
# =============================================================================

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from features.model_training.trainer import train_and_deploy


def main():
    print("Training the flow_prediction model from HistoricalEdStays/DailyWeather...")
    result = train_and_deploy()
    print(f"Run {result['run_id']}: {result['status']}")
    print(f"Rows: train={result['row_count_train']}  test={result['row_count_test']}")
    print(f"Metrics: {result['metrics']}")
    print(f"Saved to {result['artifact_path']} and deployed as the live model")


if __name__ == "__main__":
    main()

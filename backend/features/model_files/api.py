# =============================================================================
# model_files/api.py — AI Model File Listing Endpoint
# =============================================================================
#
# Provides a single endpoint that scans the backend/models/AIModels/ directory
# and returns metadata about every .pkl file found there.
#
# ENDPOINT:
#   GET /api/models/list
#
# PURPOSE:
#   The Settings → Models tab in the frontend shows which trained models are
#   available on disk, along with their sizes and last-modified timestamps.
#   This helps operators confirm that the expected model files (e.g.
#   Flow_prediction.pkl) are present before running predictions.
#
# NOTE:
#   This endpoint only reads file metadata — it does not load any model into
#   memory.  Actual model loading is handled by flow_prediction/api.py.
# =============================================================================

from fastapi import APIRouter
import os
from datetime import datetime

router = APIRouter()

# Absolute path to the folder where trained .pkl model files are stored
MODELS_FOLDER = os.path.join(os.path.dirname(__file__), "..", "..", "models", "AIModels")


@router.get("/list")
async def list_model_files():
    """
    Scan the AIModels directory and return metadata for every .pkl file.

    For each file the response includes:
      - name     : filename (e.g. "Flow_prediction.pkl")
      - size     : raw file size in bytes
      - size_mb  : file size in megabytes, rounded to 2 decimal places
      - modified : ISO datetime of the file's last modification time
      - path     : absolute path on the server filesystem

    Files are sorted alphabetically by name for consistent display.

    Returns:
        dict with keys:
          - models    : list of model metadata dicts
          - count     : total number of .pkl files found
          - timestamp : ISO string of when the scan was performed
    """
    # Return an empty list gracefully if the models directory doesn't exist yet
    if not os.path.exists(MODELS_FOLDER):
        return {"models": [], "count": 0}

    models = []
    for filename in os.listdir(MODELS_FOLDER):
        if filename.endswith('.pkl'):
            filepath   = os.path.join(MODELS_FOLDER, filename)
            file_stats = os.stat(filepath)

            models.append({
                "name":     filename,
                "size":     file_stats.st_size,
                "size_mb":  round(file_stats.st_size / (1024 * 1024), 2),
                "modified": datetime.fromtimestamp(file_stats.st_mtime).isoformat(),
                "path":     filepath
            })

    # Sort alphabetically so the list is deterministic
    models.sort(key=lambda x: x['name'])

    return {"models": models, "count": len(models), "timestamp": datetime.now().isoformat()}

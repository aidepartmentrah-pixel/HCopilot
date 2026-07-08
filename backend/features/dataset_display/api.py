# =============================================================================
# dataset_display/api.py — Dataset Browser HTTP Endpoints
# =============================================================================
#
# Provides three endpoints for browsing and refreshing the local CSV datasets:
#
#   GET  /api/patient-flow/datasets           — list metadata for all datasets
#   GET  /api/patient-flow/data/{dataset}     — paginated rows from a single CSV
#   POST /api/patient-flow/refresh-data/{dataset}  — pull a single dataset from the
#                                               upstream API server and save locally
#   POST /api/patient-flow/refresh-all-data   — pull every dataset in one batch
#
# PAGINATION DESIGN:
#   Large CSV files (e.g. edstays_with_synth.csv at ~61 MB) are never fully
#   loaded into memory for a listing request.  DataManager.load_page_from_csv
#   uses pandas skiprows + nrows so only the requested slice is read.
#
# REMOTE REFRESH:
#   The "refresh" endpoints pull from a second API server running at
#   http://127.0.0.1:8100 (configured in DataManager.API_SERVER_BASE).
#   These endpoints are used in the Settings → Datasets tab to keep the local
#   CSV files up to date with the upstream data source.
# =============================================================================

from fastapi import APIRouter, HTTPException
from datetime import datetime
from .data_manager import DataManager

router       = APIRouter()
data_manager = DataManager()


@router.get("/datasets")
async def get_datasets_info():
    """
    Return metadata for every known dataset without loading file contents.

    Metadata includes row count (via fast line-count), file size in bytes,
    and column names (via a header-only read).  This is intentionally cheap
    so the Settings → Datasets overview can load quickly even when CSVs are large.

    Returns:
        dict with keys:
          - available_datasets : list of dataset name strings
          - datasets_info      : per-dataset dict with records_count, file_exists,
                                 file_size, and columns
          - timestamp          : ISO string of when the metadata was computed
    """
    return data_manager.get_datasets_info()


@router.get("/data/{dataset}")
async def get_dataset(dataset: str, page: int = 1, page_size: int = 50):
    """
    Return one page of rows from a local CSV dataset.

    Only the rows needed for the requested page are read from disk (via
    pandas skiprows + nrows), making this safe to call on very large files.

    Args:
        dataset   : Dataset name (must be in DataManager.DATASETS).
        page      : 1-based page number (default 1).
        page_size : Number of rows per page (default 50).

    Returns:
        dict with keys:
          - data       : list of row dicts for the requested page
          - pagination : dict with page, page_size, total_records, total_pages

    Raises:
        HTTPException(404) : If the dataset name is not in the known list.
    """
    if dataset not in data_manager.DATASETS:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset}' not found")

    data, total_records = data_manager.load_page_from_csv(dataset, page, page_size)

    # Compute total pages; guard against division by zero on empty datasets
    total_pages = (total_records + page_size - 1) // page_size if total_records > 0 else 0

    return {
        "data": data,
        "pagination": {
            "page":          page,
            "page_size":     page_size,
            "total_records": total_records,
            "total_pages":   total_pages,
        },
    }


@router.post("/refresh-data/{dataset}")
async def refresh_dataset(dataset: str):
    """
    Pull a single dataset from the remote API server and save it locally as CSV.

    Fetches all rows from http://127.0.0.1:8100/data/{dataset}/all (with a
    /data/{dataset} fallback).  On success the local CSV file is overwritten.

    Args:
        dataset : Dataset name (must be in DataManager.DATASETS).

    Returns:
        dict with message, record count, and ISO timestamp.

    Raises:
        HTTPException(404) : Dataset name not recognised.
        HTTPException(400) : Remote fetch failed (connection error, bad status, etc.).
    """
    if dataset not in data_manager.DATASETS:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset}' not found")

    success, count = await data_manager.fetch_and_save_dataset(dataset)

    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to fetch data for {dataset}")

    return {
        "message":   f"Successfully refreshed {dataset}",
        "records":   count,
        "timestamp": datetime.now().isoformat(),
    }


@router.post("/refresh-all-data")
async def refresh_all_datasets():
    """
    Pull fresh data for every dataset and return a per-dataset success/failure summary.

    Iterates over DataManager.DATASETS and attempts to fetch + save each one.
    Individual failures are reported in the results dict rather than raising an
    exception, so a single unreachable dataset does not abort the whole batch.

    Returns:
        dict with message, per-dataset results dict (status + record count),
        and ISO timestamp.
    """
    results = await data_manager.fetch_all_datasets()
    return {
        "message":   "Refresh completed",
        "results":   results,
        "timestamp": datetime.now().isoformat(),
    }

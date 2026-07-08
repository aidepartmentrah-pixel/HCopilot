# =============================================================================
# dataset_display/data_manager.py — CSV Dataset Manager
# =============================================================================
#
# Manages reading, metadata querying, and remote refresh of all local CSV datasets.
#
# KEY DESIGN DECISIONS:
#
#   1. Paginated reads (load_page_from_csv)
#      Large files such as edstays_with_synth.csv (~61 MB) are never fully loaded
#      into memory for a listing request.  The method uses pandas skiprows to skip
#      to the requested page and nrows to read only the needed rows.  Row counts are
#      computed by counting newline bytes in 1 MB chunks — roughly 100x faster than
#      pd.read_csv for large files.
#
#   2. Row-count cache (_row_count_cache)
#      Counting newlines is cheap but still involves disk I/O.  The result is cached
#      per file path keyed by the file's mtime.  The cache is invalidated automatically
#      when the file changes (mtime check) and explicitly when save_to_csv writes a
#      new file.
#
#   3. Remote refresh (fetch_and_save_dataset / fetch_all_datasets)
#      Data can be pulled from a companion API server running at API_SERVER_BASE.
#      This is an optional feature used in the Settings → Datasets tab; the main UI
#      works entirely from the local CSV files.
#
# DATASET LIST:
#   The DATASETS constant lists every CSV that this feature knows about.  The
#   dataset_display feature owns reading/refreshing all of them; other features
#   (e.g. flow_prediction) read some of these same files directly.
# =============================================================================

import pandas as pd
import numpy as np
import requests
import logging
import os
from typing import List, Dict, Any, Tuple, Optional

logger = logging.getLogger(__name__)


class DataManager:
    """
    Handles metadata queries, paginated reads, and remote refresh for all local
    CSV datasets stored in backend/datasets/.

    All dataset files are stored as plain CSV with one row per record.
    This class never holds full dataset contents in memory — reads are always
    scoped to the exact rows requested (metadata: header only; paginated: page slice).

    Invariants:
      - DATABASE_FOLDER must exist before any read/write is attempted.
        The constructor creates it if missing.
      - _row_count_cache entries are keyed by (csv_path, mtime) to allow automatic
        invalidation when the underlying file changes.
    """

    # Absolute path to the shared datasets directory
    DATABASE_FOLDER = os.path.join(os.path.dirname(__file__), "..", "..", "datasets")

    # Base URL of the upstream API server used by the refresh endpoints.
    # Only needed if you want to pull fresh data; the local CSVs work without it.
    API_SERVER_BASE = "http://127.0.0.1:8100"

    # Ordered list of every dataset this feature knows about.
    # Used by get_datasets_info() and fetch_all_datasets().
    DATASETS = [
        "diagnosis",
        "Patients",
        "vitalsign_with_synth",
        "meteo",
        "edstays_with_synth",
        "medrecon_with_synth",
        "pyxis_with_synth",
        "Wards",
        "DailyPatients"
    ]

    def __init__(self):
        # Ensure the datasets directory exists before any file operations
        os.makedirs(self.DATABASE_FOLDER, exist_ok=True)
        # Cache structure: {csv_path: (mtime_float, row_count_int)}
        # An entry is valid only when its mtime matches the file's current mtime.
        self._row_count_cache: Dict[str, Tuple[float, int]] = {}

    # ── Row counting (fast, cached) ───────────────────────────────────────────

    def _get_row_count(self, csv_path: str) -> int:
        """
        Count the number of data rows in a CSV file using fast newline counting.

        Reading a large CSV through pandas just to count rows is very slow.
        Instead, the file is read in 1 MB binary chunks and newlines are counted
        directly.  The result is cached with the file's mtime so subsequent calls
        with an unchanged file return immediately from cache.

        Args:
            csv_path : Absolute path to the CSV file.

        Returns:
            Integer count of data rows (header line excluded).
        """
        mtime = os.path.getmtime(csv_path)
        cached = self._row_count_cache.get(csv_path)
        # Return cached count if the file has not been modified since last count
        if cached and cached[0] == mtime:
            return cached[1]

        # Count newlines in 1 MB chunks — far faster than pandas read_csv on large files
        count = 0
        with open(csv_path, 'rb') as f:
            chunk = f.read(1 << 20)  # 1 MB
            while chunk:
                count += chunk.count(b'\n')
                chunk = f.read(1 << 20)

        # Subtract 1 for the header line; clamp to 0 for empty files
        row_count = max(0, count - 1)
        self._row_count_cache[csv_path] = (mtime, row_count)
        return row_count

    # ── Paginated CSV read (the key optimisation) ─────────────────────────────

    def load_page_from_csv(
        self, dataset: str, page: int, page_size: int
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Read only the rows needed for one page from a CSV file.

        Uses pandas skiprows to skip to the start of the requested page without
        loading preceding rows, and nrows to stop reading after the page ends.
        This keeps memory usage proportional to page_size, not file size.

        NaN and ±Inf values are replaced with None so the result is JSON-safe.

        Args:
            dataset   : Dataset name (used to build the CSV file path).
            page      : 1-based page number.
            page_size : Maximum number of rows to return.

        Returns:
            Tuple of (list_of_row_dicts, total_row_count).
            Returns ([], 0) if the file does not exist or an error occurs.
        """
        csv_path = os.path.join(self.DATABASE_FOLDER, f"{dataset}.csv")

        if not os.path.exists(csv_path):
            return [], 0

        try:
            total_rows = self._get_row_count(csv_path)
            start_idx  = (page - 1) * page_size

            # If the requested page starts beyond the last row, return empty
            if start_idx >= total_rows:
                return [], total_rows

            # skiprows=range(1, N) skips data rows 1..N while keeping the header (row 0).
            # When start_idx==0 (first page), no rows need to be skipped.
            skip = range(1, start_idx + 1) if start_idx > 0 else None
            df = pd.read_csv(csv_path, skiprows=skip, nrows=page_size)

            # Replace non-finite values with None — single-pass, no redundant fillna
            df.replace([np.nan, np.inf, -np.inf], None, inplace=True)

            return df.to_dict('records'), total_rows

        except Exception as e:
            logger.error(f"❌ Error loading page from {dataset}: {e}")
            return [], 0

    # ── Dataset metadata (no full reads) ─────────────────────────────────────

    def get_datasets_info(self) -> Dict[str, Any]:
        """
        Return metadata for all known datasets without loading their full contents.

        For each dataset the method reports:
          - records_count : data row count (fast newline count, cached)
          - file_exists   : whether the CSV file is present on disk
          - file_size     : raw byte size of the CSV file
          - columns       : list of column header strings (header-only read)

        Returns:
            dict with keys available_datasets, datasets_info, and timestamp.
        """
        datasets_info = {}

        for dataset in self.DATASETS:
            csv_path = os.path.join(self.DATABASE_FOLDER, f"{dataset}.csv")
            exists = os.path.exists(csv_path)

            if exists:
                row_count = self._get_row_count(csv_path)
                file_size = os.path.getsize(csv_path)
                # Read only the header row (nrows=0) to get column names cheaply
                try:
                    columns = pd.read_csv(csv_path, nrows=0).columns.tolist()
                except Exception:
                    columns = []
            else:
                row_count = 0
                file_size = 0
                columns   = []

            datasets_info[dataset] = {
                "records_count": row_count,
                "file_exists":   exists,
                "file_size":     file_size,
                "columns":       columns,
            }

        return {
            "available_datasets": self.DATASETS,
            "datasets_info":      datasets_info,
            "timestamp":          pd.Timestamp.now().isoformat(),
        }

    # ── Full-file load (kept for non-paginated internal use) ──────────────────

    def load_from_csv(self, dataset: str) -> List[Dict[str, Any]]:
        """
        Load an entire dataset into memory as a list of dicts.

        This method is NOT used by the paginated listing endpoints; it exists for
        internal consumers that need the full dataset (e.g. the flow prediction
        feature which must process every row to build its feature matrix).

        NaN and ±Inf are replaced with None for safe downstream handling.

        Args:
            dataset : Dataset name (used to build the CSV file path).

        Returns:
            List of row dicts, or [] if the file does not exist or an error occurs.
        """
        csv_path = os.path.join(self.DATABASE_FOLDER, f"{dataset}.csv")

        if not os.path.exists(csv_path):
            return []

        try:
            df = pd.read_csv(csv_path)
            df.replace([np.nan, np.inf, -np.inf], None, inplace=True)
            return df.to_dict('records')
        except Exception as e:
            logger.error(f"❌ Error loading {dataset}: {e}")
            return []

    # ── Remote API fetch / save ───────────────────────────────────────────────

    def fetch_all_data_from_api(self, dataset: str) -> List[Dict[str, Any]]:
        """
        Fetch ALL rows for a dataset from the upstream API server.

        Tries the /data/{dataset}/all endpoint first, falls back to /data/{dataset}.
        Both endpoints are expected to return either a list of dicts or a dict
        with a 'data' key containing such a list.

        Args:
            dataset : Dataset name.

        Returns:
            List of row dicts, or [] on any error (connection, timeout, bad status).
        """
        try:
            url = f"{self.API_SERVER_BASE}/data/{dataset}/all"
            logger.info(f"Fetching ALL data from: {url}")
            response = requests.get(url, timeout=300)

            if response.status_code == 200:
                return self._parse_api_response(response.json())

            # Fallback: try the non-/all endpoint
            url = f"{self.API_SERVER_BASE}/data/{dataset}"
            logger.info(f"Trying fallback endpoint: {url}")
            response = requests.get(url, timeout=300)

            if response.status_code == 200:
                return self._parse_api_response(response.json())

            logger.error(f"❌ API error for {dataset}: HTTP {response.status_code}")
            return []

        except requests.exceptions.ConnectionError:
            logger.error(f"❌ Cannot connect to API server at {self.API_SERVER_BASE}")
            return []
        except requests.exceptions.Timeout:
            logger.error(f"❌ Timeout fetching {dataset}")
            return []
        except Exception as e:
            logger.error(f"❌ Error fetching {dataset}: {e}")
            return []

    def _parse_api_response(self, response_data) -> List[Dict[str, Any]]:
        """
        Normalise the upstream API response into a flat list of row dicts.

        The upstream server may return either a bare list or a dict with a 'data'
        key.  This method handles both shapes transparently.

        Args:
            response_data : Parsed JSON from the upstream server response.

        Returns:
            List of row dicts, or [] if the structure is unrecognised.
        """
        if isinstance(response_data, dict) and 'data' in response_data:
            data_field = response_data['data']
            if isinstance(data_field, list):
                return data_field
            return []
        if isinstance(response_data, list):
            return response_data
        return []

    def save_to_csv(self, dataset: str, data: List[Dict[str, Any]]) -> bool:
        """
        Persist a list of row dicts to the local CSV file for a dataset.

        Overwrites any existing file.  Invalidates the row-count cache entry
        for this file so the next metadata request reflects the new content.

        Args:
            dataset : Dataset name (used to build the target file path).
            data    : List of row dicts to write.

        Returns:
            True on success, False if data is empty or an error occurs.
        """
        if not data:
            return False
        try:
            csv_path = os.path.join(self.DATABASE_FOLDER, f"{dataset}.csv")
            pd.DataFrame(data).to_csv(csv_path, index=False)
            # Invalidate the stale cache entry so the next count reflects the new file
            self._row_count_cache.pop(csv_path, None)
            return True
        except Exception as e:
            logger.error(f"❌ Error saving {dataset}: {e}")
            return False

    async def fetch_and_save_dataset(self, dataset: str) -> Tuple[bool, int]:
        """
        Fetch a single dataset from the upstream server and save it locally.

        Args:
            dataset : Dataset name.

        Returns:
            Tuple of (success_bool, saved_row_count).
        """
        data = self.fetch_all_data_from_api(dataset)
        if data:
            success = self.save_to_csv(dataset, data)
            return (success, len(data))
        return (False, 0)

    async def fetch_all_datasets(self) -> Dict[str, Dict[str, Any]]:
        """
        Fetch and save every dataset in DATASETS sequentially.

        Returns:
            Dict mapping dataset name → {status: "success"|"failed", records: int}.
        """
        logger.info("🚀 Patient Flow: Fetching datasets...")
        results = {}
        success_count = 0

        for dataset in self.DATASETS:
            logger.info(f"📥 Fetching {dataset}...")
            success, count = await self.fetch_and_save_dataset(dataset)
            results[dataset] = {"status": "success" if success else "failed", "records": count}
            if success:
                success_count += 1

        logger.info(f"✅ Successfully loaded {success_count}/{len(self.DATASETS)} datasets")
        return results

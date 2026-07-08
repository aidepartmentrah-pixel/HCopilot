# Manages all many-to-many relationship tables stored as CSV files.
# Every link between two entities (patient↔bed, patient↔doctor, ward↔nurse, etc.)
# lives in a separate two-column CSV file handled by this single class.

import pandas as pd
import os
from fastapi import HTTPException
from features.timestamp_utils import safe_read_csv

# Base folder shared by all relation CSV files
DATASETS = os.path.join(os.path.dirname(__file__), "..", "..", "datasets")

# Registry of every supported relation table: name → {csv filename, column names}
TABLES = {
    "patient_doctor": {"file": "patient_doctor.csv", "cols": ["patient_id", "doctor_id"]},
    "patient_nurse":  {"file": "patient_nurse.csv",  "cols": ["patient_id", "nurse_id"]},
    "patient_bed":    {"file": "patient_bed.csv",    "cols": ["patient_id", "bed_id"]},
    "ward_doctor":    {"file": "ward_doctor.csv",    "cols": ["ward_id",    "doctor_id"]},
    "ward_nurse":     {"file": "ward_nurse.csv",     "cols": ["ward_id",    "nurse_id"]},
    "ward_bed":       {"file": "ward_bed.csv",       "cols": ["ward_id",    "bed_id"]},
}


class RelationsManager:
    """
    Generic CRUD manager for all many-to-many relationship tables in HCopilot.

    Every link between two entity types (patient↔bed, ward↔nurse, etc.) is
    stored as a two-column CSV file.  A single instance of this class can
    operate on any of the six supported tables through the TABLES registry,
    so no separate class is needed per relationship.

    CSV files managed (all in backend/datasets/):
      - patient_bed.csv    (patient_id, bed_id)
      - patient_doctor.csv (patient_id, doctor_id)
      - patient_nurse.csv  (patient_id, nurse_id)
      - ward_bed.csv       (ward_id, bed_id)
      - ward_doctor.csv    (ward_id, doctor_id)
      - ward_nurse.csv     (ward_id, nurse_id)

    Key design rules:
      - Each (col_a, col_b) pair must be unique; add() rejects duplicates.
      - delete_by_left() removes all rows for a given left-side entity (e.g.
        removing all of a discharged patient's links in one call).
      - delete_by_right() removes all rows for a given right-side entity (e.g.
        removing all references to a deleted doctor across every relation table).
    """

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _path(self, table: str) -> str:
        # Build the absolute path to a table's CSV file
        return os.path.join(DATASETS, TABLES[table]["file"])

    def _cols(self, table: str):
        # Return the two column names for a given table
        return TABLES[table]["cols"]

    def _read(self, table: str) -> pd.DataFrame:
        path = self._path(table)
        cols = self._cols(table)
        if not os.path.exists(path):
            return pd.DataFrame(columns=cols)
        df = safe_read_csv(path, cols)
        if not df.empty:
            for col in cols:
                df[col] = df[col].astype(int)
        return df

    def _write(self, table: str, df: pd.DataFrame):
        # Persist the DataFrame back to its CSV file
        df.to_csv(self._path(table), index=False)

    # ── Public API ─────────────────────────────────────────────────────────────

    def list(self, table: str):
        # Return every row in a table as a list of dicts
        if table not in TABLES:
            raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
        df = self._read(table)
        return {"table": table, "rows": df.to_dict(orient="records"), "total": len(df)}

    def add(self, table: str, col_a_val: int, col_b_val: int):
        # Insert a new row; reject if the exact pair already exists (prevents duplicates)
        if table not in TABLES:
            raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
        cols = self._cols(table)
        df = self._read(table)
        exists = ((df[cols[0]] == col_a_val) & (df[cols[1]] == col_b_val)).any()
        if exists:
            raise HTTPException(status_code=400,
                detail=f"Relation ({col_a_val}, {col_b_val}) already exists in {table}")
        new_row = pd.DataFrame([{cols[0]: col_a_val, cols[1]: col_b_val}])
        df = pd.concat([df, new_row], ignore_index=True)
        self._write(table, df)
        return {"success": True, "message": f"Relation added to {table}",
                "row": {cols[0]: col_a_val, cols[1]: col_b_val}}

    def delete(self, table: str, col_a_val: int, col_b_val: int):
        # Remove a specific pair; raise 404 if it doesn't exist
        if table not in TABLES:
            raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
        cols = self._cols(table)
        df = self._read(table)
        mask = (df[cols[0]] == col_a_val) & (df[cols[1]] == col_b_val)
        if not mask.any():
            raise HTTPException(status_code=404,
                detail=f"Relation ({col_a_val}, {col_b_val}) not found in {table}")
        df = df[~mask]
        self._write(table, df)
        return {"success": True, "message": f"Relation removed from {table}"}

    def delete_by_left(self, table: str, col_a_val: int):
        # Remove ALL rows where the left column matches — used when a patient is discharged
        # to wipe all their bed/doctor/nurse assignments at once
        if table not in TABLES:
            raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
        cols = self._cols(table)
        df = self._read(table)
        df = df[df[cols[0]] != col_a_val]
        self._write(table, df)
        return {"success": True}

    def delete_by_right(self, table: str, col_b_val: int):
        # Remove ALL rows where the right column matches — e.g. remove a doctor from all wards
        if table not in TABLES:
            raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
        cols = self._cols(table)
        df = self._read(table)
        df = df[df[cols[1]] != col_b_val]
        self._write(table, df)
        return {"success": True}

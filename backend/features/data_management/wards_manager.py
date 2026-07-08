# Handles CRUD for hospital wards stored in Wards.csv.
# A ward groups beds together and belongs to a department.

import pandas as pd
import os
import math
from fastapi import HTTPException
from features.relations.relations_manager import RelationsManager
from features.timestamp_utils import safe_read_csv

_COLS = ["ward_id", "ward_name", "department_id"]


def _safe_val(v):
    # Convert NaN to None so optional fields serialise cleanly
    if v is None:
        return None
    try:
        if math.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        pass
    return v


WARDS_FILE     = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "Wards.csv")
WARD_BED_FILE  = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "ward_bed.csv")


class WardsManager:
    """
    Manages hospital ward records stored in Wards.csv.

    CSV file managed:
      - Wards.csv : one row per ward, identified by an integer ward_id

    Key invariants:
      - Each ward belongs to a department (department_id).
      - Bed counts are not stored here; they are computed at read-time from
        ward_bed.csv so there is never a count/reality mismatch.
      - delete() cascade-removes all ward_bed, ward_doctor, and ward_nurse
        relation rows so no orphaned references remain after a ward is removed.
    """

    def __init__(self):
        self.file = WARDS_FILE

    def _require_file(self):
        if not os.path.exists(self.file):
            raise HTTPException(status_code=404, detail="Wards data file not found")

    def _read_df(self):
        self._require_file()
        df = safe_read_csv(self.file, _COLS)
        if df.empty:
            return df
        df["ward_id"]       = pd.to_numeric(df["ward_id"],       errors="coerce").fillna(0).astype(int)
        df["department_id"] = pd.to_numeric(df["department_id"], errors="coerce").fillna(0).astype(int)
        return df

    def _write_df(self, df):
        df.to_csv(self.file, index=False)

    def _row_to_dict(self, row):
        return {
            "ward_id":       int(row["ward_id"]),
            "ward_name":     str(row["ward_name"]),
            "department_id": int(row["department_id"])
        }

    def _ward_bed_counts(self) -> dict:
        # Count beds actually linked to each ward via ward_bed.csv
        if not os.path.exists(WARD_BED_FILE):
            return {}
        wb = pd.read_csv(WARD_BED_FILE)
        if wb.empty or "ward_id" not in wb.columns:
            return {}
        return wb.groupby("ward_id").size().to_dict()

    def get_all(self):
        df = self._read_df()
        counts = self._ward_bed_counts()
        wards = []
        for _, row in df.iterrows():
            d = self._row_to_dict(row)
            d["assigned_beds"] = counts.get(int(row["ward_id"]), 0)
            wards.append(d)
        return {"wards": wards, "total": len(wards)}

    def get_stats(self):
        # Aggregate: total wards, real assigned bed count from ward_bed.csv, distinct departments
        df = self._read_df()
        counts = self._ward_bed_counts()
        return {
            "total":         len(df),
            "assigned_beds": sum(counts.values()),
            "departments":   int(df["department_id"].nunique())
        }

    def add(self, ward_name, department_id):
        if not ward_name.strip():
            raise HTTPException(status_code=400, detail="Ward name is required")
        if department_id < 1:
            raise HTTPException(status_code=400, detail="Department ID must be a positive integer")
        df = self._read_df()
        new_id = int(df["ward_id"].max()) + 1 if len(df) > 0 else 1
        new_row = pd.DataFrame([{
            "ward_id": new_id, "ward_name": ward_name, "department_id": department_id
        }])
        df = pd.concat([df, new_row], ignore_index=True)
        self._write_df(df)
        return {
            "success": True,
            "message": f"Ward '{ward_name}' added successfully",
            "ward": {"ward_id": new_id, "ward_name": ward_name, "department_id": department_id}
        }

    def modify(self, ward_id, ward_name, department_id):
        if not ward_name.strip():
            raise HTTPException(status_code=400, detail="Ward name is required")
        if department_id < 1:
            raise HTTPException(status_code=400, detail="Department ID must be a positive integer")
        df = self._read_df()
        if ward_id not in df["ward_id"].values:
            raise HTTPException(status_code=404, detail=f"Ward {ward_id} not found")
        df.loc[df["ward_id"] == ward_id, "ward_name"]     = ward_name
        df.loc[df["ward_id"] == ward_id, "department_id"] = department_id
        self._write_df(df)
        return {
            "success": True,
            "message": f"Ward {ward_id} modified successfully",
            "ward": {"ward_id": ward_id, "ward_name": ward_name, "department_id": department_id}
        }

    def delete(self, ward_id):
        df = self._read_df()
        if ward_id not in df["ward_id"].values:
            raise HTTPException(status_code=404, detail=f"Ward {ward_id} not found")
        ward_name = str(df[df["ward_id"] == ward_id].iloc[0]["ward_name"])
        df = df[df["ward_id"] != ward_id]
        self._write_df(df)
        rel = RelationsManager()
        rel.delete_by_left("ward_bed",    ward_id)
        rel.delete_by_left("ward_doctor", ward_id)
        rel.delete_by_left("ward_nurse",  ward_id)
        return {"success": True, "message": f"Ward '{ward_name}' deleted successfully"}

# =============================================================================
# staff_management/nurses_manager.py — Nurses CSV Manager
# =============================================================================
#
# Handles all CRUD operations for nurse records stored in Nurses.csv.
# Mirrors DoctorsManager but uses role/group fields instead of intern_or_not/work_days.
#
# CSV file managed:
#   Nurses.csv — columns: id, role, shift, group, patientNB, availabilityTimeStart,
#                         name, absent
#
# KEY BEHAVIOURS:
#   update_patient_count — increments or decrements the patientNB counter for a
#                          specific nurse.  When the count drops to 0, the field
#                          availabilityTimeStart is stamped with the current time
#                          so the scheduler can give priority to the nurse who
#                          has been idle the longest (fairness-based scheduling).
#
#   dtype=object trick   — update_patient_count and toggle_absent read the CSV
#                          with pd.read_csv(..., dtype=object) so every value is
#                          already a Python string.  This prevents pandas from
#                          inferring float64 for all-NaN columns and then rejecting
#                          subsequent string assignments.
#
#   Relations cleanup    — delete() removes the nurse row and also removes all
#                          rows from patient_nurse.csv and ward_nurse.csv via
#                          RelationsManager so no orphaned references remain.
# =============================================================================

import pandas as pd
import os
import math
from datetime import datetime
from fastapi import HTTPException
from features.relations.relations_manager import RelationsManager
from features.timestamp_utils import safe_read_csv

_COLS = ["id","role","shift","group","patientNB","availabilityTimeStart"]


def _safe_val(v):
    # Convert pandas NaN to Python None for safe JSON serialisation
    if v is None:
        return None
    try:
        if math.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        pass
    return v

NURSES_FILE  = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "Nurses.csv")
VALID_ROLES  = ["PN", "RN", "Bed_Admission"]


class NursesManager:
    """
    Manages nurse records for HCopilot's staff management feature.

    CSV file managed:
      - Nurses.csv : one row per nurse, identified by an integer id

    Key invariants:
      - role must be exactly "PN", "RN", or "Bed_Admission" (enforced in add/modify).
      - group stores a group_id integer referencing Groups.csv (same rotation scheme
        as DoctorsManager.work_days).
      - patientNB (note: NB not Nb, unlike doctors) tracks the current patient load.
        Stored as a string for the same dtype-safety reason as DoctorsManager.
      - availabilityTimeStart is the ISO timestamp of when the nurse's last patient
        was discharged — used by the OR scheduler for fairness ordering.
      - absent is stored as the string "True"/"False" in the CSV.
    """

    def __init__(self):
        self.file = NURSES_FILE
        self._migrate_group_to_names()

    def _migrate_group_to_names(self):
        """One-time migration: convert integer group values to group name strings."""
        if not os.path.exists(self.file):
            return
        try:
            df = pd.read_csv(self.file, dtype=object)
            if df.empty or "group" not in df.columns:
                return
            def _looks_int(v):
                try:
                    int(str(v).strip())
                    return True
                except (ValueError, TypeError):
                    return False
            if not df["group"].apply(_looks_int).any():
                return
            groups_path = os.path.join(os.path.dirname(self.file), "Groups.csv")
            if not os.path.exists(groups_path):
                return
            gdf = pd.read_csv(groups_path, dtype=str)
            id_to_name = {str(int(float(r["group_id"]))): str(r["name"]).strip()
                          for _, r in gdf.iterrows()}
            df["group"] = df["group"].apply(
                lambda v: id_to_name.get(str(int(float(str(v).strip()))), str(v).strip())
                if _looks_int(v) else str(v).strip()
            )
            df.to_csv(self.file, index=False)
        except Exception:
            pass

    def _require_file(self):
        # Raise 404 early if the CSV hasn't been created yet
        if not os.path.exists(self.file):
            raise HTTPException(status_code=404, detail="Nurses data file not found")

    def _normalize_df(self, df):
        for col in ("patientNB", "availabilityTimeStart", "name"):
            if col not in df.columns:
                df[col] = None
            df[col] = df[col].astype(object)
        if "absent" not in df.columns:
            df["absent"] = False
        return df

    def _read_df(self):
        self._require_file()
        df = safe_read_csv(self.file, _COLS)
        if df.empty:
            return df
        df = self._normalize_df(df)
        df["id"] = df["id"].astype(int)
        return df

    def _write_df(self, df):
        df.to_csv(self.file, index=False)

    def _row_to_dict(self, row):
        absent_raw = row.get("absent", False)
        absent = str(absent_raw).strip().lower() in ("true", "1", "yes")
        return {
            "id":    int(row["id"]),
            "name":  _safe_val(row.get("name")),
            "role":  str(row["role"]),
            "shift": str(row["shift"]),
            "group": str(row["group"]).strip(),
            "absent": absent,
            "patientNB": _safe_val(row.get("patientNB")),
            "availabilityTimeStart": _safe_val(row.get("availabilityTimeStart"))
        }

    def get_all(self):
        # Return every nurse record
        df = self._read_df()
        nurses = [self._row_to_dict(row) for _, row in df.iterrows()]
        return {"nurses": nurses, "total": len(nurses)}

    def get_stats(self):
        # Return aggregate counts broken down by role, shift, and group
        df = self._read_df()
        return {
            "total":         len(df),
            "pn":            int(len(df[df["role"] == "PN"])),
            "rn":            int(len(df[df["role"] == "RN"])),
            "bed_admission": int(len(df[df["role"] == "Bed_Admission"])),
            "morning":       int(len(df[df["shift"] == "morning"])),
            "night":         int(len(df[df["shift"] == "night"])),
            "group1":        int(len(df[df["group"].astype(str).str.strip() == "Group 1"])),
            "group2":        int(len(df[df["group"].astype(str).str.strip() == "Group 2"]))
        }

    def add(self, role, shift, group, patientNB=None, availabilityTimeStart=None, name=None):
        """
        Append a new nurse record to Nurses.csv.

        The new record receives the next available integer id.  absent defaults to
        False for all new records.

        Args:
            role                  : str — "PN", "RN", or "Bed_Admission"
            shift                 : str — shift name (e.g. "morning", "night")
            group                 : int — group_id referencing Groups.csv
            patientNB             : str or None — initial patient count (usually None)
            availabilityTimeStart : str or None — ISO datetime string (usually None)
            name                  : str or None — display name

        Returns:
            dict with success, message, and the created nurse record

        Raises:
            HTTPException(400) : if role is not in VALID_ROLES
        """
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role must be one of {VALID_ROLES}")

        df = self._read_df()
        new_id = int(df["id"].max()) + 1 if len(df) > 0 else 1
        new_row = pd.DataFrame([{
            "id": new_id, "name": name, "role": role, "shift": shift, "group": group,
            "absent": False, "patientNB": patientNB, "availabilityTimeStart": availabilityTimeStart
        }])
        df = pd.concat([df, new_row], ignore_index=True)
        self._write_df(df)

        return {"success": True, "message": "Nurse added successfully",
                "nurse": {"id": new_id, "name": name, "role": role, "shift": shift,
                          "group": group, "absent": False,
                          "patientNB": patientNB, "availabilityTimeStart": availabilityTimeStart}}

    def modify(self, id_, role, shift, group, patientNB=None, availabilityTimeStart=None, name=None):
        """
        Overwrite all mutable fields of an existing nurse record.

        Args:
            id_                   : int — the nurse to update
            role                  : str — "PN", "RN", or "Bed_Admission"
            shift                 : str — shift name
            group                 : int — group_id
            patientNB             : str or None — patient count (None clears it)
            availabilityTimeStart : str or None — ISO datetime (None clears it)
            name                  : str or None — display name

        Returns:
            dict with success, message, and the updated nurse record

        Raises:
            HTTPException(400) : if role is not in VALID_ROLES
            HTTPException(404) : if id_ does not exist in Nurses.csv
        """
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role must be one of {VALID_ROLES}")

        df = self._read_df()
        if id_ not in df["id"].values:
            raise HTTPException(status_code=404, detail=f"Nurse ID {id_} not found")

        df.loc[df["id"] == id_, "name"]                  = name
        df.loc[df["id"] == id_, "role"]                  = role
        df.loc[df["id"] == id_, "shift"]                 = shift
        df.loc[df["id"] == id_, "group"]                 = group
        df.loc[df["id"] == id_, "patientNB"]             = patientNB
        df.loc[df["id"] == id_, "availabilityTimeStart"] = availabilityTimeStart
        self._write_df(df)

        return {"success": True, "message": f"Nurse {id_} modified successfully",
                "nurse": {"id": id_, "name": name, "role": role, "shift": shift,
                          "group": group, "patientNB": patientNB,
                          "availabilityTimeStart": availabilityTimeStart}}

    def toggle_absent(self, id_: int):
        """
        Flip the absent flag for a nurse between True and False.

        Absent nurses are excluded from shift-based scheduling suggestions and
        OR algorithm outputs for the current shift.  The flag is stored as the
        string "True" or "False" in the CSV.

        Uses dtype=object when reading to prevent pandas from inferring bool or
        int types that would interfere with the string-based toggle logic.

        Args:
            id_ : int — the nurse whose absent flag should be toggled

        Returns:
            dict with success, id, and new absent value (bool)

        Raises:
            HTTPException(404) : if id_ does not exist in Nurses.csv
        """
        df = pd.read_csv(self.file, dtype=object)
        if "absent" not in df.columns:
            df["absent"] = "False"
        mask = df["id"].astype(int) == id_
        if not mask.any():
            raise HTTPException(status_code=404, detail=f"Nurse ID {id_} not found")
        current = str(df.loc[mask, "absent"].iloc[0]).strip().lower() in ("true", "1", "yes")
        df.loc[mask, "absent"] = str(not current)
        df.to_csv(self.file, index=False)
        return {"success": True, "id": id_, "absent": not current}

    def update_patient_count(self, nurse_id: int, delta: int):
        """
        Increment or decrement the patientNB counter for a nurse by delta.

        When the new count reaches 0, availabilityTimeStart is stamped with the
        current datetime so the OR scheduler can prioritise nurses who have been
        free the longest (fairness ordering).  When delta is positive (patient
        assigned), availabilityTimeStart is cleared.

        Read with dtype=object so every column is already a string — this is the only
        reliable way to avoid "Invalid value for dtype float64" across all pandas versions,
        because all-NaN columns load as float64 and reject string assignment regardless
        of later astype(object) calls on the Series.

        Silently returns if the CSV does not exist or nurse_id is not found, so
        callers do not need to guard against missing nurses during bulk operations.

        Args:
            nurse_id : int — the nurse whose count to update
            delta    : int — positive to increment (patient assigned),
                              negative to decrement (patient discharged)
        """
        if not os.path.exists(self.file):
            return
        df = pd.read_csv(self.file, dtype=object)
        mask = df["id"].astype(str) == str(nurse_id)
        if not mask.any():
            return
        raw = df.loc[mask, "patientNB"].iloc[0]
        try:
            current = int(float(raw)) if str(raw).strip() not in ("", "nan", "None") else 0
        except (ValueError, TypeError):
            current = 0
        new_count = max(0, current + delta)
        df.loc[mask, "patientNB"] = str(new_count) if new_count > 0 else ""
        df.loc[mask, "availabilityTimeStart"] = (
            datetime.now().strftime("%Y-%m-%dT%H:%M") if new_count == 0 else ""
        )
        self._write_df(df)

    def delete(self, id_):
        """
        Remove a nurse record by ID and clean up all associated relation rows.

        After deleting the row from Nurses.csv, this method removes all rows
        that reference this nurse_id from:
          - patient_nurse.csv  (via RelationsManager.delete_by_right)
          - ward_nurse.csv     (via RelationsManager.delete_by_right)

        Args:
            id_ : int — the nurse to delete

        Returns:
            dict with success and message keys

        Raises:
            HTTPException(404) : if id_ does not exist in Nurses.csv
        """
        # Remove a nurse row by ID
        df = self._read_df()
        if id_ not in df["id"].values:
            raise HTTPException(status_code=404, detail=f"Nurse ID {id_} not found")

        df = df[df["id"] != id_]
        self._write_df(df)
        rel = RelationsManager()
        rel.delete_by_right("patient_nurse", id_)
        rel.delete_by_right("ward_nurse",    id_)
        return {"success": True, "message": f"Nurse {id_} deleted successfully"}

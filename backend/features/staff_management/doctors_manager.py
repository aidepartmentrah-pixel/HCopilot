# =============================================================================
# staff_management/doctors_manager.py — Doctors / Interns CSV Manager
# =============================================================================
#
# Handles all CRUD operations for doctor and intern records stored in Doctors.csv.
#
# CSV file managed:
#   Doctors.csv  — columns: id, intern_or_not, shift, work_days, patientNb,
#                           availabilityTimeStart, name, absent
#
# KEY BEHAVIOURS:
#   update_patient_count  — increments or decrements the patientNb counter for a
#                           specific doctor.  When the count drops to 0, the field
#                           availabilityTimeStart is stamped with the current time
#                           so the scheduler can give priority to the doctor who
#                           has been idle the longest (fairness-based scheduling).
#
#   dtype=object trick    — update_patient_count and toggle_absent both read the CSV
#                           with pd.read_csv(..., dtype=object) so every value is
#                           already a Python string.  This is required because when
#                           patientNb or availabilityTimeStart are all-NaN for every
#                           row, pandas infers float64 for those columns; subsequent
#                           string assignments then raise "Invalid value for dtype
#                           float64".  Loading as object bypasses that inference.
#
#   Relations cleanup     — delete() removes the doctor row and also removes all
#                           rows from patient_doctor.csv and ward_doctor.csv via
#                           RelationsManager so no orphaned references remain.
# =============================================================================

import pandas as pd
import os
import math
from datetime import datetime
from fastapi import HTTPException
from features.relations.relations_manager import RelationsManager
from features.timestamp_utils import safe_read_csv

_COLS = ["id","intern_or_not","shift","work_days","patientNb","availabilityTimeStart"]


def _safe_val(v):
    # Convert pandas NaN/float-NaN to Python None so JSON serialisation doesn't break
    if v is None:
        return None
    try:
        if math.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        pass
    return v


DOCTORS_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "Doctors.csv")
VALID_TYPES  = ["doctor", "intern"]


class DoctorsManager:
    """
    Manages doctor and intern records for HCopilot's staff management feature.

    CSV file managed:
      - Doctors.csv : one row per doctor/intern, identified by an integer id

    Key invariants:
      - intern_or_not must be exactly "doctor" or "intern" (enforced in add/modify).
      - work_days stores a group_id integer that references Groups.csv (not a raw
        weekday list); the name "work_days" is a legacy label from before rotation
        groups were formalised.
      - patientNb tracks the number of patients currently assigned to this doctor.
        It is stored as a string (empty string for 0) rather than an integer because
        the column can be all-NaN when no doctor has any patients, and pandas would
        then infer float64, making later integer writes unsafe.
      - availabilityTimeStart is the ISO timestamp of when the doctor's last patient
        was discharged.  Used by the scheduler for fairness ordering.
      - absent is a boolean flag written as the string "True" / "False" in the CSV.
    """

    def __init__(self):
        self.file = DOCTORS_FILE
        self._migrate_group_to_names()

    def _migrate_group_to_names(self):
        """One-time migration: convert integer work_days values to group name strings."""
        if not os.path.exists(self.file):
            return
        try:
            df = pd.read_csv(self.file, dtype=object)
            if df.empty or "work_days" not in df.columns:
                return
            def _looks_int(v):
                try:
                    int(str(v).strip())
                    return True
                except (ValueError, TypeError):
                    return False
            if not df["work_days"].apply(_looks_int).any():
                return
            groups_path = os.path.join(os.path.dirname(self.file), "Groups.csv")
            if not os.path.exists(groups_path):
                return
            gdf = pd.read_csv(groups_path, dtype=str)
            id_to_name = {str(int(float(r["group_id"]))): str(r["name"]).strip()
                          for _, r in gdf.iterrows()}
            df["work_days"] = df["work_days"].apply(
                lambda v: id_to_name.get(str(int(float(str(v).strip()))), str(v).strip())
                if _looks_int(v) else str(v).strip()
            )
            df.to_csv(self.file, index=False)
        except Exception:
            pass

    def _require_file(self):
        # Raise a 404 early if the CSV doesn't exist yet
        if not os.path.exists(self.file):
            raise HTTPException(status_code=404, detail="Doctors data file not found")

    def _normalize_df(self, df):
        # Force optional columns to object dtype so mixed NaN/string rows are safe to write.
        # Without this, a column that is currently all-NaN would remain float64 after
        # reading, and assigning a string value to any cell would raise a dtype error.
        for col in ("patientNb", "availabilityTimeStart", "name"):
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
        # Persist the DataFrame back to the CSV file
        df.to_csv(self.file, index=False)

    def _row_to_dict(self, row):
        absent_raw = row.get("absent", False)
        absent = str(absent_raw).strip().lower() in ("true", "1", "yes")
        return {
            "id": int(row["id"]),
            "name": _safe_val(row.get("name")),
            "intern_or_not": str(row["intern_or_not"]),
            "shift": str(row["shift"]),
            "work_days": str(row["work_days"]).strip(),
            "absent": absent,
            "patientNb": _safe_val(row.get("patientNb")),
            "availabilityTimeStart": _safe_val(row.get("availabilityTimeStart"))
        }

    def get_all(self):
        """
        Return every doctor and intern record from Doctors.csv.

        Returns:
            dict with keys:
              - doctors : list of doctor record dicts
              - total   : total number of records
        """
        # Return every doctor/intern record
        df = self._read_df()
        doctors = [self._row_to_dict(row) for _, row in df.iterrows()]
        return {"doctors": doctors, "total": len(doctors)}

    def get_stats(self):
        """
        Return aggregate counts broken down by type, shift, and rotation group.

        Returns:
            dict with keys: total, doctors, interns, morning, night, group1, group2
        """
        # Return aggregate counts broken down by type, shift, and group
        df = self._read_df()
        return {
            "total":   len(df),
            "doctors": int(len(df[df["intern_or_not"] == "doctor"])),
            "interns": int(len(df[df["intern_or_not"] == "intern"])),
            "morning": int(len(df[df["shift"] == "morning"])),
            "night":   int(len(df[df["shift"] == "night"])),
            "group1":  int(len(df[df["work_days"].astype(str).str.strip() == "Group 1"])),
            "group2":  int(len(df[df["work_days"].astype(str).str.strip() == "Group 2"]))
        }

    def add(self, intern_or_not, shift, work_days, patientNb=None, availabilityTimeStart=None, name=None):
        """
        Append a new doctor or intern record to Doctors.csv.

        The new record receives the next available integer id (max existing id + 1,
        or 1 if the file is empty).  absent defaults to False for all new records.

        Args:
            intern_or_not         : str — "doctor" or "intern"
            shift                 : str — name of the shift (e.g. "morning", "night")
            work_days             : int — group_id referencing Groups.csv
            patientNb             : str or None — initial patient count (usually None)
            availabilityTimeStart : str or None — ISO datetime string (usually None)
            name                  : str or None — display name

        Returns:
            dict with success, message, and the created doctor record

        Raises:
            HTTPException(400) : if intern_or_not is not in VALID_TYPES
        """
        if intern_or_not not in VALID_TYPES:
            raise HTTPException(status_code=400, detail=f"Type must be one of {VALID_TYPES}")

        df = self._read_df()
        new_id = int(df["id"].max()) + 1 if len(df) > 0 else 1
        new_row = pd.DataFrame([{
            "id": new_id, "name": name, "intern_or_not": intern_or_not,
            "shift": shift, "work_days": work_days, "absent": False,
            "patientNb": patientNb, "availabilityTimeStart": availabilityTimeStart
        }])
        df = pd.concat([df, new_row], ignore_index=True)
        self._write_df(df)

        return {
            "success": True, "message": "Doctor/Intern added successfully",
            "doctor": {"id": new_id, "name": name, "intern_or_not": intern_or_not,
                       "shift": shift, "work_days": work_days, "absent": False,
                       "patientNb": patientNb, "availabilityTimeStart": availabilityTimeStart}
        }

    def modify(self, id_, intern_or_not, shift, work_days, patientNb=None, availabilityTimeStart=None, name=None):
        """
        Overwrite all mutable fields of an existing doctor record.

        Args:
            id_                   : int — the doctor to update
            intern_or_not         : str — "doctor" or "intern"
            shift                 : str — shift name
            work_days             : int — group_id
            patientNb             : str or None — patient count (None clears it)
            availabilityTimeStart : str or None — ISO datetime (None clears it)
            name                  : str or None — display name

        Returns:
            dict with success, message, and the updated doctor record

        Raises:
            HTTPException(400) : if intern_or_not is not in VALID_TYPES
            HTTPException(404) : if id_ does not exist in Doctors.csv
        """
        if intern_or_not not in VALID_TYPES:
            raise HTTPException(status_code=400, detail=f"Type must be one of {VALID_TYPES}")

        df = self._read_df()
        if id_ not in df["id"].values:
            raise HTTPException(status_code=404, detail=f"Doctor ID {id_} not found")

        df.loc[df["id"] == id_, "name"]                  = name
        df.loc[df["id"] == id_, "intern_or_not"]         = intern_or_not
        df.loc[df["id"] == id_, "shift"]                 = shift
        df.loc[df["id"] == id_, "work_days"]             = work_days
        df.loc[df["id"] == id_, "patientNb"]             = patientNb
        df.loc[df["id"] == id_, "availabilityTimeStart"] = availabilityTimeStart
        self._write_df(df)

        return {"success": True, "message": f"Doctor {id_} modified successfully",
                "doctor": {"id": id_, "name": name, "intern_or_not": intern_or_not,
                           "shift": shift, "work_days": work_days,
                           "patientNb": patientNb, "availabilityTimeStart": availabilityTimeStart}}

    def toggle_absent(self, id_: int):
        """
        Flip the absent flag for a doctor between True and False.

        Absent doctors are excluded from shift-based scheduling suggestions and
        OR algorithm outputs for the current shift.  The flag is stored as the
        string "True" or "False" in the CSV.

        Uses dtype=object when reading to prevent pandas from inferring bool or
        int types that would interfere with string-based toggle logic.

        Args:
            id_ : int — the doctor whose absent flag should be toggled

        Returns:
            dict with success, id, and new absent value (bool)

        Raises:
            HTTPException(404) : if id_ does not exist in Doctors.csv
        """
        df = pd.read_csv(self.file, dtype=object)
        if "absent" not in df.columns:
            df["absent"] = "False"
        mask = df["id"].astype(int) == id_
        if not mask.any():
            raise HTTPException(status_code=404, detail=f"Doctor ID {id_} not found")
        current = str(df.loc[mask, "absent"].iloc[0]).strip().lower() in ("true", "1", "yes")
        df.loc[mask, "absent"] = str(not current)
        df.to_csv(self.file, index=False)
        return {"success": True, "id": id_, "absent": not current}

    def update_patient_count(self, doctor_id: int, delta: int):
        """
        Increment or decrement the patientNb counter for a doctor by delta.

        When the new count reaches 0, availabilityTimeStart is stamped with the
        current datetime so the scheduler can prioritise doctors who have been
        free the longest (fairness ordering).  When delta is positive (patient
        assigned), availabilityTimeStart is cleared.

        Read with dtype=object so every column is already a string — this is the only
        reliable way to avoid "Invalid value for dtype float64" across all pandas versions,
        because all-NaN columns load as float64 and reject string assignment regardless
        of later astype(object) calls on the Series.

        Silently returns if the CSV file does not exist or doctor_id is not found,
        so callers do not need to guard against missing doctors during bulk operations.

        Args:
            doctor_id : int — the doctor whose count to update
            delta     : int — positive to increment (patient assigned),
                               negative to decrement (patient discharged)
        """
        # Increment or decrement patientNb by delta.
        # When the count drops to 0, stamp availabilityTimeStart with the current time.
        # Read with dtype=object so every column is already a string — this is the only
        # reliable way to avoid "Invalid value for dtype float64" across all pandas versions,
        # because all-NaN columns load as float64 and reject string assignment regardless
        # of later astype(object) calls on the Series.
        if not os.path.exists(self.file):
            return
        df = pd.read_csv(self.file, dtype=object)
        mask = df["id"].astype(str) == str(doctor_id)
        if not mask.any():
            return
        raw = df.loc[mask, "patientNb"].iloc[0]
        try:
            current = int(float(raw)) if str(raw).strip() not in ("", "nan", "None") else 0
        except (ValueError, TypeError):
            current = 0
        new_count = max(0, current + delta)
        df.loc[mask, "patientNb"] = str(new_count) if new_count > 0 else ""
        df.loc[mask, "availabilityTimeStart"] = (
            datetime.now().strftime("%Y-%m-%dT%H:%M") if new_count == 0 else ""
        )
        self._write_df(df)

    def delete(self, id_):
        """
        Remove a doctor record by ID and clean up all associated relation rows.

        After deleting the row from Doctors.csv, this method removes all rows
        that reference this doctor_id from:
          - patient_doctor.csv  (via RelationsManager.delete_by_right)
          - ward_doctor.csv     (via RelationsManager.delete_by_right)

        Args:
            id_ : int — the doctor to delete

        Returns:
            dict with success and message keys

        Raises:
            HTTPException(404) : if id_ does not exist in Doctors.csv
        """
        # Remove a doctor row by ID
        df = self._read_df()
        if id_ not in df["id"].values:
            raise HTTPException(status_code=404, detail=f"Doctor ID {id_} not found")

        df = df[df["id"] != id_]
        self._write_df(df)
        rel = RelationsManager()
        rel.delete_by_right("patient_doctor", id_)
        rel.delete_by_right("ward_doctor",    id_)
        return {"success": True, "message": f"Doctor {id_} deleted successfully"}

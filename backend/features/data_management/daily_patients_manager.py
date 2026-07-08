# Manages the DailyPatients.csv file — the live list of patients currently in the ED.
# Rows are moved to LogPatients.csv on discharge; this file holds only active stays.

import pandas as pd
import os
import math
from fastapi import HTTPException
from features.relations.relations_manager import RelationsManager
from features.staff_management.doctors_manager import DoctorsManager
from features.staff_management.nurses_manager import NursesManager
from features.timestamp_utils import safe_read_csv

_COLS = ["subject_id","stay_id","name","gender","age","temperature","heartrate","resprate",
         "o2sat","sbp","dbp","pain","acuity","chiefcomplaint",
         "arrival_time","departure_time","bed_occupation_time"]


def _safe_val(v):
    # Turn pandas NaN / float-NaN into None for clean JSON output
    if v is None:
        return None
    try:
        if math.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        pass
    return v


DAILY_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "DailyPatients.csv")


class DailyPatientsManager:
    """Manages DailyPatients.csv — the live roster of patients currently in the ED.

    CSV file managed:
        backend/datasets/DailyPatients.csv

    Key invariants:
        - Each row represents one active patient stay; stay_id is the primary key.
        - A patient (subject_id) should have at most one active stay at a time;
          this constraint is enforced at the PatientManager level (a subclass).
        - On discharge the row is copied to LogPatients.csv and then removed here.
        - delete() clears all relation links (patient_bed, patient_doctor,
          patient_nurse) and decrements staff patient counts in the same call.
        - Timestamp columns (arrival_time, departure_time, bed_occupation_time)
          are forced to object dtype on every read so that string values can be
          written back even when the column was entirely NaN on load — pandas
          infers float64 for all-NaN columns, which rejects string assignment.
    """

    def __init__(self):
        self.file = DAILY_FILE

    def _require_file(self):
        # Raise 404 if the CSV hasn't been created yet
        if not os.path.exists(self.file):
            raise HTTPException(status_code=404, detail="DailyPatients data file not found")

    def _read_df(self):
        # Load the CSV and ensure the two ID columns are integers.
        # Timestamp columns are forced to object so that string assignment never
        # raises "Invalid value for dtype float64" — all-NaN columns load as float64
        # by default, which rejects string values even after astype(object) on the Series.
        self._require_file()
        df = safe_read_csv(self.file, _COLS)
        if df.empty:
            return df
        df["subject_id"] = df["subject_id"].astype(int)
        df["stay_id"]    = df["stay_id"].astype(int)
        for col in ("arrival_time", "departure_time", "bed_occupation_time"):
            if col in df.columns:
                df[col] = df[col].astype(object)
        return df

    def _write_df(self, df):
        # Persist the in-memory DataFrame back to the CSV file; called after every mutation
        df.to_csv(self.file, index=False)

    def _row_to_dict(self, row):
        # Serialise a DataFrame row to a JSON-safe dict with all clinical fields
        return {
            "subject_id":          int(row["subject_id"]),
            "stay_id":             int(row["stay_id"]),
            "name":                _safe_val(row.get("name")),
            "gender":              _safe_val(row.get("gender")),
            "age":                 _safe_val(row.get("age")),
            "arrival_time":        _safe_val(row.get("arrival_time")),
            "departure_time":      _safe_val(row.get("departure_time")),
            "bed_occupation_time": _safe_val(row.get("bed_occupation_time")),
            "temperature":         _safe_val(row.get("temperature")),
            "heartrate":           _safe_val(row.get("heartrate")),
            "resprate":            _safe_val(row.get("resprate")),
            "o2sat":               _safe_val(row.get("o2sat")),
            "sbp":                 _safe_val(row.get("sbp")),
            "dbp":                 _safe_val(row.get("dbp")),
            "pain":                _safe_val(row.get("pain")),
            "acuity":              _safe_val(row.get("acuity")),
            "chiefcomplaint":      _safe_val(row.get("chiefcomplaint"))
        }

    def get_all(self):
        """Return every active patient stay as a list of JSON-safe dicts.

        Returns:
            dict: {"patients": [<row_dict>, ...], "total": <count>}

        Raises:
            HTTPException 404: If DailyPatients.csv does not exist.
        """
        # Return every active patient stay
        df = self._read_df()
        patients = [self._row_to_dict(row) for _, row in df.iterrows()]
        return {"patients": patients, "total": len(patients)}

    def get_stats(self):
        """Return summary counts for the active patient roster.

        Returns:
            dict: {"total": <row count>, "unique_subjects": <distinct patient count>}

        Raises:
            HTTPException 404: If DailyPatients.csv does not exist.
        """
        # Summary counts — total rows and how many unique patients are present
        df = self._read_df()
        return {
            "total":            len(df),
            "unique_subjects":  int(df["subject_id"].nunique())
        }

    def add(self, subject_id, stay_id, arrival_time=None, departure_time=None, bed_occupation_time=None,
            temperature=None, heartrate=None, resprate=None,
            o2sat=None, sbp=None, dbp=None, pain=None, acuity=None, chiefcomplaint=None,
            name=None, gender=None, age=None):
        """Insert a new active patient stay row.

        Args:
            subject_id: Patient identifier (stored as subject_id in the CSV).
            stay_id: Primary key of the stay; must not already exist in the file.
            arrival_time: ISO-format timestamp string, or None.
            departure_time: ISO-format timestamp string, or None (typically None on admission).
            bed_occupation_time: ISO-format timestamp string, or None.
            temperature: Body temperature in °C, or None.
            heartrate: Heart rate in bpm, or None.
            resprate: Respiratory rate in breaths/min, or None.
            o2sat: Oxygen saturation percentage (0–100), or None.
            sbp: Systolic blood pressure in mmHg, or None.
            dbp: Diastolic blood pressure in mmHg, or None.
            pain: Pain description string, or None.
            acuity: ESI triage level 1–5, or None.
            chiefcomplaint: Chief complaint text, or None.
            name: Patient name, or None.
            gender: Patient gender string, or None.
            age: Patient age in years, or None.

        Returns:
            dict: {"success": True, "message": ...}

        Raises:
            HTTPException 400: If stay_id already exists in the file.
            HTTPException 404: If DailyPatients.csv does not exist.
        """
        # Insert a new patient stay; reject duplicate stay_ids to prevent double-entries
        df = self._read_df()
        if stay_id in df["stay_id"].values:
            raise HTTPException(status_code=400, detail=f"Stay ID {stay_id} already exists")
        # Ensure datetime columns exist and accept strings even when the file had all-NaN floats
        for col in ("arrival_time", "departure_time", "bed_occupation_time"):
            if col not in df.columns:
                df[col] = None
            df[col] = df[col].astype(object)
        new_row = pd.DataFrame([{
            "subject_id": subject_id, "stay_id": stay_id,
            "name": name, "gender": gender, "age": age,
            "arrival_time": arrival_time, "departure_time": departure_time,
            "bed_occupation_time": bed_occupation_time,
            "temperature": temperature, "heartrate": heartrate, "resprate": resprate,
            "o2sat": o2sat, "sbp": sbp, "dbp": dbp,
            "pain": pain, "acuity": acuity, "chiefcomplaint": chiefcomplaint
        }])
        df = pd.concat([df, new_row], ignore_index=True)
        self._write_df(df)
        return {"success": True, "message": f"Patient stay {stay_id} added successfully"}

    def modify(self, stay_id, subject_id, arrival_time=None, departure_time=None, bed_occupation_time=None,
               temperature=None, heartrate=None, resprate=None,
               o2sat=None, sbp=None, dbp=None, pain=None, acuity=None, chiefcomplaint=None,
               name=None, gender=None, age=None):
        """Update every field of an existing active patient stay.

        Args:
            stay_id: Primary key of the stay to update.
            subject_id: New (or same) patient identifier.
            (remaining args): Clinical and demographic fields — see add() for descriptions.

        Returns:
            dict: {"success": True, "message": ...}

        Raises:
            HTTPException 404: If stay_id does not exist in DailyPatients.csv.
        """
        # Update every field of an existing stay identified by stay_id
        df = self._read_df()
        if stay_id not in df["stay_id"].values:
            raise HTTPException(status_code=404, detail=f"Stay ID {stay_id} not found")
        for col in ("arrival_time", "departure_time", "bed_occupation_time"):
            if col not in df.columns:
                df[col] = None
            df[col] = df[col].astype(object)
        for col, val in [
            ("subject_id", subject_id), ("name", name), ("gender", gender), ("age", age),
            ("arrival_time", arrival_time), ("departure_time", departure_time),
            ("bed_occupation_time", bed_occupation_time),
            ("temperature", temperature), ("heartrate", heartrate),
            ("resprate", resprate), ("o2sat", o2sat), ("sbp", sbp), ("dbp", dbp),
            ("pain", pain), ("acuity", acuity), ("chiefcomplaint", chiefcomplaint)
        ]:
            df.loc[df["stay_id"] == stay_id, col] = val
        self._write_df(df)
        return {"success": True, "message": f"Patient stay {stay_id} modified successfully"}

    def mark_unurgent(self, stay_id: int):
        """Flag a patient stay as non-urgent so the OR scheduler skips it.

        Sets the 'unurgent' column to the string "True" on the matching row.
        The column is created with object dtype on first use so that string values
        can be assigned even when no prior rows exist — pandas would otherwise
        infer float64 for an all-None column, which rejects string assignment.

        Args:
            stay_id: Primary key of the active stay to flag.

        Returns:
            dict: {"success": True, "stay_id": <stay_id>}

        Raises:
            HTTPException 404: If stay_id does not exist.
        """
        df = self._read_df()
        if stay_id not in df["stay_id"].values:
            raise HTTPException(status_code=404, detail=f"Stay ID {stay_id} not found")
        if "unurgent" not in df.columns:
            df["unurgent"] = None
        df["unurgent"] = df["unurgent"].astype(object)
        df.loc[df["stay_id"] == stay_id, "unurgent"] = "True"
        self._write_df(df)
        return {"success": True, "stay_id": stay_id}

    def get_unurgent(self):
        """Return all active stays that have been flagged as non-urgent.

        Non-urgent stays have unurgent == "True" (stored as a string in the CSV).
        The comparison strips whitespace and is case-insensitive to handle minor
        CSV inconsistencies (e.g. capitalisation differences).

        Returns:
            dict: {"patients": [...], "total": <count>}

        Raises:
            HTTPException 404: If DailyPatients.csv does not exist.
        """
        df = self._read_df()
        if "unurgent" not in df.columns:
            return {"patients": [], "total": 0}
        mask = df["unurgent"].astype(str).str.strip().str.lower() == "true"
        patients = [self._row_to_dict(row) for _, row in df[mask].iterrows()]
        return {"patients": patients, "total": len(patients)}

    def delete(self, stay_id):
        """Hard-delete an active stay and clean up all its associations.

        Steps performed within a single method call:
          1. Remove the stay row from DailyPatients.csv.
          2. Read linked doctor and nurse IDs before wiping relation rows.
          3. Delete patient_doctor, patient_nurse, and patient_bed relation rows
             via RelationsManager.delete_by_left().
          4. Decrement the patient_count on each previously linked doctor/nurse.

        The linked IDs must be captured before deletion because delete_by_left()
        removes all rows for the patient — reading afterwards would yield nothing.

        Args:
            stay_id: Primary key of the active stay to delete.

        Returns:
            dict: {"success": True, "message": ...}

        Raises:
            HTTPException 404: If stay_id does not exist.
        """
        # Hard-delete a stay row from the daily patients file
        df = self._read_df()
        if stay_id not in df["stay_id"].values:
            raise HTTPException(status_code=404, detail=f"Stay ID {stay_id} not found")
        patient_id = int(df.loc[df["stay_id"] == stay_id, "subject_id"].iloc[0])
        df = df[df["stay_id"] != stay_id]
        self._write_df(df)
        rel = RelationsManager()
        doc_df = rel._read("patient_doctor")
        nur_df = rel._read("patient_nurse")
        # Capture linked IDs before wiping relations so counts can be decremented correctly
        linked_doctors = doc_df[doc_df["patient_id"] == patient_id]["doctor_id"].tolist() if len(doc_df) else []
        linked_nurses  = nur_df[nur_df["patient_id"] == patient_id]["nurse_id"].tolist()  if len(nur_df) else []
        rel.delete_by_left("patient_doctor", patient_id)
        rel.delete_by_left("patient_nurse",  patient_id)
        rel.delete_by_left("patient_bed",    patient_id)
        docs = DoctorsManager()
        nurs = NursesManager()
        for doc_id in linked_doctors:
            docs.update_patient_count(int(doc_id), -1)
        for nur_id in linked_nurses:
            nurs.update_patient_count(int(nur_id), -1)
        return {"success": True, "message": f"Patient stay {stay_id} deleted successfully"}

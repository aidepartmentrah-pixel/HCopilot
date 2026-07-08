# Manages LogPatients.csv — the archive of all discharged patient stays.
# Rows arrive here from DailyPatients when a patient is discharged; this file is append-only.

import pandas as pd
import math
import os
from fastapi import HTTPException
from features.relations.relations_manager import RelationsManager
from features.staff_management.doctors_manager import DoctorsManager
from features.staff_management.nurses_manager import NursesManager

LOG_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "LogPatients.csv")

# Canonical column order for the log file — must stay consistent across appends.
# Only these columns are written by append(), acting as a schema guard that prevents
# extra columns from DailyPatients (e.g. 'unurgent') from polluting the archive.
COLUMNS = [
    'subject_id', 'stay_id', 'name', 'gender', 'age',
    'temperature', 'heartrate', 'resprate',
    'o2sat', 'sbp', 'dbp', 'pain', 'acuity', 'chiefcomplaint',
    'arrival_time', 'departure_time', 'bed_occupation_time'
]


def _safe(v):
    # Convert NaN to None for JSON-safe serialisation
    if v is None:
        return None
    try:
        if math.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        pass
    return v


class LogPatientsManager:
    """Manages LogPatients.csv — the permanent archive of all discharged patient stays.

    CSV file managed:
        backend/datasets/LogPatients.csv

    Key invariants:
        - The file is created automatically on first use (_ensure_file).
        - append() is the primary write path: called once per discharge and guards
          the schema by writing only COLUMNS keys, ignoring any extra fields
          (such as 'unurgent') that may exist on the source DailyPatients row.
        - delete() clears lingering relation links for the patient; in normal
          operation those links are already gone by discharge time, so this is a
          safety net for out-of-order or manual deletions.
        - modify() performs a partial update — only non-None values are written,
          so callers can update a single field without blanking the others.
        - _save_df() raises HTTPException 423 (Locked) instead of a bare
          PermissionError so that Windows users get a helpful "close Excel" message.
    """

    def _ensure_file(self):
        # Create an empty log file with the correct header if it doesn't exist
        if not os.path.exists(LOG_FILE):
            pd.DataFrame(columns=COLUMNS).to_csv(LOG_FILE, index=False)

    def _read_df(self):
        # Load the log file; coerce ID columns to int, filling any missing as 0
        self._ensure_file()
        df = pd.read_csv(LOG_FILE)
        for col in ('subject_id', 'stay_id'):
            if col in df.columns and len(df) > 0:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
        return df

    def _save_df(self, df):
        """Persist the DataFrame to LogPatients.csv.

        Raises HTTPException 423 (Locked) instead of a bare PermissionError so the
        client receives an actionable message when the file is held open by another
        process (e.g. Excel on Windows, which exclusively locks CSV files on open).

        Raises:
            HTTPException 423: If the file is locked by another program.
        """
        try:
            df.to_csv(LOG_FILE, index=False)
        except PermissionError:
            raise HTTPException(
                status_code=423,
                detail="LogPatients.csv is open in another program (e.g. Excel). Close it and try again."
            )

    def append(self, row_dict):
        """Append a single discharged-patient record to the log.

        Only COLUMNS keys are written so schema mismatches from DailyPatients
        (e.g. extra columns like 'unurgent') do not pollute the log file.
        This method is called once per successful discharge by the scheduling API.

        Args:
            row_dict: Dict-like object (typically a pandas row converted via .to_dict())
                      containing the completed stay data.  Extra keys are silently ignored.

        Raises:
            HTTPException 423: If LogPatients.csv is locked by another program.
        """
        # Append a single discharged-patient record to the log.
        # Only COLUMNS keys are written so schema mismatches from DailyPatients don't pollute the log.
        self._ensure_file()
        existing = pd.read_csv(LOG_FILE)
        new_row  = pd.DataFrame([{col: row_dict.get(col) for col in COLUMNS}])
        df = pd.concat([existing, new_row], ignore_index=True)
        self._save_df(df)

    def get_all(self):
        """Return every logged (discharged) patient stay as a list of JSON-safe dicts.

        Returns:
            dict: {"patients": [...], "total": <count>}
        """
        # Return every logged (discharged) patient stay
        df = self._read_df()
        patients = []
        for _, row in df.iterrows():
            patients.append({
                "subject_id":          int(row["subject_id"]),
                "stay_id":             int(row["stay_id"]),
                "name":                _safe(row.get("name")),
                "gender":              _safe(row.get("gender")),
                "age":                 _safe(row.get("age")),
                "arrival_time":        _safe(row.get("arrival_time")),
                "departure_time":      _safe(row.get("departure_time")),
                "bed_occupation_time": _safe(row.get("bed_occupation_time")),
                "temperature":         _safe(row.get("temperature")),
                "heartrate":           _safe(row.get("heartrate")),
                "resprate":            _safe(row.get("resprate")),
                "o2sat":               _safe(row.get("o2sat")),
                "sbp":                 _safe(row.get("sbp")),
                "dbp":                 _safe(row.get("dbp")),
                "pain":                _safe(row.get("pain")),
                "acuity":              _safe(row.get("acuity")),
                "chiefcomplaint":      _safe(row.get("chiefcomplaint")),
            })
        return {"patients": patients, "total": len(patients)}

    def delete(self, stay_id):
        """Remove an archived stay from the log and clean up any lingering associations.

        In normal operation, all relation links are cleared at discharge time.
        This method also clears them as a safety net in case a log entry somehow
        retains stale patient_bed, patient_doctor, or patient_nurse rows.
        Staff patient counts are decremented accordingly.

        Args:
            stay_id: Primary key of the log entry to remove.

        Returns:
            dict: {"ok": True, "message": ...}

        Raises:
            HTTPException 404: If stay_id is not in LogPatients.csv.
            HTTPException 423: If LogPatients.csv is locked by another program.
        """
        df = self._read_df()
        if stay_id not in df['stay_id'].values:
            raise HTTPException(status_code=404, detail=f"Stay ID {stay_id} not found in log")
        patient_id = int(df.loc[df['stay_id'] == stay_id, 'subject_id'].iloc[0])
        df = df[df['stay_id'] != stay_id]
        self._save_df(df)
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
        return {"ok": True, "message": f"Log stay {stay_id} deleted successfully"}

    def modify(self, stay_id, subject_id, arrival_time, departure_time,
               bed_occupation_time, temperature, heartrate, resprate,
               o2sat, sbp, dbp, pain, acuity, chiefcomplaint,
               name=None, gender=None, age=None):
        """Update the fields of an archived patient stay.

        Only non-None values are written so partial updates don't overwrite
        existing data with blanks.  This differs from DailyPatientsManager.modify(),
        which unconditionally overwrites all columns.

        Args:
            stay_id: Primary key of the log entry to update.
            subject_id: New (or same) patient identifier.
            arrival_time: ISO-format timestamp string, or None to leave unchanged.
            departure_time: ISO-format timestamp string, or None to leave unchanged.
            bed_occupation_time: ISO-format timestamp string, or None to leave unchanged.
            temperature: Body temperature in °C, or None.
            heartrate: Heart rate in bpm, or None.
            resprate: Respiratory rate in breaths/min, or None.
            o2sat: Oxygen saturation percentage, or None.
            sbp: Systolic blood pressure in mmHg, or None.
            dbp: Diastolic blood pressure in mmHg, or None.
            pain: Pain description string, or None.
            acuity: ESI triage level 1–5, or None.
            chiefcomplaint: Chief complaint text, or None.
            name: Patient name, or None.
            gender: Patient gender string, or None.
            age: Patient age in years, or None.

        Returns:
            dict: {"ok": True, "message": ...}

        Raises:
            HTTPException 404: If stay_id is not in LogPatients.csv.
            HTTPException 423: If LogPatients.csv is locked by another program.
        """
        df = self._read_df()
        mask = df['stay_id'] == stay_id
        if not mask.any():
            raise HTTPException(status_code=404, detail=f"Stay {stay_id} not found in log")
        updates = {
            'subject_id':          subject_id,
            'name':                name,
            'gender':              gender,
            'age':                 age,
            'arrival_time':        arrival_time,
            'departure_time':      departure_time,
            'bed_occupation_time': bed_occupation_time,
            'temperature':         temperature,
            'heartrate':           heartrate,
            'resprate':            resprate,
            'o2sat':               o2sat,
            'sbp':                 sbp,
            'dbp':                 dbp,
            'pain':                pain,
            'acuity':              acuity,
            'chiefcomplaint':      chiefcomplaint,
        }
        for col, val in updates.items():
            if val is not None and col in df.columns:
                df.loc[mask, col] = val
        self._save_df(df)
        return {"ok": True, "message": f"Log stay {stay_id} updated successfully"}

    def get_stats(self):
        """Return summary statistics for the patient log.

        Returns:
            dict: {"total": <row count>, "unique_subjects": <distinct patient count>}
        """
        # Summary: total log entries and distinct patients ever seen
        df = self._read_df()
        return {
            "total":           len(df),
            "unique_subjects": int(df["subject_id"].nunique()) if len(df) > 0 else 0,
        }

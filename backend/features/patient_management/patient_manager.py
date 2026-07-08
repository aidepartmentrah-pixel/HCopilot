# =============================================================================
# patient_management/patient_manager.py — Patient-Centric Extension of DailyPatientsManager
# =============================================================================
#
# PatientManager subclasses DailyPatientsManager and adds three things:
#   1. get_next_ids()  — suggests the next available patient_id / stay_id so the
#      frontend can pre-fill the "Add Patient" form without a database sequence.
#   2. add() override — enforces a second uniqueness constraint: a given subject_id
#      (patient_id) may only appear once in DailyPatients at a time.  The base class
#      only checks stay_id uniqueness.
#   3. _row_to_dict() override — renames subject_id → patient_id in outgoing dicts
#      so the frontend always uses the term "patient_id" regardless of what the
#      CSV column is actually called.
#
# CSV file managed (inherited):
#   DailyPatients.csv — see DailyPatientsManager for the full column list
#
# ID seeding strategy:
#   New patient IDs start at 10 000 001 and stay IDs at 30 000 001.
#   These high starting values avoid collision with historic subject_id / stay_id
#   values that may appear in the reference Patients.csv dataset.
# =============================================================================

import pandas as pd
import math
from fastapi import HTTPException
from ..data_management.daily_patients_manager import DailyPatientsManager


def _safe(v):
    # Coerce NaN/None to Python None for JSON serialisation
    if v is None:
        return None
    try:
        if math.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        pass
    return v


class PatientManager(DailyPatientsManager):
    """
    Patient-centric extension of DailyPatientsManager.

    Adds ID suggestion, a per-patient uniqueness guard, and renames the
    CSV column subject_id to patient_id in all outgoing JSON responses.

    CSV file managed (inherited from DailyPatientsManager):
      - DailyPatients.csv : one row per active patient stay
    """

    def get_next_ids(self):
        """
        Return the next available patient_id and stay_id.

        Both values are computed as max(existing) + 1, seeded at 10 000 001 /
        30 000 001 when the file is empty so generated IDs never collide with
        historic Patients.csv subject_ids (which are all below 10 000 000).

        Returns:
            dict with keys: next_patient_id (int), next_stay_id (int)
        """
        # Return the next available patient_id and stay_id based on the current max values.
        # Seeded at 10000001 / 30000001 so generated IDs don't collide with historic data.
        df = self._read_df()
        if len(df) == 0:
            return {"next_patient_id": 10000001, "next_stay_id": 30000001}
        return {
            "next_patient_id": int(df["subject_id"].max()) + 1,
            "next_stay_id":    int(df["stay_id"].max())    + 1,
        }

    def _row_to_dict(self, row):
        """
        Serialise a DailyPatients row to a JSON-safe dict, renaming subject_id → patient_id.

        The CSV uses subject_id internally (matching the historical Patients.csv convention)
        but the frontend always refers to the same field as patient_id.  This override
        applies the rename so all patient_management API responses use the frontend's term.
        """
        # Override base serialisation to expose subject_id as patient_id for the UI
        return {
            "patient_id":          int(row["subject_id"]),
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
        }

    def add(self, patient_id, stay_id, arrival_time=None, departure_time=None, bed_occupation_time=None,
            temperature=None, heartrate=None, resprate=None,
            o2sat=None, sbp=None, dbp=None, pain=None, acuity=None, chiefcomplaint=None,
            name=None, gender=None, age=None):
        """
        Add a new patient stay to DailyPatients, enforcing single-stay uniqueness.

        Extends DailyPatientsManager.add with an additional check: if the subject_id
        (patient_id) is already present in any row, the request is rejected even if
        the stay_id is different.  This enforces the rule that one patient may only
        have one active stay at a time.

        Args:
            patient_id : int — maps to subject_id in the CSV
            stay_id    : int — primary key; must not already exist
            (remaining args) — clinical and demographic fields (see DailyPatientsManager.add)

        Returns:
            dict with success and message keys

        Raises:
            HTTPException(400) : if stay_id or patient_id already exists
        """
        # Guard: reject if the patient_id already exists (one active stay per patient)
        df = self._read_df()
        if stay_id in df["stay_id"].values:
            raise HTTPException(status_code=400, detail=f"Stay ID {stay_id} already exists")
        if patient_id in df["subject_id"].values:
            raise HTTPException(status_code=400, detail=f"Patient ID {patient_id} already exists")
        # Ensure datetime columns are object-typed to accept string values
        for col in ("arrival_time", "departure_time", "bed_occupation_time"):
            if col not in df.columns:
                df[col] = None
            df[col] = df[col].astype(object)
        new_row = pd.DataFrame([{
            "subject_id": patient_id, "stay_id": stay_id,
            "name": name, "gender": gender, "age": age,
            "arrival_time": arrival_time, "departure_time": departure_time,
            "bed_occupation_time": bed_occupation_time,
            "temperature": temperature, "heartrate": heartrate, "resprate": resprate,
            "o2sat": o2sat, "sbp": sbp, "dbp": dbp,
            "pain": pain, "acuity": acuity, "chiefcomplaint": chiefcomplaint,
        }])
        df = pd.concat([df, new_row], ignore_index=True)
        self._write_df(df)
        return {"success": True, "message": f"Patient {patient_id} added successfully"}

    def modify(self, stay_id, patient_id, arrival_time=None, departure_time=None, bed_occupation_time=None,
               temperature=None, heartrate=None, resprate=None,
               o2sat=None, sbp=None, dbp=None, pain=None, acuity=None, chiefcomplaint=None,
               name=None, gender=None, age=None):
        """
        Update an existing active stay, preventing patient_id reassignment conflicts.

        Extends DailyPatientsManager.modify with a cross-row uniqueness check: if
        the supplied patient_id is already used by a DIFFERENT stay row, the update
        is rejected to avoid creating two stays with the same patient identity.

        Args:
            stay_id    : int — primary key identifying the row to update
            patient_id : int — new (or same) value for subject_id
            (remaining args) — clinical and demographic fields

        Returns:
            dict with success and message keys

        Raises:
            HTTPException(400) : if patient_id is already used by a different stay
            HTTPException(404) : if stay_id does not exist
        """
        # Update a stay row; prevents reassigning a patient_id that belongs to a different stay
        df = self._read_df()
        if stay_id not in df["stay_id"].values:
            raise HTTPException(status_code=404, detail=f"Stay ID {stay_id} not found")
        other = df[df["stay_id"] != stay_id]
        if patient_id in other["subject_id"].values:
            raise HTTPException(status_code=400, detail=f"Patient ID {patient_id} is already used by another record")
        for col in ("arrival_time", "departure_time", "bed_occupation_time"):
            if col not in df.columns:
                df[col] = None
        for col, val in [
            ("subject_id",         patient_id),      ("name",                name),
            ("gender",             gender),           ("age",                 age),
            ("arrival_time",       arrival_time),     ("departure_time",      departure_time),
            ("bed_occupation_time", bed_occupation_time),
            ("temperature",        temperature),     ("heartrate",           heartrate),
            ("resprate",           resprate),        ("o2sat",               o2sat),
            ("sbp",                sbp),             ("dbp",                 dbp),
            ("pain",               pain),            ("acuity",              acuity),
            ("chiefcomplaint",     chiefcomplaint),
        ]:
            df.loc[df["stay_id"] == stay_id, col] = val
        self._write_df(df)
        return {"success": True, "message": f"Patient {patient_id} updated successfully"}

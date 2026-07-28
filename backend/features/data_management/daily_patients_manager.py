# =============================================================================
# data_management/daily_patients_manager.py — Active ED Roster SQL Server Manager
# =============================================================================
#
# Manages the DailyPatients table — the live list of patients currently in the
# ED. Rows are moved to LogPatients on discharge; this table holds only active
# stays.
#
# Key invariants:
#     - Each row represents one active patient stay; stay_id is the primary key.
#     - A patient (subject_id) should have at most one active stay at a time;
#       this constraint is enforced at the PatientManager level (a subclass),
#       not here — matching the CSV-era asymmetry exactly (see db/models.py).
#     - On discharge the row is copied to LogPatients and then removed here.
#     - delete() clears all relation links (patient_bed, patient_doctor,
#       patient_nurse) and decrements staff patient counts in the same call.
#
# _read_df()/_write_df() are pandas-DataFrame-shaped compatibility shims:
# beds_display/api.py, scheduling/api.py, simulation/api.py, and unurgent/api.py
# all call these two methods directly and manipulate the DataFrame themselves —
# they stay until those routers are converted to ORM queries in a later step.
# _write_df() replaces the entire table content, exactly mirroring the CSV-era
# to_csv(...) full-file overwrite semantics.
# =============================================================================

import pandas as pd
from fastapi import HTTPException

from db.session import SessionLocal
from db.models import DailyPatient
from features.relations.relations_manager import RelationsManager
from features.staff_management.doctors_manager import DoctorsManager
from features.staff_management.nurses_manager import NursesManager

_COLS = ["subject_id", "stay_id", "name", "gender", "age", "temperature", "heartrate", "resprate",
         "o2sat", "sbp", "dbp", "pain", "acuity", "chiefcomplaint",
         "arrival_time", "departure_time", "bed_occupation_time", "unurgent", "bed_history",
         "admission_ward_id", "admission_ward_name"]

_FLOAT_COLS = ["age", "temperature", "heartrate", "resprate", "o2sat", "sbp", "dbp", "acuity"]
_STR_COLS   = ["name", "gender", "pain", "chiefcomplaint", "arrival_time", "departure_time",
               "bed_occupation_time", "unurgent", "bed_history", "admission_ward_name"]


def _clean_float(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _clean_int(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _clean_str(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    return str(v)


class DailyPatientsManager:
    """Manages the DailyPatients table — the live roster of patients currently in the ED."""

    def _row(self, p: DailyPatient) -> dict:
        return {
            "subject_id":          p.subject_id,
            "stay_id":             p.stay_id,
            "name":                p.name,
            "gender":              p.gender,
            "age":                 p.age,
            "arrival_time":        p.arrival_time,
            "departure_time":      p.departure_time,
            "bed_occupation_time": p.bed_occupation_time,
            "bed_history":         p.bed_history,
            "admission_ward_id":   p.admission_ward_id,
            "admission_ward_name": p.admission_ward_name,
            "temperature":         p.temperature,
            "heartrate":           p.heartrate,
            "resprate":            p.resprate,
            "o2sat":               p.o2sat,
            "sbp":                 p.sbp,
            "dbp":                 p.dbp,
            "pain":                p.pain,
            "acuity":              p.acuity,
            "chiefcomplaint":      p.chiefcomplaint,
        }

    def get_all(self):
        with SessionLocal() as session:
            patients = session.query(DailyPatient).all()
            return {"patients": [self._row(p) for p in patients], "total": len(patients)}

    def get_stats(self):
        with SessionLocal() as session:
            patients = session.query(DailyPatient).all()
            return {
                "total":           len(patients),
                "unique_subjects": len({p.subject_id for p in patients}),
            }

    def add(self, subject_id, stay_id, arrival_time=None, departure_time=None, bed_occupation_time=None,
            temperature=None, heartrate=None, resprate=None,
            o2sat=None, sbp=None, dbp=None, pain=None, acuity=None, chiefcomplaint=None,
            name=None, gender=None, age=None):
        with SessionLocal() as session:
            if session.query(DailyPatient).filter(DailyPatient.stay_id == stay_id).first() is not None:
                raise HTTPException(status_code=400, detail=f"Stay ID {stay_id} already exists")
            session.add(DailyPatient(
                subject_id=subject_id, stay_id=stay_id,
                name=name, gender=gender, age=_clean_float(age),
                arrival_time=arrival_time, departure_time=departure_time,
                bed_occupation_time=bed_occupation_time,
                temperature=_clean_float(temperature), heartrate=_clean_float(heartrate),
                resprate=_clean_float(resprate), o2sat=_clean_float(o2sat),
                sbp=_clean_float(sbp), dbp=_clean_float(dbp),
                pain=_clean_str(pain), acuity=_clean_float(acuity), chiefcomplaint=chiefcomplaint,
            ))
            session.commit()
            return {"success": True, "message": f"Patient stay {stay_id} added successfully"}

    def modify(self, stay_id, subject_id, arrival_time=None, departure_time=None, bed_occupation_time=None,
               temperature=None, heartrate=None, resprate=None,
               o2sat=None, sbp=None, dbp=None, pain=None, acuity=None, chiefcomplaint=None,
               name=None, gender=None, age=None):
        with SessionLocal() as session:
            p = session.query(DailyPatient).filter(DailyPatient.stay_id == stay_id).first()
            if p is None:
                raise HTTPException(status_code=404, detail=f"Stay ID {stay_id} not found")
            p.subject_id = subject_id
            p.name, p.gender, p.age = name, gender, _clean_float(age)
            p.arrival_time, p.departure_time, p.bed_occupation_time = arrival_time, departure_time, bed_occupation_time
            p.temperature, p.heartrate, p.resprate = _clean_float(temperature), _clean_float(heartrate), _clean_float(resprate)
            p.o2sat, p.sbp, p.dbp = _clean_float(o2sat), _clean_float(sbp), _clean_float(dbp)
            p.pain, p.acuity, p.chiefcomplaint = _clean_str(pain), _clean_float(acuity), chiefcomplaint
            session.commit()
            return {"success": True, "message": f"Patient stay {stay_id} modified successfully"}

    def mark_unurgent(self, stay_id: int):
        with SessionLocal() as session:
            p = session.query(DailyPatient).filter(DailyPatient.stay_id == stay_id).first()
            if p is None:
                raise HTTPException(status_code=404, detail=f"Stay ID {stay_id} not found")
            p.unurgent = "True"
            session.commit()
            return {"success": True, "stay_id": stay_id}

    def get_unurgent(self):
        with SessionLocal() as session:
            patients = session.query(DailyPatient).filter(
                DailyPatient.unurgent.isnot(None),
            ).all()
            patients = [p for p in patients if str(p.unurgent).strip().lower() == "true"]
            return {"patients": [self._row(p) for p in patients], "total": len(patients)}

    def delete(self, stay_id):
        with SessionLocal() as session:
            p = session.query(DailyPatient).filter(DailyPatient.stay_id == stay_id).first()
            if p is None:
                raise HTTPException(status_code=404, detail=f"Stay ID {stay_id} not found")
            patient_id = p.subject_id
            session.delete(p)
            session.commit()

        rel = RelationsManager()
        doc_df = rel._read("patient_doctor")
        nur_df = rel._read("patient_nurse")
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

    # ── Pandas-DataFrame-shaped compatibility shim ──────────────────────────────
    # See module docstring — kept until every direct caller is converted to ORM.

    def _read_df(self) -> pd.DataFrame:
        with SessionLocal() as session:
            patients = session.query(DailyPatient).all()
            records = [{
                "subject_id": p.subject_id, "stay_id": p.stay_id,
                "name": p.name, "gender": p.gender, "age": p.age,
                "temperature": p.temperature, "heartrate": p.heartrate, "resprate": p.resprate,
                "o2sat": p.o2sat, "sbp": p.sbp, "dbp": p.dbp,
                "pain": p.pain, "acuity": p.acuity, "chiefcomplaint": p.chiefcomplaint,
                "arrival_time": p.arrival_time, "departure_time": p.departure_time,
                "bed_occupation_time": p.bed_occupation_time, "unurgent": p.unurgent,
                "bed_history": p.bed_history,
                "admission_ward_id": p.admission_ward_id, "admission_ward_name": p.admission_ward_name,
            } for p in patients]
        df = pd.DataFrame(records, columns=_COLS)
        if df.empty:
            return df
        df["subject_id"] = df["subject_id"].astype(int)
        df["stay_id"]    = df["stay_id"].astype(int)
        for col in ("arrival_time", "departure_time", "bed_occupation_time", "unurgent", "pain", "bed_history", "admission_ward_name"):
            df[col] = df[col].astype(object)
        return df

    def _write_df(self, df: pd.DataFrame):
        # Full-table replace, exactly mirroring the CSV-era to_csv(...) overwrite.
        with SessionLocal() as session:
            session.query(DailyPatient).delete(synchronize_session=False)
            for _, row in df.iterrows():
                session.add(DailyPatient(
                    subject_id=int(row["subject_id"]), stay_id=int(row["stay_id"]),
                    name=_clean_str(row.get("name")), gender=_clean_str(row.get("gender")),
                    age=_clean_float(row.get("age")),
                    temperature=_clean_float(row.get("temperature")), heartrate=_clean_float(row.get("heartrate")),
                    resprate=_clean_float(row.get("resprate")), o2sat=_clean_float(row.get("o2sat")),
                    sbp=_clean_float(row.get("sbp")), dbp=_clean_float(row.get("dbp")),
                    pain=_clean_str(row.get("pain")), acuity=_clean_float(row.get("acuity")),
                    chiefcomplaint=_clean_str(row.get("chiefcomplaint")),
                    arrival_time=_clean_str(row.get("arrival_time")),
                    departure_time=_clean_str(row.get("departure_time")),
                    bed_occupation_time=_clean_str(row.get("bed_occupation_time")),
                    unurgent=_clean_str(row.get("unurgent")) if "unurgent" in df.columns else None,
                    bed_history=_clean_str(row.get("bed_history")) if "bed_history" in df.columns else None,
                    admission_ward_id=_clean_int(row.get("admission_ward_id")) if "admission_ward_id" in df.columns else None,
                    admission_ward_name=_clean_str(row.get("admission_ward_name")) if "admission_ward_name" in df.columns else None,
                ))
            session.commit()

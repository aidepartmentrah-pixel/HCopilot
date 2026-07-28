# =============================================================================
# data_management/log_patients_manager.py — Discharged Patient Archive SQL Server Manager
# =============================================================================
#
# Manages the LogPatients table — the permanent archive of all discharged
# patient stays. Rows arrive here from DailyPatients when a patient is
# discharged; this table is effectively append-only.
#
# Key invariants (unchanged from the CSV-era implementation):
#     - append() is the primary write path: called once per discharge and
#       guards the schema by writing only COLUMNS keys, ignoring any extra
#       fields (such as 'unurgent') that may exist on the source DailyPatients
#       row/dict.
#     - delete() clears lingering relation links for the patient; in normal
#       operation those links are already gone by discharge time, so this is a
#       safety net for out-of-order or manual deletions.
#     - modify() performs a partial update — only non-None values are written,
#       so callers can update a single field without blanking the others.
#     - A locked-database error surfaces as HTTP 423 (the SQL Server
#       equivalent of the old "LogPatients.csv is open in Excel" message).
#
# stay_id is not a unique constraint here (see db/models.py — LogPatient uses
# a surrogate log_id PK), matching the CSV-era lack of enforcement; get_all/
# delete/modify operate on however many rows match, exactly like the pandas
# mask-based code did.
# =============================================================================

import math
from fastapi import HTTPException
from sqlalchemy.exc import OperationalError

from db.session import SessionLocal
from db.models import LogPatient
from features.relations.relations_manager import RelationsManager
from features.staff_management.doctors_manager import DoctorsManager
from features.staff_management.nurses_manager import NursesManager


def _clean(v):
    # scheduling/api.py's discharge flow builds this dict via pandas
    # row.to_dict(), which represents missing numeric values as float('nan')
    # rather than None — pyodbc/SQL Server rejects IEEE NaN outright.
    if v is None:
        return None
    try:
        if isinstance(v, float) and math.isnan(v):
            return None
    except TypeError:
        pass
    return v


COLUMNS = [
    'subject_id', 'stay_id', 'name', 'gender', 'age',
    'temperature', 'heartrate', 'resprate',
    'o2sat', 'sbp', 'dbp', 'pain', 'acuity', 'chiefcomplaint',
    'arrival_time', 'departure_time', 'bed_occupation_time', 'destination', 'bed_history',
    'admission_ward_id', 'admission_ward_name',
]


class LogPatientsManager:
    """Manages the LogPatients table — the permanent archive of all discharged patient stays."""

    def _row(self, p: LogPatient) -> dict:
        return {
            "subject_id":          p.subject_id,
            "stay_id":             p.stay_id,
            "name":                p.name,
            "gender":              p.gender,
            "age":                 p.age,
            "arrival_time":        p.arrival_time,
            "departure_time":      p.departure_time,
            "bed_occupation_time": p.bed_occupation_time,
            "destination":         p.destination,
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

    def append(self, row_dict):
        data = {col: _clean(row_dict.get(col)) for col in COLUMNS}
        pain = data.get("pain")
        with SessionLocal() as session:
            try:
                session.add(LogPatient(
                    subject_id=int(data["subject_id"]), stay_id=int(data["stay_id"]),
                    name=data.get("name"), gender=data.get("gender"), age=data.get("age"),
                    temperature=data.get("temperature"), heartrate=data.get("heartrate"),
                    resprate=data.get("resprate"), o2sat=data.get("o2sat"),
                    sbp=data.get("sbp"), dbp=data.get("dbp"),
                    pain=str(pain) if pain is not None else None,
                    acuity=data.get("acuity"), chiefcomplaint=data.get("chiefcomplaint"),
                    arrival_time=data.get("arrival_time"), departure_time=data.get("departure_time"),
                    bed_occupation_time=data.get("bed_occupation_time"),
                    destination=data.get("destination"),
                    bed_history=data.get("bed_history"),
                    admission_ward_id=data.get("admission_ward_id"),
                    admission_ward_name=data.get("admission_ward_name"),
                ))
                session.commit()
            except OperationalError:
                raise HTTPException(
                    status_code=423,
                    detail="The database is temporarily locked. Please try again.",
                )

    def get_all(self):
        with SessionLocal() as session:
            patients = session.query(LogPatient).all()
            return {"patients": [self._row(p) for p in patients], "total": len(patients)}

    def get_stats(self):
        with SessionLocal() as session:
            patients = session.query(LogPatient).all()
            return {
                "total":           len(patients),
                "unique_subjects": len({p.subject_id for p in patients}),
            }

    def delete(self, stay_id):
        with SessionLocal() as session:
            rows = session.query(LogPatient).filter(LogPatient.stay_id == stay_id).all()
            if not rows:
                raise HTTPException(status_code=404, detail=f"Stay ID {stay_id} not found in log")
            patient_id = rows[0].subject_id
            for row in rows:
                session.delete(row)
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
        return {"ok": True, "message": f"Log stay {stay_id} deleted successfully"}

    def modify(self, stay_id, subject_id, arrival_time, departure_time,
               bed_occupation_time, temperature, heartrate, resprate,
               o2sat, sbp, dbp, pain, acuity, chiefcomplaint,
               name=None, gender=None, age=None, destination=None, bed_history=None):
        updates = {
            'subject_id': subject_id, 'name': name, 'gender': gender, 'age': age,
            'arrival_time': arrival_time, 'departure_time': departure_time,
            'bed_occupation_time': bed_occupation_time, 'destination': destination,
            'bed_history': bed_history,
            'temperature': temperature, 'heartrate': heartrate, 'resprate': resprate,
            'o2sat': o2sat, 'sbp': sbp, 'dbp': dbp,
            'pain': str(pain) if pain is not None else None,
            'acuity': acuity, 'chiefcomplaint': chiefcomplaint,
        }
        with SessionLocal() as session:
            rows = session.query(LogPatient).filter(LogPatient.stay_id == stay_id).all()
            if not rows:
                raise HTTPException(status_code=404, detail=f"Stay {stay_id} not found in log")
            for row in rows:
                for col, val in updates.items():
                    if val is not None:
                        setattr(row, col, val)
            session.commit()
            return {"ok": True, "message": f"Log stay {stay_id} updated successfully"}

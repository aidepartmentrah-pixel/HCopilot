# =============================================================================
# unurgent/api.py — Non-Urgent (Acuity 5) Patient Path Endpoints
# =============================================================================
#
# Handles the alternative treatment path for acuity-5 (non-urgent) patients who
# are routed through the system without occupying a physical bed.
#
# DESIGN:
#   Acuity-5 patients are flagged in DailyPatients.csv with unurgent=True by
#   the OR scheduler's /or-confirm endpoint when use_unurgent=True is passed.
#   This module exposes:
#
#   GET  /api/unurgent/list            — return all currently flagged unurgent stays
#                                        enriched with linked doctor/nurse IDs
#   POST /api/unurgent/discharge/{id}  — stamp departure_time, archive to LogPatients,
#                                        remove from DailyPatients, release staff links
#
# Unlike a regular bed discharge, there is no bed to release — unurgent patients
# were never assigned one.  The discharge flow is therefore simpler: archive → delete
# → clear staff relations.
# =============================================================================

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from db.session import SessionLocal
from db.models import DailyPatient
from features.data_management.daily_patients_manager import DailyPatientsManager
from features.data_management.log_patients_manager   import LogPatientsManager
from features.relations.relations_manager            import RelationsManager
from features.staff_management.doctors_manager       import DoctorsManager
from features.staff_management.nurses_manager        import NursesManager
from features.timestamp_utils                         import validate_destination
from features.staff_logs.link_archiver                import archive_patient_doctor_links, archive_patient_nurse_links

router     = APIRouter()
dp_mgr     = DailyPatientsManager()
log_mgr    = LogPatientsManager()
rel        = RelationsManager()
doctors_mgr = DoctorsManager()
nurses_mgr  = NursesManager()


class UnurgentDischargeRequest(BaseModel):
    departure_time: Optional[str] = None   # ISO datetime; defaults to now
    destination: Optional[str] = None      # "Home" or "Hospital Department[: <name>]"

    @field_validator('destination')
    @classmethod
    def check_destination(cls, v: Optional[str]) -> Optional[str]:
        return validate_destination(v)


@router.get("/list")
async def list_unurgent():
    """Return all DailyPatients rows that have been routed to the unurgent treatment path."""
    result  = dp_mgr.get_unurgent()
    patients = result["patients"]

    doc_df = rel._read("patient_doctor")
    nur_df = rel._read("patient_nurse")

    enriched = []
    for p in patients:
        pid = p["subject_id"]
        doctor_ids = (
            doc_df[doc_df["patient_id"] == pid]["doctor_id"].tolist()
            if len(doc_df) else []
        )
        nurse_ids = (
            nur_df[nur_df["patient_id"] == pid]["nurse_id"].tolist()
            if len(nur_df) else []
        )
        enriched.append({
            **p,
            "doctor_ids": [int(x) for x in doctor_ids],
            "nurse_ids":  [int(x) for x in nurse_ids],
        })

    return {"patients": enriched, "total": len(enriched)}


@router.post("/discharge/{patient_id}")
async def discharge_unurgent(patient_id: int, req: UnurgentDischargeRequest):
    """
    Discharge a patient from the unurgent treatment path.
    Stamps departure_time, archives the row to LogPatients,
    removes from DailyPatients, and clears all staff links.
    No bed to release — unurgent patients never had one.
    """
    try:
        with SessionLocal() as session:
            rows = session.query(DailyPatient).filter(DailyPatient.subject_id == patient_id).all()
            if not rows:
                raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")

            # Prefer the row that is marked unurgent and has no departure yet
            unurgent_rows = [r for r in rows if str(r.unurgent or "").strip().lower() == "true"] or rows
            active = [r for r in unurgent_rows if not (r.departure_time or "").strip()] or unurgent_rows
            row = active[-1] if active else rows[-1]
            stay_id = row.stay_id

            departure_time = req.departure_time or datetime.now().strftime("%Y-%m-%dT%H:%M")

            # Validate: departure must be after arrival
            arrival = str(row.arrival_time or "").strip()
            if arrival and arrival not in ("nan", "None", ""):
                try:
                    arr_dt = datetime.fromisoformat(arrival)
                    dep_dt = datetime.fromisoformat(departure_time)
                    if dep_dt < arr_dt:
                        raise HTTPException(
                            status_code=400,
                            detail="Departure time cannot be before arrival time"
                        )
                except ValueError:
                    pass   # unparseable timestamps — skip validation

            row.destination = req.destination

            archived = {
                "subject_id": row.subject_id, "stay_id": row.stay_id, "name": row.name,
                "gender": row.gender, "age": row.age, "temperature": row.temperature,
                "heartrate": row.heartrate, "resprate": row.resprate, "o2sat": row.o2sat,
                "sbp": row.sbp, "dbp": row.dbp, "pain": row.pain, "acuity": row.acuity,
                "chiefcomplaint": row.chiefcomplaint, "arrival_time": row.arrival_time,
                "departure_time": departure_time, "bed_occupation_time": row.bed_occupation_time,
                "destination": row.destination, "bed_history": row.bed_history,
                "admission_ward_id": row.admission_ward_id, "admission_ward_name": row.admission_ward_name,
            }
            log_mgr.append(archived)

            session.delete(row)
            session.commit()

        # Release staff links
        doc_df = rel._read("patient_doctor")
        nur_df = rel._read("patient_nurse")
        doc_ids = (
            [int(x) for x in doc_df[doc_df["patient_id"] == patient_id]["doctor_id"].tolist()]
            if len(doc_df) else []
        )
        nur_ids = (
            [int(x) for x in nur_df[nur_df["patient_id"] == patient_id]["nurse_id"].tolist()]
            if len(nur_df) else []
        )
        archive_patient_doctor_links(patient_id, stay_id)
        archive_patient_nurse_links(patient_id, stay_id)
        rel.delete_by_left("patient_doctor", patient_id)
        rel.delete_by_left("patient_nurse",  patient_id)
        for did in doc_ids:
            doctors_mgr.update_patient_count(did, -1)
        for nid in nur_ids:
            nurses_mgr.update_patient_count(nid, -1)

        return {
            "ok":            True,
            "message":       f"Patient {patient_id} discharged from unurgent path",
            "departure_time": departure_time,
            "stay_id":        stay_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

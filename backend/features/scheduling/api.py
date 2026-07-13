# =============================================================================
# scheduling/api.py — Patient Assignment Endpoints
# =============================================================================
#
# Handles creating, editing, discharging, and deleting patient assignments.
# An "assignment" means one patient is linked to one bed plus optional doctor
# and up to two nurses via the relation tables.  There is no separate scheduling
# table — the source of truth is patient_bed / patient_doctor / patient_nurse.
#
# ENDPOINTS:
#   GET    /api/scheduling/list              — list all current assignments
#   POST   /api/scheduling/assign           — create a new assignment
#   PUT    /api/scheduling/edit/{patient_id} — update bed or staff for a patient
#   DELETE /api/scheduling/delete/{patient_id} — remove all links (unassign)
#   POST   /api/scheduling/discharge/{stay_id} — archive to LogPatients and release bed
#
# DISCHARGE FLOW:
#   1. Stamp departure_time on the DailyPatients row.
#   2. Copy the row to LogPatients.csv.
#   3. Delete the row from DailyPatients.csv.
#   4. Release the bed (set status → Available).
#   5. Decrement staff patient counters.
#   6. Delete all relation rows for the patient.
# =============================================================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from db.session import SessionLocal
from db.models import DailyPatient
from features.relations.relations_manager import RelationsManager
from features.beds_display.bed_manager import BedManager
from features.data_management.log_patients_manager import LogPatientsManager
from features.staff_management.nurses_manager import NursesManager
from features.staff_management.doctors_manager import DoctorsManager
from features.timestamp_utils import validate_timestamp_order, validate_discharge_time

router       = APIRouter()
rel          = RelationsManager()
bed_mgr      = BedManager()
log_mgr      = LogPatientsManager()
nurses_mgr   = NursesManager()
doctors_mgr  = DoctorsManager()


def _current_staff(patient_id: int):
    """Return (doctor_ids, nurse_ids) currently linked to the patient."""
    pd_rows = rel.list("patient_doctor")["rows"]
    pn_rows = rel.list("patient_nurse")["rows"]
    doctor_ids = [r["doctor_id"] for r in pd_rows if r["patient_id"] == patient_id]
    nurse_ids  = [r["nurse_id"]  for r in pn_rows  if r["patient_id"] == patient_id]
    return doctor_ids, nurse_ids


# ── Request / response models ─────────────────────────────────────────────────

class DischargeRequest(BaseModel):
    # Optional departure time; defaults to now if omitted
    departure_time: Optional[str] = None


class AssignmentCreate(BaseModel):
    # All fields needed to link a patient to a bed and optionally to staff
    patient_id:          int
    stay_id:             Optional[int] = None
    bed_id:              int
    doctor_id:           Optional[int] = None
    nurse1_id:           Optional[int] = None
    nurse2_id:           Optional[int] = None
    bed_occupation_time: Optional[str] = None


class AssignmentEdit(BaseModel):
    # Fields that can be changed when editing an existing assignment
    new_bed_id:          int
    stay_id:             Optional[int] = None
    doctor_id:           Optional[int] = None
    nurse1_id:           Optional[int] = None
    nurse2_id:           Optional[int] = None
    bed_occupation_time: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/list")
async def list_assignments():
    # Build the full assignment view by joining patient_bed, patient_doctor, and patient_nurse tables.
    # Doctors and nurses are indexed by patient so multiple nurses can be attached per patient.
    try:
        pb_rows  = rel.list("patient_bed")["rows"]     # [{patient_id, bed_id}]
        pd_rows  = rel.list("patient_doctor")["rows"]  # [{patient_id, doctor_id}]
        pn_rows  = rel.list("patient_nurse")["rows"]   # [{patient_id, nurse_id}]

        # Build lookup dicts: patient_id → [list of doctor/nurse IDs]
        docs_by   = {}
        for r in pd_rows:
            docs_by.setdefault(r["patient_id"], []).append(r["doctor_id"])
        nurses_by = {}
        for r in pn_rows:
            nurses_by.setdefault(r["patient_id"], []).append(r["nurse_id"])

        assignments = []
        for row in pb_rows:
            pid    = row["patient_id"]
            bid    = row["bed_id"]
            docs   = docs_by.get(pid, [])
            nurses = nurses_by.get(pid, [])
            assignments.append({
                "patient_id": pid,
                "bed_id":     bid,
                "doctor_id":  docs[0]   if docs              else None,
                "nurse1_id":  nurses[0] if len(nurses) > 0   else None,
                "nurse2_id":  nurses[1] if len(nurses) > 1   else None,
            })

        return {"assignments": assignments}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/assign")
async def create_assignment(a: AssignmentCreate):
    # Create a new assignment:
    # 1. Verify the bed is available and the patient doesn't already have a bed
    # 2. Write patient_bed, patient_doctor, and patient_nurse relation rows
    # 3. Optionally stamp bed_occupation_time on the patient's DailyPatients row
    if a.bed_occupation_time:
        with SessionLocal() as session:
            r = session.query(DailyPatient).filter(DailyPatient.subject_id == a.patient_id).first()
            if r is not None:
                validate_timestamp_order(r.arrival_time, a.bed_occupation_time, r.departure_time)
    try:
        bed_mgr.check_bed_available(a.bed_id)
        bed_mgr.check_patient_has_no_bed(a.patient_id)
        rel.add("patient_bed", a.patient_id, a.bed_id)
        if a.doctor_id:
            rel.add("patient_doctor", a.patient_id, a.doctor_id)
            doctors_mgr.update_patient_count(a.doctor_id, +1)
        if a.nurse1_id:
            rel.add("patient_nurse", a.patient_id, a.nurse1_id)
            nurses_mgr.update_patient_count(a.nurse1_id, +1)
        if a.nurse2_id:
            rel.add("patient_nurse", a.patient_id, a.nurse2_id)
            nurses_mgr.update_patient_count(a.nurse2_id, +1)
        if a.bed_occupation_time:
            with SessionLocal() as session:
                if a.stay_id:
                    rows = session.query(DailyPatient).filter(DailyPatient.stay_id == a.stay_id).all()
                else:
                    rows = session.query(DailyPatient).filter(DailyPatient.subject_id == a.patient_id).all()
                for r in rows:
                    r.bed_occupation_time = a.bed_occupation_time
                session.commit()
        return {"ok": True, "message": "Assignment created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/edit/{patient_id}/{old_bed_id}")
async def edit_assignment(patient_id: int, old_bed_id: int, a: AssignmentEdit):
    # Update an existing assignment in-place:
    # - If the bed changed, verify the new bed is available then swap the relation row
    # - Always replace doctor and nurse relations from scratch (delete-all then re-add)
    try:
        if a.new_bed_id != old_bed_id:
            bed_mgr.check_bed_available(a.new_bed_id)
            rel.delete("patient_bed", patient_id, old_bed_id)
            rel.add("patient_bed", patient_id, a.new_bed_id)

        # Capture current staff before replacing links so counts can be adjusted
        old_doctor_ids, old_nurse_ids = _current_staff(patient_id)

        # Full replacement of doctor links: decrement old, increment new
        rel.delete_by_left("patient_doctor", patient_id)
        for did in old_doctor_ids:
            doctors_mgr.update_patient_count(did, -1)
        if a.doctor_id:
            rel.add("patient_doctor", patient_id, a.doctor_id)
            doctors_mgr.update_patient_count(a.doctor_id, +1)

        # Full replacement of nurse links: decrement old, increment new
        rel.delete_by_left("patient_nurse", patient_id)
        for nid in old_nurse_ids:
            nurses_mgr.update_patient_count(nid, -1)
        if a.nurse1_id:
            rel.add("patient_nurse", patient_id, a.nurse1_id)
            nurses_mgr.update_patient_count(a.nurse1_id, +1)
        if a.nurse2_id:
            rel.add("patient_nurse", patient_id, a.nurse2_id)
            nurses_mgr.update_patient_count(a.nurse2_id, +1)

        # Update bed_occupation_time in DailyPatients if a new value was provided
        if a.bed_occupation_time is not None:
            with SessionLocal() as session:
                if a.stay_id:
                    rows = session.query(DailyPatient).filter(DailyPatient.stay_id == a.stay_id).all()
                else:
                    rows = session.query(DailyPatient).filter(DailyPatient.subject_id == patient_id).all()
                for r in rows:
                    r.bed_occupation_time = a.bed_occupation_time
                session.commit()

        return {"ok": True, "message": "Assignment updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete/{patient_id}/{bed_id}")
async def delete_assignment(patient_id: int, bed_id: int):
    # Release the bed and remove all staff links for this patient without archiving to the log
    try:
        old_doctor_ids, old_nurse_ids = _current_staff(patient_id)
        rel.delete("patient_bed", patient_id, bed_id)
        rel.delete_by_left("patient_doctor", patient_id)
        for did in old_doctor_ids:
            doctors_mgr.update_patient_count(did, -1)
        rel.delete_by_left("patient_nurse", patient_id)
        for nid in old_nurse_ids:
            nurses_mgr.update_patient_count(nid, -1)
        bed_mgr.cleanup_chariot_if_unneeded(bed_id)
        return {"ok": True, "message": f"Assignment for patient {patient_id} removed"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/discharge/{patient_id}/{bed_id}")
async def discharge_patient(patient_id: int, bed_id: int, req: DischargeRequest):
    # Full discharge workflow:
    # 1. Find the patient's active stay in DailyPatients
    # 2. Stamp the departure time
    # 3. Copy the completed stay row to LogPatients
    # 4. Remove the row from DailyPatients
    # 5. Clear all relation links (bed, doctor, nurses)
    try:
        with SessionLocal() as session:
            patient_rows = session.query(DailyPatient).filter(DailyPatient.subject_id == patient_id).all()
            if not patient_rows:
                raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found in daily patients")

            # Prefer a row without a departure time to target the currently active stay
            active = [r for r in patient_rows if not (r.departure_time or "").strip()]
            row = active[-1] if active else patient_rows[-1]
            stay_id = row.stay_id

            departure_time = req.departure_time or datetime.now().strftime("%Y-%m-%dT%H:%M")

            # Validate departure time — use the discharge-aware helper that tolerates
            # existing bad bed_occupation_time values
            validate_discharge_time(row.arrival_time, row.bed_occupation_time, departure_time)

            archived = {
                "subject_id": row.subject_id, "stay_id": row.stay_id, "name": row.name,
                "gender": row.gender, "age": row.age, "temperature": row.temperature,
                "heartrate": row.heartrate, "resprate": row.resprate, "o2sat": row.o2sat,
                "sbp": row.sbp, "dbp": row.dbp, "pain": row.pain, "acuity": row.acuity,
                "chiefcomplaint": row.chiefcomplaint, "arrival_time": row.arrival_time,
                "departure_time": departure_time, "bed_occupation_time": row.bed_occupation_time,
            }
            log_mgr.append(archived)

            session.delete(row)
            session.commit()

        # Release all bed/doctor/nurse links and update staff patient counts
        old_doctor_ids, old_nurse_ids = _current_staff(patient_id)
        rel.delete_by_left("patient_bed",    patient_id)
        rel.delete_by_left("patient_doctor", patient_id)
        for did in old_doctor_ids:
            doctors_mgr.update_patient_count(did, -1)
        rel.delete_by_left("patient_nurse",  patient_id)
        for nid in old_nurse_ids:
            nurses_mgr.update_patient_count(nid, -1)

        bed_mgr.cleanup_chariot_if_unneeded(bed_id)

        return {"ok": True, "message": f"Patient {patient_id} discharged successfully", "stay_id": stay_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# patient_management/discharge_manager.py — Shared "Archive + Unlink" Discharge Core
# =============================================================================
#
# The common core of every discharge path in the app, regardless of whether
# the patient held a bed: stamp departure_time, archive the row to
# LogPatients (preserving every column, including the ER Live-Roster
# Redesign's er_visit_id/triage_time/departure_source), delete it from
# DailyPatients, and unlink doctor/nurse relations.
#
# Bed-specific steps (releasing the patient_bed relation, chariot cleanup)
# deliberately stay OUT of this module — a bedless discharge (Unurgent, or
# any other no-bed active stay) has no bed to release at all, and callers
# that do have a bed to release do that themselves around calling this
# function (see scheduling/api.py's discharge_patient()).
#
# Extracted from unurgent/api.py's discharge_unurgent() and scheduling/
# api.py's discharge_patient(), which had near-identical archive→delete→
# unlink logic duplicated between them (ER Live-Roster Redesign, slice
# ER4 — see docs/development/ER Live Roster Redesign/
# 0. Slicing Task Table.md). Fixes a small pre-existing gap along the way:
# the unurgent discharge path never archived external_patient_id/
# external_visit_id/record_source into LogPatients (scheduling's own path
# always did) — this shared function now archives every column
# LogPatientsManager.COLUMNS expects, for every caller.
# =============================================================================

from datetime import datetime
from typing import Optional

from fastapi import HTTPException

from db.session import SessionLocal
from db.models import DailyPatient
from features.data_management.log_patients_manager import LogPatientsManager
from features.relations.relations_manager import RelationsManager
from features.staff_management.doctors_manager import DoctorsManager
from features.staff_management.nurses_manager import NursesManager
from features.timestamp_utils import validate_discharge_time
from features.staff_logs.link_archiver import archive_patient_doctor_links, archive_patient_nurse_links

log_mgr     = LogPatientsManager()
rel         = RelationsManager()
doctors_mgr = DoctorsManager()
nurses_mgr  = NursesManager()


def _current_staff(patient_id: int):
    """Return (doctor_ids, nurse_ids) currently linked to the patient."""
    pd_rows = rel.list("patient_doctor")["rows"]
    pn_rows = rel.list("patient_nurse")["rows"]
    doctor_ids = [r["doctor_id"] for r in pd_rows if r["patient_id"] == patient_id]
    nurse_ids  = [r["nurse_id"]  for r in pn_rows  if r["patient_id"] == patient_id]
    return doctor_ids, nurse_ids


def discharge_active_stay(patient_id: int, departure_time: Optional[str] = None,
                           destination: Optional[str] = None,
                           departure_source: str = "manual") -> dict:
    """
    Archive a patient's active DailyPatients row to LogPatients and unlink
    all doctor/nurse relations. Does NOT touch any patient_bed relation.

    Args:
        patient_id       : subject_id of the active stay to discharge.
        departure_time    : ISO datetime string; defaults to now.
        destination       : "Home" | "Hospital Department[: <name>]" | None.
                             None is valid and expected for an
                             "api_detected" discharge — no nurse ever chose
                             one (see features/hospital_directory/er_sync.py).
        departure_source  : "manual" (default, a nurse's own action) |
                             "api_detected" (the live-roster poll-diff
                             safety net closed this stay on its behalf).

    Returns:
        dict with ok, message, stay_id, departure_time (resolved — never
        None even when the caller omitted it).

    Raises:
        HTTPException(404) if no active stay exists for patient_id.
        HTTPException(400) if departure_time is before arrival_time (via
        validate_discharge_time — the discharge-aware variant that
        tolerates a pre-existing bad bed_occupation_time rather than
        permanently trapping the record).
    """
    with SessionLocal() as session:
        rows = session.query(DailyPatient).filter(DailyPatient.subject_id == patient_id).all()
        if not rows:
            raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found in daily patients")

        # Prefer a row without a departure time to target the currently active stay
        active = [r for r in rows if not (r.departure_time or "").strip()]
        row = active[-1] if active else rows[-1]
        stay_id = row.stay_id

        resolved_departure = departure_time or datetime.now().strftime("%Y-%m-%dT%H:%M")
        validate_discharge_time(row.arrival_time, row.bed_occupation_time, resolved_departure)

        row.destination = destination

        archived = {
            "subject_id": row.subject_id, "stay_id": row.stay_id, "name": row.name,
            "gender": row.gender, "age": row.age, "temperature": row.temperature,
            "heartrate": row.heartrate, "resprate": row.resprate, "o2sat": row.o2sat,
            "sbp": row.sbp, "dbp": row.dbp, "pain": row.pain, "acuity": row.acuity,
            "chiefcomplaint": row.chiefcomplaint, "arrival_time": row.arrival_time,
            "departure_time": resolved_departure, "bed_occupation_time": row.bed_occupation_time,
            "destination": row.destination, "bed_history": row.bed_history,
            "admission_ward_id": row.admission_ward_id, "admission_ward_name": row.admission_ward_name,
            "external_patient_id": row.external_patient_id, "external_visit_id": row.external_visit_id,
            "record_source": row.record_source,
            "er_visit_id": row.er_visit_id, "triage_time": row.triage_time,
            "departure_source": departure_source,
        }
        log_mgr.append(archived)

        session.delete(row)
        session.commit()

    old_doctor_ids, old_nurse_ids = _current_staff(patient_id)
    archive_patient_doctor_links(patient_id, stay_id)
    archive_patient_nurse_links(patient_id, stay_id)
    rel.delete_by_left("patient_doctor", patient_id)
    for did in old_doctor_ids:
        doctors_mgr.update_patient_count(did, -1)
    rel.delete_by_left("patient_nurse", patient_id)
    for nid in old_nurse_ids:
        nurses_mgr.update_patient_count(nid, -1)

    return {"ok": True, "message": f"Patient {patient_id} discharged successfully",
            "stay_id": stay_id, "departure_time": resolved_departure}

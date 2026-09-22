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

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from features.data_management.daily_patients_manager import DailyPatientsManager
from features.relations.relations_manager            import RelationsManager
from features.timestamp_utils                         import validate_destination
from features.patient_management.discharge_manager    import discharge_active_stay

router     = APIRouter()
dp_mgr     = DailyPatientsManager()
rel        = RelationsManager()


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
    Discharge a patient from the unurgent treatment path. No bed to
    release — unurgent patients never had one. Delegates the actual
    archive/delete/unlink work to the shared discharge_active_stay()
    (see patient_management/discharge_manager.py) — the same function
    every other bedless discharge path uses (ER Live-Roster Redesign).
    """
    try:
        result = discharge_active_stay(patient_id, departure_time=req.departure_time,
                                        destination=req.destination, departure_source="manual")
        return {
            "ok":             True,
            "message":        f"Patient {patient_id} discharged from unurgent path",
            "departure_time": result["departure_time"],
            "stay_id":        result["stay_id"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

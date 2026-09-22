# HTTP API for the beds feature.
# Covers listing/stats, condition changes, patient assignment/release/discharge,
# and full CRUD for bed records.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
from db.session import SessionLocal
from db.models import DailyPatient, PatientBed
from .bed_manager import BedManager, _VALID_CONDITIONS, _VALID_TYPES
from features.relations.relations_manager import RelationsManager
from features.timestamp_utils import validate_timestamp_order, validate_destination
from features.patient_management.discharge_manager import discharge_active_stay

router      = APIRouter()
bed_manager = BedManager()
rel         = RelationsManager()


# ── Request models ─────────────────────────────────────────────────────────────

class BedConditionUpdate(BaseModel):
    # Only "Available" or "Under Repair" are valid disk conditions
    condition: str

    @field_validator("condition")
    @classmethod
    def check(cls, v: str) -> str:
        if v not in _VALID_CONDITIONS:
            raise ValueError(f"must be one of {_VALID_CONDITIONS}")
        return v


class BedCreate(BaseModel):
    bed_number: str
    ward_id: Optional[int] = None
    bed_type: Optional[str] = None

    @field_validator("bed_number")
    @classmethod
    def check_number(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("cannot be empty")
        return v

    @field_validator("bed_type")
    @classmethod
    def check_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_TYPES:
            raise ValueError(f"must be one of {_VALID_TYPES}")
        return v


class BedModify(BaseModel):
    bed_number: str
    ward_id: Optional[int] = None
    bed_type: Optional[str] = None

    @field_validator("bed_number")
    @classmethod
    def check_number(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("cannot be empty")
        return v

    @field_validator("bed_type")
    @classmethod
    def check_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_TYPES:
            raise ValueError(f"must be one of {_VALID_TYPES}")
        return v


class BedAssign(BaseModel):
    patient_id: int
    bed_occupation_time: Optional[str] = None  # ISO datetime stamp written to DailyPatients


class BedMove(BaseModel):
    new_bed_id: int


class BedDischarge(BaseModel):
    departure_time: Optional[str] = None  # defaults to now if omitted
    destination: Optional[str] = None     # "Home" or "Hospital Department[: <name>]"

    @field_validator('destination')
    @classmethod
    def check_destination(cls, v: Optional[str]) -> Optional[str]:
        return validate_destination(v)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/list")
async def get_beds():
    # Return all beds with their computed status (Available / Occupied / Under Repair)
    try:
        return bed_manager.get_all_beds()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/bedless")
async def get_bedless_patients():
    # ER Live-Roster Redesign, slice ER5 — active patients with no bed
    # relation, enriched with linked doctor/nurse ids the same way
    # unurgent/api.py's list_unurgent() already does (kept for card
    # display on Beds Display's new bedless section).
    try:
        result = bed_manager.get_bedless_patients()
        patients = result["patients"]

        pd_rows = rel.list("patient_doctor")["rows"]
        pn_rows = rel.list("patient_nurse")["rows"]

        enriched = []
        for p in patients:
            pid = p["subject_id"]
            doctor_ids = [r["doctor_id"] for r in pd_rows if r["patient_id"] == pid]
            nurse_ids  = [r["nurse_id"]  for r in pn_rows  if r["patient_id"] == pid]
            enriched.append({
                **p,
                "doctor_ids": [int(x) for x in doctor_ids],
                "nurse_ids":  [int(x) for x in nurse_ids],
            })

        return {"patients": enriched, "total": len(enriched)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_bed_stats():
    # Return aggregate counts for the stats bar (occupied, available, under repair, occupancy %)
    try:
        return bed_manager.get_stats()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/condition/{bed_id}")
async def update_condition(bed_id: int, body: BedConditionUpdate):
    # Toggle a bed between Available and Under Repair
    try:
        return bed_manager.update_condition(bed_id, body.condition)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/assign/{bed_id}")
async def assign_patient(bed_id: int, body: BedAssign):
    # Link a patient to a bed via the bed manager (validates availability first)
    if body.bed_occupation_time:
        with SessionLocal() as session:
            r = session.query(DailyPatient).filter(DailyPatient.subject_id == body.patient_id).first()
            if r is not None:
                validate_timestamp_order(r.arrival_time, body.bed_occupation_time, r.departure_time)
    try:
        return bed_manager.assign_patient(bed_id, body.patient_id, body.bed_occupation_time)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/move/{patient_id}")
async def move_patient(patient_id: int, body: BedMove):
    # Move a patient already assigned to a bed to a different bed.
    # Works regardless of which section initiated the call — only the
    # patient_bed relation changes; doctor/nurse links are untouched.
    try:
        return bed_manager.move_patient(patient_id, body.new_bed_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/release/{bed_id}")
async def release_bed(bed_id: int):
    # Remove the patient↔bed link without archiving — quick unlink with no discharge record
    try:
        return bed_manager.release_bed(bed_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/discharge/{bed_id}")
async def discharge_from_bed(bed_id: int, body: BedDischarge):
    # Resolve which patient occupies this bed, then delegate the actual
    # archive/delete/unlink work to the shared discharge_active_stay()
    # (see patient_management/discharge_manager.py, ER Live-Roster
    # Redesign slice ER4) — the same function every discharge path in the
    # app now uses. This endpoint's own job is just the bed-specific part:
    # releasing the patient_bed relation and chariot cleanup.
    try:
        with SessionLocal() as session:
            link = session.query(PatientBed).filter(PatientBed.bed_id == bed_id).first()
            if link is None:
                raise HTTPException(status_code=404, detail=f"Bed {bed_id} has no assigned patient")
            patient_id = link.patient_id

        result = discharge_active_stay(patient_id, departure_time=body.departure_time,
                                        destination=body.destination, departure_source="manual")
        rel.delete_by_left("patient_bed", patient_id)
        bed_manager.cleanup_chariot_if_unneeded(bed_id)

        return {"ok": True, "message": f"Patient {patient_id} discharged from bed {bed_id}",
                "stay_id": result["stay_id"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/add")
async def add_bed(bed: BedCreate):
    try:
        return bed_manager.add_bed(bed.bed_number, bed.ward_id, bed.bed_type)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/modify/{bed_id}")
async def modify_bed(bed_id: int, bed: BedModify):
    try:
        return bed_manager.modify_bed(bed_id, bed.bed_number, bed.ward_id, bed.bed_type)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete/{bed_id}")
async def delete_bed(bed_id: int):
    try:
        return bed_manager.delete_bed(bed_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

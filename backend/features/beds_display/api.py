# HTTP API for the beds feature.
# Covers listing/stats, condition changes, patient assignment/release/discharge,
# and full CRUD for bed records.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
from .bed_manager import BedManager, _VALID_CONDITIONS, _VALID_TYPES
from features.data_management.daily_patients_manager import DailyPatientsManager
from features.data_management.log_patients_manager import LogPatientsManager
from features.relations.relations_manager import RelationsManager
from features.staff_management.doctors_manager import DoctorsManager
from features.staff_management.nurses_manager import NursesManager
from features.timestamp_utils import validate_timestamp_order, validate_discharge_time

router      = APIRouter()
bed_manager = BedManager()
dp_mgr      = DailyPatientsManager()
log_mgr     = LogPatientsManager()
rel         = RelationsManager()
doctors_mgr = DoctorsManager()
nurses_mgr  = NursesManager()


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
        df = dp_mgr._read_df()
        rows = df[df["subject_id"] == body.patient_id]
        if not rows.empty:
            r = rows.iloc[-1]
            validate_timestamp_order(
                r.get("arrival_time"),
                body.bed_occupation_time,
                r.get("departure_time"),
            )
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
    # Full discharge: stamp departure time → copy to log → remove from daily → clear all relations
    try:
        pb = bed_manager._read_patient_bed()
        if len(pb) == 0 or bed_id not in pb["bed_id"].values:
            raise HTTPException(status_code=404, detail=f"Bed {bed_id} has no assigned patient")
        patient_id = int(pb[pb["bed_id"] == bed_id].iloc[0]["patient_id"])

        departure_time = body.departure_time or datetime.now().strftime("%Y-%m-%dT%H:%M")

        df = dp_mgr._read_df()
        patient_rows = df[df["subject_id"] == patient_id]
        if not patient_rows.empty:
            active = patient_rows[
                patient_rows["departure_time"].isna() |
                (patient_rows["departure_time"].astype(str).str.strip() == "")
            ]
            chk = active.iloc[-1] if not active.empty else patient_rows.iloc[-1]
            validate_discharge_time(
                chk.get("arrival_time"),
                chk.get("bed_occupation_time"),
                departure_time,
            )
            # Find the active stay (no departure time yet) to avoid stamping a past discharge
            active  = patient_rows[
                patient_rows["departure_time"].isna() |
                (patient_rows["departure_time"].astype(str).str.strip() == "")
            ]
            row     = active.iloc[-1] if not active.empty else patient_rows.iloc[-1]
            stay_id = int(row["stay_id"])
            df.loc[df["stay_id"] == stay_id, "departure_time"] = departure_time
            log_mgr.append(df[df["stay_id"] == stay_id].iloc[0].to_dict())
            dp_mgr._write_df(df[df["stay_id"] != stay_id])

        # Collect linked staff before removing relations so counts can be decremented
        pd_rows    = rel.list("patient_doctor")["rows"]
        pn_rows    = rel.list("patient_nurse")["rows"]
        linked_docs = [r["doctor_id"] for r in pd_rows if r["patient_id"] == patient_id]
        linked_nurs = [r["nurse_id"]  for r in pn_rows  if r["patient_id"] == patient_id]
        rel.delete_by_left("patient_bed",    patient_id)
        rel.delete_by_left("patient_doctor", patient_id)
        rel.delete_by_left("patient_nurse",  patient_id)
        for did in linked_docs:
            doctors_mgr.update_patient_count(did, -1)
        for nid in linked_nurs:
            nurses_mgr.update_patient_count(nid, -1)

        # If the freed bed was a temporary chariot bed, remove it unless still needed
        bed_manager.cleanup_chariot_if_unneeded(bed_id)

        return {"ok": True, "message": f"Patient {patient_id} discharged from bed {bed_id}"}
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

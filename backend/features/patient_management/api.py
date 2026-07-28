# HTTP API for the patient management feature.
# Exposes CRUD for active patient stays (DailyPatients) with full vital-sign validation.
# The /next-ids endpoint lets the frontend pre-fill new patient/stay IDs automatically.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
from .patient_manager import PatientManager
from features.timestamp_utils import validate_timestamp_order

router = APIRouter()
mgr    = PatientManager()


# ── Request models ─────────────────────────────────────────────────────────────

class _PatientBase(BaseModel):
    patient_id: int
    # Demographics, arrival, and vitals are required — the only fields that stay
    # optional are bed_occupation_time and departure_time, since an active stay
    # legitimately has neither until those events actually happen.
    name:        str
    gender:      str
    age:         int
    arrival_time: str
    departure_time: Optional[str] = None
    bed_occupation_time: Optional[str] = None
    temperature: float
    heartrate:   float
    resprate:    float
    o2sat:       float
    sbp:         float
    dbp:         float
    pain:        str
    acuity:      float
    chiefcomplaint: str

    @field_validator('patient_id')
    @classmethod
    def check_patient_id(cls, v: int) -> int:
        if v < 1:
            raise ValueError('must be a positive integer')
        return v

    @field_validator('name', 'gender', 'arrival_time', 'pain', 'chiefcomplaint')
    @classmethod
    def check_required_str(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('is required')
        return v

    @field_validator('age')
    @classmethod
    def check_age(cls, v: int) -> int:
        if v < 0:
            raise ValueError('must be a positive number')
        return v

    @field_validator('temperature')
    @classmethod
    def check_temperature(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (26 <= v <= 46):
            raise ValueError('expected between 26 and 46 °C')
        return v

    @field_validator('heartrate')
    @classmethod
    def check_heartrate(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (20 <= v <= 300):
            raise ValueError('expected between 20 and 300 bpm')
        return v

    @field_validator('resprate')
    @classmethod
    def check_resprate(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (4 <= v <= 100):
            raise ValueError('expected between 4 and 100 breaths/min')
        return v

    @field_validator('o2sat')
    @classmethod
    def check_o2sat(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (0 <= v <= 100):
            raise ValueError('expected between 0 and 100 %')
        return v

    @field_validator('sbp')
    @classmethod
    def check_sbp(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (40 <= v <= 300):
            raise ValueError('expected between 40 and 300 mmHg')
        return v

    @field_validator('dbp')
    @classmethod
    def check_dbp(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (20 <= v <= 200):
            raise ValueError('expected between 20 and 200 mmHg')
        return v

    @field_validator('acuity')
    @classmethod
    def check_acuity(cls, v: Optional[float]) -> Optional[float]:
        # ESI triage scale: 1 = Immediate, 5 = Non-Urgent
        if v is not None and not (1 <= v <= 5):
            raise ValueError('expected between 1 (Immediate) and 5 (Non-Urgent)')
        return v


class PatientCreate(_PatientBase):
    # stay_id is required on create but not on modify (identified by URL param instead)
    stay_id: int

    @field_validator('stay_id')
    @classmethod
    def check_stay_id(cls, v: int) -> int:
        if v < 1:
            raise ValueError('must be a positive integer')
        return v


class PatientModify(_PatientBase):
    pass


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/next-ids")
async def get_next_ids():
    # Return the next available patient_id and stay_id so the UI can pre-fill the add form
    try:
        return mgr.get_next_ids()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_patients():
    # Return all active (non-discharged) patient stays
    try:
        return mgr.get_all()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def patient_stats():
    # Return total count and unique patient count
    try:
        return mgr.get_stats()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/add")
async def add_patient(p: PatientCreate):
    try:
        return mgr.add(
            p.patient_id, p.stay_id, p.arrival_time, p.departure_time, p.bed_occupation_time,
            p.temperature, p.heartrate, p.resprate,
            p.o2sat, p.sbp, p.dbp, p.pain, p.acuity, p.chiefcomplaint,
            name=p.name, gender=p.gender, age=p.age
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/modify/{stay_id}")
async def modify_patient(stay_id: int, p: PatientModify):
    validate_timestamp_order(p.arrival_time, p.bed_occupation_time, p.departure_time)
    try:
        return mgr.modify(
            stay_id, p.patient_id, p.arrival_time, p.departure_time, p.bed_occupation_time,
            p.temperature, p.heartrate, p.resprate,
            p.o2sat, p.sbp, p.dbp, p.pain, p.acuity, p.chiefcomplaint,
            name=p.name, gender=p.gender, age=p.age
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete/{stay_id}")
async def delete_patient(stay_id: int):
    try:
        return mgr.delete(stay_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

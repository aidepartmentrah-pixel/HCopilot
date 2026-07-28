# data_management/api.py
# =======================
# FastAPI router for the three core data stores:
#
#   - Wards         : GET/POST/PUT/DELETE under /wards/*
#   - DailyPatients : GET/POST/PUT/DELETE under /daily-patients/*
#   - LogPatients   : GET/PUT/DELETE       under /log-patients/*
#
# All input validation is performed by Pydantic models before data reaches the
# underlying CSV managers.  This keeps the HTTP boundary responsible for
# business-rule enforcement (valid ranges, required fields, positive IDs) and
# keeps the managers free of validation logic.
#
# Vital-sign reference ranges (common ED triage values used for field validation):
#   temperature  26–46 °C     |  heartrate   20–300 bpm
#   resprate      4–100 /min  |  o2sat       0–100 %
#   sbp          40–300 mmHg  |  dbp        20–200 mmHg
#   acuity        1–5         (ESI triage scale: 1 = Immediate, 5 = Non-Urgent)

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
from .wards_manager import WardsManager
from .daily_patients_manager import DailyPatientsManager
from .log_patients_manager import LogPatientsManager
from features.timestamp_utils import validate_timestamp_order, validate_destination

router    = APIRouter()
wards_mgr = WardsManager()
daily_mgr = DailyPatientsManager()
log_mgr   = LogPatientsManager()


class _WardBase(BaseModel):
    """Base Pydantic model shared by WardCreate and WardModify.

    Validates:
        ward_name     : non-empty string (leading/trailing whitespace is stripped).
        department_id : positive integer (≥ 1).
    """
    ward_name: str
    department_id: int

    @field_validator('ward_name')
    @classmethod
    def check_ward_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('cannot be empty')
        return v

    @field_validator('department_id')
    @classmethod
    def check_dept_id(cls, v: int) -> int:
        if v < 1:
            raise ValueError('must be a positive integer')
        return v


class WardCreate(_WardBase):
    """Request body for POST /wards/add.  Inherits all _WardBase validators."""
    pass


class WardModify(_WardBase):
    """Request body for PUT /wards/modify/{ward_id}.  Inherits all _WardBase validators."""
    pass


class _DailyPatientBase(BaseModel):
    """Base Pydantic model for DailyPatients create/modify endpoints.

    subject_id is always required; it identifies the patient (not the stay).
    All vital-sign and demographic fields are optional — a new arrival may have
    only an ID and no vitals yet.

    Range validators are applied to every numeric vital sign to catch data-entry
    errors at the HTTP boundary before data is persisted to the CSV.
    """
    subject_id: int
    name:        Optional[str]   = None
    gender:      Optional[str]   = None
    age:         Optional[int]   = None
    arrival_time: Optional[str] = None
    departure_time: Optional[str] = None
    bed_occupation_time: Optional[str] = None
    temperature: Optional[float] = None
    heartrate: Optional[float] = None
    resprate: Optional[float] = None
    o2sat: Optional[float] = None
    sbp: Optional[float] = None
    dbp: Optional[float] = None
    pain: Optional[str] = None
    acuity: Optional[float] = None
    chiefcomplaint: Optional[str] = None

    @field_validator('subject_id')
    @classmethod
    def check_subject_id(cls, v: int) -> int:
        if v < 1:
            raise ValueError('must be a positive integer')
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
        if v is not None and not (1 <= v <= 5):
            raise ValueError('expected between 1 (Immediate) and 5 (Non-Urgent)')
        return v


class DailyPatientCreate(_DailyPatientBase):
    """Request body for POST /daily-patients/add.

    stay_id is required on creation because it is the primary key of the stay.
    subject_id (patient identifier) is inherited from _DailyPatientBase.
    """
    stay_id: int

    @field_validator('stay_id')
    @classmethod
    def check_stay_id(cls, v: int) -> int:
        if v < 1:
            raise ValueError('must be a positive integer')
        return v


class DailyPatientModify(_DailyPatientBase):
    """Request body for PUT /daily-patients/modify/{stay_id} and PUT /log-patients/modify/{stay_id}.

    stay_id is taken from the URL path parameter, so only patient/vitals fields
    appear in the request body.

    destination is only meaningful for a discharged (log) stay — it is defined
    here rather than on _DailyPatientBase so the still-active DailyPatients
    create/modify endpoints don't expose it.
    """
    destination: Optional[str] = None

    @field_validator('destination')
    @classmethod
    def check_destination(cls, v: Optional[str]) -> Optional[str]:
        return validate_destination(v)


# ── Wards ────────────────────────────────────────────────────────────────────

@router.get("/wards/list")
async def get_wards():
    """Return all wards from Wards.csv, including live assigned-bed counts.

    Returns:
        dict: {"wards": [...], "total": <count>}

    Raises:
        HTTPException 404: If Wards.csv does not exist.
        HTTPException 500: On unexpected errors.
    """
    try:
        return wards_mgr.get_all()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/wards/stats")
async def get_ward_stats():
    """Return aggregate statistics for all wards.

    Returns:
        dict: {"total": <ward count>, "assigned_beds": <total beds across all wards>,
               "departments": <distinct department count>}

    Raises:
        HTTPException 500: On unexpected errors.
    """
    try:
        return wards_mgr.get_stats()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/wards/add")
async def add_ward(ward: WardCreate):
    """Add a new ward to Wards.csv.

    Args:
        ward: WardCreate body with ward_name and department_id.

    Returns:
        dict: {"success": True, "message": ..., "ward": {"ward_id": ..., ...}}

    Raises:
        HTTPException 400: If ward_name is empty or department_id < 1 (Pydantic).
        HTTPException 500: On unexpected errors.
    """
    try:
        return wards_mgr.add(ward.ward_name, ward.department_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/wards/modify/{ward_id}")
async def modify_ward(ward_id: int, ward: WardModify):
    """Update an existing ward's name and/or department.

    Args:
        ward_id: URL path parameter — ID of the ward to update.
        ward: WardModify body with new ward_name and department_id.

    Returns:
        dict: {"success": True, "message": ..., "ward": {...}}

    Raises:
        HTTPException 400: If Pydantic validation fails.
        HTTPException 404: If ward_id does not exist.
        HTTPException 500: On unexpected errors.
    """
    try:
        return wards_mgr.modify(ward_id, ward.ward_name, ward.department_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/wards/delete/{ward_id}")
async def delete_ward(ward_id: int):
    """Delete a ward and remove all its ward_bed, ward_doctor, ward_nurse relation links.

    Args:
        ward_id: URL path parameter — ID of the ward to delete.

    Returns:
        dict: {"success": True, "message": ...}

    Raises:
        HTTPException 404: If ward_id does not exist.
        HTTPException 500: On unexpected errors.
    """
    try:
        return wards_mgr.delete(ward_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── DailyPatients ─────────────────────────────────────────────────────────────

@router.get("/daily-patients/list")
async def get_daily_patients():
    """Return all active (non-discharged) patient stays from DailyPatients.csv.

    Returns:
        dict: {"patients": [...], "total": <count>}

    Raises:
        HTTPException 404: If DailyPatients.csv does not exist.
        HTTPException 500: On unexpected errors.
    """
    try:
        return daily_mgr.get_all()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/daily-patients/stats")
async def get_daily_patient_stats():
    """Return summary statistics for the active patient roster.

    Returns:
        dict: {"total": <row count>, "unique_subjects": <distinct patient count>}

    Raises:
        HTTPException 500: On unexpected errors.
    """
    try:
        return daily_mgr.get_stats()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/daily-patients/add")
async def add_daily_patient(p: DailyPatientCreate):
    """Add a new patient stay to DailyPatients.csv.

    Args:
        p: DailyPatientCreate body; stay_id must not already exist.

    Returns:
        dict: {"success": True, "message": ...}

    Raises:
        HTTPException 400: If stay_id already exists or Pydantic validation fails.
        HTTPException 500: On unexpected errors.
    """
    try:
        return daily_mgr.add(
            p.subject_id, p.stay_id, p.arrival_time, p.departure_time, p.bed_occupation_time,
            p.temperature, p.heartrate, p.resprate,
            p.o2sat, p.sbp, p.dbp, p.pain, p.acuity, p.chiefcomplaint,
            name=p.name, gender=p.gender, age=p.age
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/daily-patients/modify/{stay_id}")
async def modify_daily_patient(stay_id: int, p: DailyPatientModify):
    """Update all fields of an active patient stay.

    Args:
        stay_id: URL path parameter — primary key of the stay to update.
        p: DailyPatientModify body with the new field values.

    Returns:
        dict: {"success": True, "message": ...}

    Raises:
        HTTPException 404: If stay_id does not exist.
        HTTPException 500: On unexpected errors.
    """
    try:
        return daily_mgr.modify(
            stay_id, p.subject_id, p.arrival_time, p.departure_time, p.bed_occupation_time,
            p.temperature, p.heartrate, p.resprate,
            p.o2sat, p.sbp, p.dbp, p.pain, p.acuity, p.chiefcomplaint,
            name=p.name, gender=p.gender, age=p.age
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/daily-patients/delete/{stay_id}")
async def delete_daily_patient(stay_id: int):
    """Hard-delete an active patient stay and clear all its relation links.

    Also decrements the patient_count on any linked doctors and nurses.

    Args:
        stay_id: URL path parameter — primary key of the stay to remove.

    Returns:
        dict: {"success": True, "message": ...}

    Raises:
        HTTPException 404: If stay_id does not exist.
        HTTPException 500: On unexpected errors.
    """
    try:
        return daily_mgr.delete(stay_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── LogPatients ───────────────────────────────────────────────────────────────

@router.get("/log-patients/list")
async def get_log_patients():
    """Return all archived (discharged) patient stays from LogPatients.csv.

    Returns:
        dict: {"patients": [...], "total": <count>}

    Raises:
        HTTPException 500: On unexpected errors.
    """
    try:
        return log_mgr.get_all()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/log-patients/stats")
async def get_log_patient_stats():
    """Return summary statistics for the patient log.

    Returns:
        dict: {"total": <row count>, "unique_subjects": <distinct patient count>}

    Raises:
        HTTPException 500: On unexpected errors.
    """
    try:
        return log_mgr.get_stats()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/log-patients/delete/{stay_id}")
async def delete_log_patient(stay_id: int):
    """Remove an archived stay from LogPatients.csv and clear any lingering relation links.

    Args:
        stay_id: URL path parameter — primary key of the log entry to remove.

    Returns:
        dict: {"ok": True, "message": ...}

    Raises:
        HTTPException 404: If stay_id is not in the log.
        HTTPException 423: If the CSV file is locked by another process.
        HTTPException 500: On unexpected errors.
    """
    try:
        return log_mgr.delete(stay_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/log-patients/modify/{stay_id}")
async def modify_log_patient(stay_id: int, p: DailyPatientModify):
    """Update fields on an archived patient stay.

    validate_timestamp_order is called here (outside the manager) because the
    log-modify route is the only place where all three timestamps (arrival,
    bed_occupation, departure) are expected to coexist and be in order.

    Args:
        stay_id: URL path parameter — primary key of the log entry to update.
        p: DailyPatientModify body with the new field values.

    Returns:
        dict: {"ok": True, "message": ...}

    Raises:
        HTTPException 400: If timestamp order is invalid.
        HTTPException 404: If stay_id is not in the log.
        HTTPException 423: If the CSV file is locked by another process.
        HTTPException 500: On unexpected errors.
    """
    validate_timestamp_order(p.arrival_time, p.bed_occupation_time, p.departure_time)
    try:
        return log_mgr.modify(
            stay_id, p.subject_id, p.arrival_time, p.departure_time, p.bed_occupation_time,
            p.temperature, p.heartrate, p.resprate,
            p.o2sat, p.sbp, p.dbp, p.pain, p.acuity, p.chiefcomplaint,
            name=p.name, gender=p.gender, age=p.age, destination=p.destination
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

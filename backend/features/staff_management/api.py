# =============================================================================
# staff_management/api.py — Staff Management HTTP Endpoints
# =============================================================================
#
# Provides CRUD endpoints for all four staff-related data stores:
#
#   /api/staff/doctors/…    — Doctor and intern records (Doctors.csv)
#   /api/staff/nurses/…     — Nurse records (Nurses.csv)
#   /api/staff/shifts/…     — Shift definitions (Shifts.csv)
#   /api/staff/groups/…     — Rotation group definitions (Groups.csv)
#
# DATA MODEL:
#   Doctors have a type (doctor | intern), a shift name, and a work_days integer
#   that references a group_id.  The patientNb counter tracks how many patients
#   are currently assigned to them; availabilityTimeStart records when their last
#   patient was discharged (used for fairness-based scheduling).
#
#   Nurses have a role (PN | RN | Bed_Admission), a shift name, and a group
#   (integer group_id).  Same patientNb / availabilityTimeStart tracking.
#
#   Shifts define named time windows (morning: 07:00–19:00, night: 19:00–07:00).
#   Groups define rotation sets — which weekdays a group of staff are on duty.
#
#   The absent toggle (toggle-absent endpoints) marks a staff member as
#   unavailable for the current shift without deleting them from the system.
#
# VALIDATION:
#   intern_or_not must be 'doctor' or 'intern' (enforced by Pydantic validator).
#   role must be 'PN', 'RN', or 'Bed_Admission' (enforced by Pydantic validator).
#   All other fields are optional strings/ints with no structural constraints.
# =============================================================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
from .doctors_manager import DoctorsManager
from .nurses_manager  import NursesManager
from .shifts_manager  import ShiftsManager
from .groups_manager  import GroupsManager

router = APIRouter()
doctors_mgr = DoctorsManager()
nurses_mgr  = NursesManager()
shifts_mgr  = ShiftsManager()
groups_mgr  = GroupsManager()

# Allowed values for doctor type and nurse role (validated in Pydantic models below)
_VALID_TYPES = ('doctor', 'intern')
_VALID_ROLES = ('PN', 'RN', 'Bed_Admission')


# ── Doctor request models ──────────────────────────────────────────────────────

class _DoctorBase(BaseModel):
    """
    Shared fields for doctor create and modify requests.
    intern_or_not must be 'doctor' or 'intern' — validated at deserialization time.
    patientNb and availabilityTimeStart are optional and managed by the system;
    they can be supplied via the API to set initial values.
    """
    intern_or_not: str
    shift: str
    work_days: str         # References a group by name in Groups.csv
    name: Optional[str] = None
    patientNb: Optional[str] = None                # Current patient load count
    availabilityTimeStart: Optional[str] = None    # ISO datetime of last patient discharge

    @field_validator('intern_or_not')
    @classmethod
    def check_type(cls, v: str) -> str:
        """Reject any value that is not 'doctor' or 'intern'."""
        if v not in _VALID_TYPES:
            raise ValueError("must be 'doctor' or 'intern'")
        return v

class DoctorCreate(_DoctorBase):
    """Request body for POST /api/staff/doctors/add."""
    pass

class DoctorModify(_DoctorBase):
    """Request body for PUT /api/staff/doctors/modify/{id}."""
    pass


# ── Nurse request models ───────────────────────────────────────────────────────

class _NurseBase(BaseModel):
    """
    Shared fields for nurse create and modify requests.
    role must be one of 'PN', 'RN', or 'Bed_Admission' — validated at deserialization.
    group is the group name (references Groups.csv by name).
    """
    role: str
    shift: str
    group: str             # References a group by name in Groups.csv
    name: Optional[str] = None
    patientNB: Optional[str] = None               # Current patient load count (note: NB not Nb)
    availabilityTimeStart: Optional[str] = None   # ISO datetime of last patient discharge

    @field_validator('role')
    @classmethod
    def check_role(cls, v: str) -> str:
        """Reject any role value that is not 'PN', 'RN', or 'Bed_Admission'."""
        if v not in _VALID_ROLES:
            raise ValueError("must be 'PN', 'RN', or 'Bed_Admission'")
        return v

class NurseCreate(_NurseBase):
    """Request body for POST /api/staff/nurses/add."""
    pass

class NurseModify(_NurseBase):
    """Request body for PUT /api/staff/nurses/modify/{id}."""
    pass


# ── Shift/Group config request models ─────────────────────────────────────────

class ShiftBody(BaseModel):
    """
    Request body for shift create/modify.
    start_hour and end_hour are 24-hour integers (0–23).
    If end_hour < start_hour the shift crosses midnight (e.g. night: 19 → 7).
    """
    name: str
    start_hour: int
    end_hour: int
    new_id: Optional[int] = None

class GroupBody(BaseModel):
    """
    Request body for group create/modify.
    days is a comma-separated string of weekday numbers 0–6 (0=Monday, 6=Sunday).
    Example: "0,1,2,3" for Group 1 (Mon–Thu).
    """
    name: str
    days: str
    new_id: Optional[int] = None


# ── Doctor endpoints ───────────────────────────────────────────────────────────

@router.get("/doctors/list")
async def get_doctors():
    """Return all doctor/intern records from Doctors.csv."""
    try:
        return doctors_mgr.get_all()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/doctors/stats")
async def get_doctor_stats():
    """Return aggregate counts: total, doctors, interns, by shift, by group."""
    try:
        return doctors_mgr.get_stats()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/doctors/add")
async def add_doctor(doc: DoctorCreate):
    """Add a new doctor or intern record to Doctors.csv."""
    try:
        return doctors_mgr.add(doc.intern_or_not, doc.shift, doc.work_days,
                               doc.patientNb, doc.availabilityTimeStart, name=doc.name)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/doctors/modify/{id}")
async def modify_doctor(id: int, doc: DoctorModify):
    """Update an existing doctor record by ID."""
    try:
        return doctors_mgr.modify(id, doc.intern_or_not, doc.shift, doc.work_days,
                                  doc.patientNb, doc.availabilityTimeStart, name=doc.name)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/doctors/toggle-absent/{id}")
async def toggle_doctor_absent(id: int):
    """
    Toggle a doctor's absent flag between True and False.
    Absent staff are excluded from shift-based scheduling and OR suggestions.
    """
    try:
        return doctors_mgr.toggle_absent(id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/doctors/delete/{id}")
async def delete_doctor(id: int):
    """Delete a doctor record and remove all their relation links (patient_doctor, ward_doctor)."""
    try:
        return doctors_mgr.delete(id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Nurse endpoints ────────────────────────────────────────────────────────────

@router.get("/nurses/list")
async def get_nurses():
    """Return all nurse records from Nurses.csv."""
    try:
        return nurses_mgr.get_all()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nurses/stats")
async def get_nurse_stats():
    """Return aggregate counts: total, by role (PN/RN/Bed_Admission), by shift, by group."""
    try:
        return nurses_mgr.get_stats()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nurses/add")
async def add_nurse(nurse: NurseCreate):
    """Add a new nurse record to Nurses.csv."""
    try:
        return nurses_mgr.add(nurse.role, nurse.shift, nurse.group,
                              nurse.patientNB, nurse.availabilityTimeStart, name=nurse.name)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/nurses/modify/{id}")
async def modify_nurse(id: int, nurse: NurseModify):
    """Update an existing nurse record by ID."""
    try:
        return nurses_mgr.modify(id, nurse.role, nurse.shift, nurse.group,
                                 nurse.patientNB, nurse.availabilityTimeStart, name=nurse.name)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/nurses/toggle-absent/{id}")
async def toggle_nurse_absent(id: int):
    """
    Toggle a nurse's absent flag between True and False.
    Absent staff are excluded from shift-based scheduling and OR suggestions.
    """
    try:
        return nurses_mgr.toggle_absent(id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/nurses/delete/{id}")
async def delete_nurse(id: int):
    """Delete a nurse record and remove all their relation links (patient_nurse, ward_nurse)."""
    try:
        return nurses_mgr.delete(id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Shifts config endpoints ────────────────────────────────────────────────────

@router.get("/shifts/list")
async def list_shifts():
    """Return all shift definitions from Shifts.csv."""
    try:
        return shifts_mgr.get_all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/shifts/add")
async def add_shift(s: ShiftBody):
    """Add a new shift definition. Name must be unique and non-empty."""
    try:
        return shifts_mgr.add(s.name, s.start_hour, s.end_hour)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/shifts/modify/{shift_id}")
async def modify_shift(shift_id: int, s: ShiftBody):
    """Update a shift definition by ID."""
    try:
        return shifts_mgr.modify(shift_id, s.name, s.start_hour, s.end_hour, new_shift_id=s.new_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/shifts/delete/{shift_id}")
async def delete_shift(shift_id: int):
    """Delete a shift definition by ID."""
    try:
        return shifts_mgr.delete(shift_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Groups config endpoints ────────────────────────────────────────────────────

@router.get("/groups/list")
async def list_groups():
    """Return all rotation group definitions from Groups.csv, including human-readable day names."""
    try:
        return groups_mgr.get_all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/groups/add")
async def add_group(g: GroupBody):
    """Add a new rotation group. Name must be non-empty; days is a comma-separated weekday string."""
    try:
        return groups_mgr.add(g.name, g.days)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/groups/modify/{group_id}")
async def modify_group(group_id: int, g: GroupBody):
    """Update a rotation group's name and days by ID."""
    try:
        return groups_mgr.modify(group_id, g.name, g.days, new_group_id=g.new_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/groups/delete/{group_id}")
async def delete_group(group_id: int):
    """Delete a rotation group by ID."""
    try:
        return groups_mgr.delete(group_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

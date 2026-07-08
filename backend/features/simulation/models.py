# Pydantic request/response models for the simulation feature.
# Kept separate from api.py so or_scheduler.py can import them without pulling in FastAPI.

from pydantic import BaseModel
from typing import Optional, Dict, List


# ── Inbound requests ──────────────────────────────────────────────────────────

class ConfirmPatientRequest(BaseModel):
    """
    Body sent when the user confirms adding a sampled patient to DailyPatients.
    The server assigns new IDs; all clinical fields come straight from Patients.csv.
    """
    subject_id:     int
    stay_id:        int
    temperature:    Optional[float] = None
    heartrate:      Optional[float] = None
    resprate:       Optional[float] = None
    o2sat:          Optional[float] = None
    sbp:            Optional[float] = None
    dbp:            Optional[float] = None
    pain:           Optional[str]   = None
    acuity:         Optional[float] = None
    chiefcomplaint: Optional[str]   = None


class ORSuggestRequest(BaseModel):
    """
    Parameters that control how the OR scheduler builds its suggestions.
    shift_override / group_override let the user manually pick which shift and
    group to use instead of the auto-detected values from the config files.
    """
    strict_nurses:        bool                    = False
    base_score_overrides: Optional[Dict[str, float]] = None
    shift_override:       Optional[str]           = None   # e.g. "morning"
    group_override:       Optional[str]           = None   # e.g. "Group 1"


class ORConfirmRequest(BaseModel):
    """
    Body sent when the user confirms a single OR suggestion.
    Mirrors AssignmentCreate in the scheduling feature so the same write logic applies.

    bed_id is optional: when use_chariot is True (the user chose to create a
    temporary chariot bed because no ICU bed was free for a critical patient),
    the server creates the bed itself and bed_id may be omitted.

    use_unurgent: True for acuity-5 patients routed to the unurgent treatment path.
    No bed is assigned; the patient is marked in DailyPatients and staff linked normally.
    """
    patient_id:   int
    stay_id:      Optional[int] = None
    bed_id:       Optional[int] = None
    use_chariot:  bool = False
    use_unurgent: bool = False
    doctor_id:    Optional[int] = None
    nurse1_id:    Optional[int] = None
    nurse2_id:    Optional[int] = None


# ── Outbound responses ────────────────────────────────────────────────────────

class SampledPatient(BaseModel):
    """
    One randomly drawn row from Patients.csv, enriched with pre-assigned new IDs
    and a flag that tells the UI if acuity was null (treated as 1 internally).
    """
    source_subject_id: int
    source_stay_id:    int
    new_patient_id:    int
    new_stay_id:       int
    temperature:       Optional[float] = None
    heartrate:         Optional[float] = None
    resprate:          Optional[float] = None
    o2sat:             Optional[float] = None
    sbp:               Optional[float] = None
    dbp:               Optional[float] = None
    pain:              Optional[str]   = None
    acuity:            Optional[float] = None   # raw value from dataset (may be None)
    acuity_was_null:   bool            = False  # True when original acuity was missing
    chiefcomplaint:    Optional[str]   = None


class ORSuggestion(BaseModel):
    """
    One complete assignment suggestion produced by the OR scheduler for a single
    unassigned patient. Every field that influences a decision is included so the
    frontend can render a detailed reason card without extra API calls.
    """
    # Patient identity
    patient_id:       int
    stay_id:          Optional[int] = None
    acuity:           Optional[float] = None  # raw stored acuity
    effective_acuity: int                     # resolved acuity (null → 1)
    acuity_lane:      str                     # "1-2" | "3-4" | "5"

    # Priority (only meaningful for lane 3-4)
    priority_score:   Optional[float] = None
    base_score:       Optional[float] = None
    waiting_minutes:  float

    # Suggested resources
    bed_id:     Optional[int] = None
    bed_number: Optional[str] = None
    bed_type:   Optional[str] = None
    ward_id:    Optional[int] = None
    ward_name:  Optional[str] = None

    doctor_id:   Optional[int] = None
    doctor_type: Optional[str] = None  # "doctor" | "intern"

    nurse1_id:   Optional[int] = None
    nurse1_role: Optional[str] = None
    nurse2_id:   Optional[int] = None
    nurse2_role: Optional[str] = None

    # Flags for UI alerts
    suggest_unurgent:     bool = False   # acuity 5 — routed to unurgent treatment path, no bed
    is_overflow:          bool = False   # critical patient placed outside Ward 1
    ward1_full:           bool = False   # Ward 1 had no available beds
    icu_unavailable:      bool = False   # lane 1-2: no ICU bed found anywhere, no chariot either
    no_bed_available:     bool = False   # no bed found anywhere
    senior_fallback:      bool = False   # acuity 1/2 got an intern (no senior on shift)
    nurse_strict_fallback:bool = False   # strict mode requested but RN or PN was missing

    # Human-readable explanation for each decision
    reasons: List[str] = []


class ORSuggestResponse(BaseModel):
    """Top-level response from the OR suggest endpoint."""
    suggestions:   List[ORSuggestion]
    current_shift: str          # active shift name (from Shifts.csv)
    current_group: str          # active group name (from Groups.csv)
    ward1_full:    bool         # true if Ward 1 had zero free beds of any type
    icu_shortage:  bool         # true if any critical patient found no ICU bed
    icu_occupants: List[dict] = []  # patients currently in an ICU bed (for manual reassignment)
    no_waiting:    bool         # true if there are no unassigned patients at all


class StaffSwapRequest(BaseModel):
    """
    Body for POST /api/simulation/staff-swap.
    Replaces one staff member on a patient assignment with another, updating
    patient-count tracking for both the outgoing and incoming staff member.
    """
    patient_id:   int
    old_staff_id: int
    new_staff_id: int
    staff_type:   str   # "doctor" or "nurse"

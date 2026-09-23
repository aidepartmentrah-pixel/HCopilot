# HTTP API for the patient management feature.
# Exposes CRUD for active patient stays (DailyPatients) with full vital-sign validation.
# The /next-ids endpoint lets the frontend pre-fill new patient/stay IDs automatically.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator, model_validator
from typing import Optional
from .patient_manager import PatientManager
from .isbar_manager import ISBARManager
from features.timestamp_utils import validate_timestamp_order
from db.session import SessionLocal
from db.models import DailyPatient, LogPatient

router = APIRouter()
mgr       = PatientManager()
isbar_mgr = ISBARManager()


# ── Request models ─────────────────────────────────────────────────────────────

class _PatientBase(BaseModel):
    patient_id: int
    # Demographics, arrival, and vitals are required — the only fields that stay
    # optional are bed_occupation_time and departure_time, since an active stay
    # legitimately has neither until those events actually happen.
    # gender/age/acuity/chiefcomplaint are typed Optional here (unlike the
    # original "always required" shape) because a roster-origin stay (picked
    # off the live ER feed, see er_visit_id below) genuinely can't supply
    # them at creation time — see check_required_by_origin below, which
    # enforces the full requirement for every OTHER origin unchanged.
    name:        str
    gender:      Optional[str] = None
    # Float, not int (2026-09-22 fix) — an age under 1 year (an infant) is a
    # real, common ED case and needs sub-year precision. The DB column
    # (db/models.py) was already Float; this int typing here was the actual
    # bug, silently making it impossible to save an infant's age at all
    # (Pydantic rejects e.g. 0.6 outright with "Input should be a valid
    # integer"). The frontend still collects a whole number in a Years/
    # Months/Days unit picker and converts to decimal years before sending —
    # see _patAgeInYears() in patients.js — so this just needs to accept
    # what that conversion produces.
    age:         Optional[float] = None
    arrival_time: str
    departure_time: Optional[str] = None
    bed_occupation_time: Optional[str] = None
    # Initial Vital Signs is fully optional — only Patient & Arrival is a hard
    # requirement to add a patient. Each vital may be recorded independently;
    # there is no "fill it all once started" grouping (removed by request —
    # see git history for the prior check_vitals_group model_validator).
    temperature: Optional[float] = None
    heartrate:   Optional[float] = None
    resprate:    Optional[float] = None
    o2sat:       Optional[float] = None
    sbp:         Optional[float] = None
    dbp:         Optional[float] = None
    pain:        Optional[str] = None
    acuity:      Optional[float] = None
    chiefcomplaint: Optional[str] = None
    # Hospital Directory API integration (see features/hospital_directory/) —
    # populated only when this stay was created from a directory search
    # selection; a purely manually-typed stay leaves all three unset and
    # record_source defaults to "local" server-side (see patient_manager.py).
    external_patient_id: Optional[str] = None
    external_visit_id:   Optional[str] = None
    record_source:       Optional[str] = None
    # ER Live-Roster Redesign (see docs/development/ER Live Roster
    # Redesign/) — er_visit_id is set only when this stay was created by
    # picking a name off the live ER roster; triage_time is optional and
    # independent of origin, filled in whenever a doctor actually sees the
    # patient (same "blank until the event happens" treatment as
    # bed_occupation_time).
    er_visit_id: Optional[str] = None
    triage_time: Optional[str] = None

    @field_validator('patient_id')
    @classmethod
    def check_patient_id(cls, v: int) -> int:
        if v < 1:
            raise ValueError('must be a positive integer')
        return v

    @field_validator('name', 'arrival_time')
    @classmethod
    def check_required_str(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('is required')
        return v

    @field_validator('age')
    @classmethod
    def check_age(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError('must be a positive number')
        return v

    @model_validator(mode="after")
    def check_required_by_origin(self):
        # Roster-origin stays (record_source="external" WITH an
        # er_visit_id — see the class docstring above) get a relaxed bar:
        # only name + arrival_time (both already unconditionally required
        # above) are needed at creation, since gender/age/chiefcomplaint/
        # acuity simply aren't available from the live roster at pick
        # time. Every other origin — a purely manual stay, OR a directory
        # search selection (record_source="external" but no er_visit_id,
        # since that flow already supplies full identity) — keeps today's
        # full Patient & Arrival requirement unchanged. This is deliberately
        # keyed on er_visit_id presence, not record_source alone, so the
        # existing directory-search shortcut (ER11) is never affected.
        is_roster_origin = self.record_source == "external" and bool(self.er_visit_id)
        if not is_roster_origin:
            missing = [f for f in ("gender", "chiefcomplaint")
                       if not (getattr(self, f) or "").strip()]
            if self.age is None:
                missing.append("age")
            if self.acuity is None:
                missing.append("acuity")
            if missing:
                raise ValueError(f"{', '.join(missing)}: is required")
        return self

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


# ── ISBAR nursing-handover fields ───────────────────────────────────────────
# Every field here is optional (see plan decision: today's required fields
# stay required exactly as-is; everything new is optional except conditional
# sub-fields, enforced below). Multi-select fields arrive as a comma-separated
# string of tokens (matching DailyPatient.bed_history's existing convention);
# "Other" free text always lives in a separate `<field>_other` field.

_YES_NO           = {"Yes", "No"}
_O2_SUPPORT        = {"room_air", "nasal_cannula", "simple_mask", "non_rebreather",
                       "high_flow_nc", "cpap_bipap", "mechanical_vent"}
_CLINICAL_STATUS   = {"Stable", "Improving", "Close monitoring", "Deteriorating", "Critical"}
_IMMEDIATE_CONCERNS = {"respiratory_distress", "chest_pain", "fever_infection", "sepsis",
                        "altered_loc", "active_bleeding", "uncontrolled_pain",
                        "hypo_hyperglycemia", "other"}
_PAST_MEDICAL_HISTORY = {"hypertension", "diabetes", "cad", "heart_failure", "stroke_tia",
                          "ckd", "copd_asthma", "liver_disease", "cancer", "alzheimer", "other"}
_ALLERGIES_STATUS  = {"Yes", "No", "NKA"}
_ALLERGY_TYPES     = {"medication", "food", "latex", "other"}
_ISOLATION         = {"None", "Contact", "Droplet", "Airborne", "Reverse"}
_HIGH_ALERT_MEDS   = {"insulin", "anticoagulants", "opioids", "sedatives",
                       "vasoactive", "chemotherapy", "other"}
_RECENT_PROCEDURES = {"surgery", "intubation", "central_picc", "chest_tube",
                       "blood_transfusion", "dialysis", "endoscopy", "other"}
_NEURO_STATUS      = {"Alert", "Oriented", "Confused", "Drowsy", "Unresponsive"}
_SWALLOW           = {"Passed", "Failed", "Pending"}
_VOIDING           = {"Independent", "Assisted"}
_LINES_TUBES       = {"peripheral_iv", "central_line_picc", "urinary_catheter",
                       "ng", "peg_tube", "chest_tube", "drain"}
_NURSING_PRIORITIES = {"frequent_vitals", "continuous_spo2", "glucose_monitoring",
                        "pain_reassessment", "neuro_checks", "wound_care", "io_monitoring",
                        "fall_precautions", "pressure_injury_prevention",
                        "isolation_precautions", "other"}
_DISCHARGE_PLAN    = {"home", "ward", "icu_hdu", "or", "rehab", "other"}
_OUTSTANDING_TASKS = {"medication_admin", "blood_sampling", "imaging_transport",
                       "dressing_change", "catheter_care", "patient_education",
                       "physician_notification", "discharge_paperwork",
                       "transfer_arrangements", "other"}


def _split_csv(v: Optional[str]) -> list[str]:
    if not v:
        return []
    return [t.strip() for t in v.split(",") if t.strip()]


def _check_allowed(field: str, v: Optional[str], allowed: set[str], multi: bool = False):
    if v is None or v == "":
        return
    tokens = _split_csv(v) if multi else [v]
    for t in tokens:
        if t not in allowed:
            raise ValueError(f"{field}: '{t}' is not a recognized option")


class ISBARDetails(BaseModel):
    # Initial Vital Signs additions
    blood_glucose:      Optional[float] = None
    o2_support:         Optional[str] = None
    o2_flow_rate:        Optional[float] = None
    vitals_measured_at: Optional[str] = None
    vitals_recorded_by: Optional[str] = None

    # Situation
    reason_for_admission:    Optional[str] = None
    current_diagnosis:       Optional[str] = None
    clinical_status:         Optional[str] = None
    immediate_concerns:      Optional[str] = None
    immediate_concerns_other: Optional[str] = None

    # Background
    past_medical_history:       Optional[str] = None
    past_medical_history_other: Optional[str] = None
    surgical_history_flag:      Optional[str] = None
    surgical_history_text:      Optional[str] = None
    allergies_status:            Optional[str] = None
    allergy_types:                Optional[str] = None
    allergy_substance:            Optional[str] = None
    allergy_reaction:              Optional[str] = None
    isolation_precautions:      Optional[str] = None
    high_alert_meds:              Optional[str] = None
    high_alert_meds_other:         Optional[str] = None
    recent_procedures:              Optional[str] = None
    recent_procedures_other:         Optional[str] = None
    recent_procedure_datetime:        Optional[str] = None

    # Focused Assessment
    neuro_status:         Optional[str] = None
    telemetry:             Optional[str] = None
    edema:                  Optional[str] = None
    peripheral_pulses:       Optional[str] = None
    diet:                     Optional[str] = None
    npo:                       Optional[str] = None
    swallow_assessment:         Optional[str] = None
    last_bowel_movement:         Optional[str] = None
    voiding:                      Optional[str] = None
    urinary_catheter:               Optional[str] = None
    wounds:                          Optional[str] = None
    fall_risk:                        Optional[str] = None
    pressure_injury_risk:              Optional[str] = None
    mobility_aids:                      Optional[str] = None
    lines_tubes_drains:                  Optional[str] = None
    intake_ml:                            Optional[float] = None
    output_ml:                             Optional[float] = None
    critical_lab_results:                   Optional[str] = None
    pending_labs:                            Optional[str] = None
    pending_imaging:                          Optional[str] = None

    # Recommendation & Handover
    nursing_priorities:            Optional[str] = None
    nursing_priorities_other:      Optional[str] = None
    meds_due_next_shift:            Optional[str] = None
    pending_medical_review:          Optional[str] = None
    consultations:                    Optional[str] = None
    discharge_transfer_plan:           Optional[str] = None
    discharge_transfer_plan_other:      Optional[str] = None
    outstanding_tasks:                   Optional[str] = None
    outstanding_tasks_other:              Optional[str] = None
    outgoing_nurse:                        Optional[str] = None
    incoming_nurse:                         Optional[str] = None
    handover_datetime:                       Optional[str] = None
    receiver_ack:                             Optional[bool] = None

    @model_validator(mode="after")
    def check_isbar(self):
        # Allow-list checks
        _check_allowed("o2_support", self.o2_support, _O2_SUPPORT)
        _check_allowed("clinical_status", self.clinical_status, _CLINICAL_STATUS)
        _check_allowed("immediate_concerns", self.immediate_concerns, _IMMEDIATE_CONCERNS, multi=True)
        _check_allowed("past_medical_history", self.past_medical_history, _PAST_MEDICAL_HISTORY, multi=True)
        _check_allowed("surgical_history_flag", self.surgical_history_flag, _YES_NO)
        _check_allowed("allergies_status", self.allergies_status, _ALLERGIES_STATUS)
        _check_allowed("allergy_types", self.allergy_types, _ALLERGY_TYPES, multi=True)
        _check_allowed("isolation_precautions", self.isolation_precautions, _ISOLATION)
        _check_allowed("high_alert_meds", self.high_alert_meds, _HIGH_ALERT_MEDS, multi=True)
        _check_allowed("recent_procedures", self.recent_procedures, _RECENT_PROCEDURES, multi=True)
        _check_allowed("neuro_status", self.neuro_status, _NEURO_STATUS)
        for f in ("telemetry", "edema", "peripheral_pulses", "npo", "urinary_catheter",
                  "wounds", "fall_risk", "pressure_injury_risk", "mobility_aids"):
            _check_allowed(f, getattr(self, f), _YES_NO)
        _check_allowed("swallow_assessment", self.swallow_assessment, _SWALLOW)
        _check_allowed("voiding", self.voiding, _VOIDING)
        _check_allowed("lines_tubes_drains", self.lines_tubes_drains, _LINES_TUBES, multi=True)
        _check_allowed("nursing_priorities", self.nursing_priorities, _NURSING_PRIORITIES, multi=True)
        _check_allowed("discharge_transfer_plan", self.discharge_transfer_plan, _DISCHARGE_PLAN)
        _check_allowed("outstanding_tasks", self.outstanding_tasks, _OUTSTANDING_TASKS, multi=True)

        # No conditional-required or section-completeness ("fill it all once
        # started") rules by design — every ISBAR field is independently
        # optional; filling one never forces another. Only Patient & Arrival
        # (see _PatientBase) is a hard requirement to add a patient.
        return self


class PatientCreate(_PatientBase):
    # stay_id is required on create but not on modify (identified by URL param instead)
    stay_id: int
    isbar: Optional[ISBARDetails] = None

    @field_validator('stay_id')
    @classmethod
    def check_stay_id(cls, v: int) -> int:
        if v < 1:
            raise ValueError('must be a positive integer')
        return v


class PatientModify(_PatientBase):
    isbar: Optional[ISBARDetails] = None


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


_LIST_BADGE_FIELDS = ["allergies_status", "fall_risk", "pressure_injury_risk",
                      "isolation_precautions", "clinical_status"]


def _badge_subset(isbar_row: Optional[dict]) -> Optional[dict]:
    if isbar_row is None:
        return None
    return {f: isbar_row.get(f) for f in _LIST_BADGE_FIELDS}


@router.get("/list")
async def list_patients():
    # Return all active (non-discharged) patient stays, with a small ISBAR
    # badge subset merged in (allergy/fall-risk/isolation/clinical-status)
    # for the compact table — not the full ISBAR record, to keep this
    # payload small; use GET /{stay_id}/details for the full record.
    try:
        result = mgr.get_all()
        stay_ids = [p["stay_id"] for p in result["patients"]]
        isbar_by_stay = isbar_mgr.get_many(stay_ids)
        for p in result["patients"]:
            p["isbar"] = _badge_subset(isbar_by_stay.get(p["stay_id"]))
        return result
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
        result = mgr.add(
            p.patient_id, p.stay_id, p.arrival_time, p.departure_time, p.bed_occupation_time,
            p.temperature, p.heartrate, p.resprate,
            p.o2sat, p.sbp, p.dbp, p.pain, p.acuity, p.chiefcomplaint,
            name=p.name, gender=p.gender, age=p.age,
            external_patient_id=p.external_patient_id, external_visit_id=p.external_visit_id,
            record_source=p.record_source,
            er_visit_id=p.er_visit_id, triage_time=p.triage_time,
        )
        if p.isbar is not None:
            # exclude_unset: a field the client never included in the request
            # body must not overwrite a previously-stored value with the
            # model's None default — see modify_patient below, where this
            # actually matters (add() always targets a brand-new row, so it's
            # a no-op difference here, but keeping both calls consistent).
            isbar_mgr.upsert(p.stay_id, p.isbar.model_dump(exclude_unset=True))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/modify/{stay_id}")
async def modify_patient(stay_id: int, p: PatientModify):
    validate_timestamp_order(p.arrival_time, p.bed_occupation_time, p.departure_time)
    try:
        result = mgr.modify(
            stay_id, p.patient_id, p.arrival_time, p.departure_time, p.bed_occupation_time,
            p.temperature, p.heartrate, p.resprate,
            p.o2sat, p.sbp, p.dbp, p.pain, p.acuity, p.chiefcomplaint,
            name=p.name, gender=p.gender, age=p.age, triage_time=p.triage_time,
        )
        if p.isbar is not None:
            # exclude_unset=True is the whole point here: the frontend
            # intentionally omits vitals_measured_at/vitals_recorded_by from
            # an edit payload (Wave 4 — no visible field for them anymore) so
            # that editing an unrelated field never silently reattributes who
            # recorded the vitals and when. Without exclude_unset, Pydantic's
            # model_dump() fills every unset field with its None default and
            # upsert() would treat that None as "clear this column."
            isbar_mgr.upsert(stay_id, p.isbar.model_dump(exclude_unset=True))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete/{stay_id}")
async def delete_patient(stay_id: int):
    try:
        result = mgr.delete(stay_id)
        isbar_mgr.delete(stay_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{stay_id}/details")
async def get_patient_details(stay_id: int):
    # Full read-only record for the Patient Details view: core stay fields
    # (from DailyPatients, falling back to LogPatients for discharged stays)
    # plus every ISBAR field (null when not yet recorded — never fabricated).
    try:
        with SessionLocal() as session:
            row = session.query(DailyPatient).filter(DailyPatient.stay_id == stay_id).first()
            source = "daily"
            if row is None:
                row = session.query(LogPatient).filter(LogPatient.stay_id == stay_id).first()
                source = "log"
            if row is None:
                raise HTTPException(status_code=404, detail=f"Stay ID {stay_id} not found")

            core = {
                "patient_id":          row.subject_id,
                "stay_id":             row.stay_id,
                "name":                row.name,
                "gender":              row.gender,
                "age":                 row.age,
                "arrival_time":        row.arrival_time,
                "departure_time":      row.departure_time,
                "bed_occupation_time": row.bed_occupation_time,
                "bed_history":         row.bed_history,
                "admission_ward_id":   row.admission_ward_id,
                "admission_ward_name": row.admission_ward_name,
                "temperature":         row.temperature,
                "heartrate":           row.heartrate,
                "resprate":            row.resprate,
                "o2sat":               row.o2sat,
                "sbp":                 row.sbp,
                "dbp":                 row.dbp,
                "pain":                row.pain,
                "acuity":              row.acuity,
                "chiefcomplaint":      row.chiefcomplaint,
                "destination":         row.destination,
                "source":              source,   # "daily" (active) or "log" (discharged)
                "external_patient_id": row.external_patient_id,
                "external_visit_id":   row.external_visit_id,
                "record_source":       row.record_source,  # "local" | "external" — this stay's own creation origin
                "er_visit_id":         row.er_visit_id,
                "triage_time":         row.triage_time,
                "departure_source":    row.departure_source,
            }

        isbar_row = isbar_mgr.get(stay_id)
        core["isbar"] = isbar_row  # None if no ISBAR data has ever been recorded for this stay
        return core
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

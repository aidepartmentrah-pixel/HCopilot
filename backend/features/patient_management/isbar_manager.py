# =============================================================================
# patient_management/isbar_manager.py — PatientISBARDetails SQL Server Manager
# =============================================================================
#
# Plain ORM CRUD against the PatientISBARDetails side table (one row per
# stay_id) — deliberately NOT routed through DailyPatientsManager's
# DataFrame-rewrite shim (_read_df/_write_df), since that shim silently drops
# any column not threaded through its hardcoded reconstruction list. See
# db/models.py:PatientISBARDetails docstring for the full rationale.
#
# upsert() is insert-or-update by stay_id, so editing a patient that predates
# ISBAR data (or was never given any) transparently creates its row on first
# save rather than requiring a separate "does it exist yet" check upstream.
# =============================================================================

from db.session import SessionLocal
from db.models import PatientISBARDetails

# Every column on PatientISBARDetails except the stay_id primary key, in the
# same grouped order as the model — the single source of truth this manager
# uses for both reading a row into a dict and writing a dict onto a row.
FIELDS = [
    # Initial Vital Signs additions
    "blood_glucose", "o2_support", "o2_flow_rate", "vitals_measured_at", "vitals_recorded_by",
    # Situation
    "reason_for_admission", "current_diagnosis", "clinical_status",
    "immediate_concerns", "immediate_concerns_other",
    # Background
    "past_medical_history", "past_medical_history_other",
    "surgical_history_flag", "surgical_history_text",
    "allergies_status", "allergy_types", "allergy_substance", "allergy_reaction",
    "isolation_precautions",
    "high_alert_meds", "high_alert_meds_other",
    "recent_procedures", "recent_procedures_other", "recent_procedure_datetime",
    # Focused Assessment
    "neuro_status", "telemetry", "edema", "peripheral_pulses",
    "diet", "npo", "swallow_assessment", "last_bowel_movement",
    "voiding", "urinary_catheter", "wounds",
    "fall_risk", "pressure_injury_risk", "mobility_aids",
    "lines_tubes_drains", "intake_ml", "output_ml",
    "critical_lab_results", "pending_labs", "pending_imaging",
    # Recommendation & Handover
    "nursing_priorities", "nursing_priorities_other",
    "meds_due_next_shift", "pending_medical_review", "consultations",
    "discharge_transfer_plan", "discharge_transfer_plan_other",
    "outstanding_tasks", "outstanding_tasks_other",
    "outgoing_nurse", "incoming_nurse", "handover_datetime", "receiver_ack",
]

# Stored as "True"/"False" text, matching the existing absent/unurgent
# boolean-as-string convention elsewhere in this schema (see db/models.py).
_BOOL_FIELDS = {"receiver_ack"}


def _to_store(field, value):
    if value is None:
        return None
    if field in _BOOL_FIELDS:
        return "True" if value else "False"
    return value


def _from_store(field, value):
    if value is None:
        return None
    if field in _BOOL_FIELDS:
        return str(value).strip().lower() == "true"
    return value


class ISBARManager:
    """CRUD for the PatientISBARDetails side table."""

    def _row(self, r: PatientISBARDetails) -> dict:
        out = {"stay_id": r.stay_id}
        for field in FIELDS:
            out[field] = _from_store(field, getattr(r, field))
        return out

    def get(self, stay_id: int) -> dict | None:
        with SessionLocal() as session:
            r = session.query(PatientISBARDetails).filter(PatientISBARDetails.stay_id == stay_id).first()
            return self._row(r) if r is not None else None

    def get_many(self, stay_ids: list[int]) -> dict:
        """Batched lookup keyed by stay_id, for merging a small field subset into list views."""
        if not stay_ids:
            return {}
        with SessionLocal() as session:
            rows = session.query(PatientISBARDetails).filter(
                PatientISBARDetails.stay_id.in_(stay_ids)
            ).all()
            return {r.stay_id: self._row(r) for r in rows}

    def upsert(self, stay_id: int, data: dict) -> dict:
        """Insert a new ISBAR row for stay_id, or update the existing one. Unspecified fields are left unchanged."""
        with SessionLocal() as session:
            r = session.query(PatientISBARDetails).filter(PatientISBARDetails.stay_id == stay_id).first()
            if r is None:
                r = PatientISBARDetails(stay_id=stay_id)
                session.add(r)
            for field in FIELDS:
                if field in data:
                    setattr(r, field, _to_store(field, data[field]))
            session.commit()
            session.refresh(r)
            return self._row(r)

    def delete(self, stay_id: int) -> None:
        with SessionLocal() as session:
            session.query(PatientISBARDetails).filter(PatientISBARDetails.stay_id == stay_id).delete()
            session.commit()

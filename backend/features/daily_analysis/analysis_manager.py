# =============================================================================
# daily_analysis/analysis_manager.py — Date-filterable daily statistics
# =============================================================================
#
# Combines several angles for a single selected date into one report:
#   patients — arrivals/discharges, net change, demographics, acuity mix,
#              top complaints, avg wait-to-bed, avg length of stay, and
#              discharge destinations — all scoped to the selected date
#   comparison — arrived/discharged deltas vs the previous calendar day
#   wards    — reuses WardCensusManager (active now + discharged that day per ward)
#   doctors  — patient load per doctor that day
#   nurses   — patient load per nurse that day
#
# THE "ACTIVE VS ARCHIVED" SPLIT (same idea as ward census):
#   For TODAY, "active" is a live count from patient_doctor/patient_nurse —
#   who a doctor/nurse is caring for right now.
#   For ANY date (including today), "ended that day" comes from
#   PatientDoctorLog/PatientNurseLog.archived_at — links that were archived
#   (via staff_logs/link_archiver.py) on discharge, reassignment, manual
#   unassignment, or the doctor/nurse being deleted. This is exact for any
#   date because those log tables are append-only and never pruned.
#   A past date only ever shows "ended that day" — there is no way to
#   reconstruct who was actively assigned on a bygone day.
#
# Doctor/nurse identity for display: prefer the live Doctors/Nurses row (in
# case the name changed since); fall back to the archived name captured on
# the log row if the doctor/nurse has since been deleted.
#
# All patient-clinical breakdowns (acuity/gender/complaints/wait/LOS) are
# scoped to rows whose arrival_time (or, for LOS/destination, departure_time)
# falls on the selected date — so they stay exact for any past date, not
# just "today", since arrival_time/departure_time are frozen once written.
# =============================================================================

from collections import defaultdict
from datetime import date as date_cls, datetime, timedelta

from db.session import SessionLocal
from db.models import (
    DailyPatient, LogPatient, Doctor, Nurse,
    PatientDoctor, PatientNurse, PatientDoctorLog, PatientNurseLog,
)
from features.ward_census.census_manager import WardCensusManager

ESI_LABELS = {
    1: "ESI 1 — Immediate",
    2: "ESI 2 — Emergent",
    3: "ESI 3 — Urgent",
    4: "ESI 4 — Less Urgent",
    5: "ESI 5 — Non-Urgent",
}


def _today_str() -> str:
    return date_cls.today().isoformat()


def _parse_ts(ts):
    """Parse an ISO timestamp string, tolerating None/blank/malformed values."""
    if ts is None:
        return None
    s = str(ts).strip()
    if not s or s.lower() in ("nan", "none", "nat"):
        return None
    try:
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def _minutes_between(start, end):
    """Minutes between two ISO timestamp strings, or None if unparseable/negative."""
    a, b = _parse_ts(start), _parse_ts(end)
    if not a or not b:
        return None
    diff = (b - a).total_seconds() / 60
    return diff if diff >= 0 else None


class DailyAnalysisManager:
    """Computes the combined patients/wards/doctors/nurses report for one date."""

    def _arrived_rows(self, session, target_date: str) -> list:
        """Every patient record (live + archived) that arrived on target_date."""
        daily_rows = session.query(DailyPatient).filter(DailyPatient.arrival_time.like(f"{target_date}%")).all()
        log_rows   = session.query(LogPatient).filter(LogPatient.arrival_time.like(f"{target_date}%")).all()
        return list(daily_rows) + list(log_rows)

    def _discharged_rows(self, session, target_date: str) -> list:
        return session.query(LogPatient).filter(LogPatient.departure_time.like(f"{target_date}%")).all()

    def _patient_stats(self, session, target_date: str) -> dict:
        arrived_rows    = self._arrived_rows(session, target_date)
        discharged_rows = self._discharged_rows(session, target_date)

        ages = [r.age for r in arrived_rows if r.age is not None]
        avg_age = round(sum(ages) / len(ages), 1) if ages else None

        gender_breakdown = defaultdict(int)
        for r in arrived_rows:
            gender_breakdown[(r.gender or "").strip() or "Unknown"] += 1

        acuity_counts = defaultdict(int)
        for r in arrived_rows:
            try:
                level = int(r.acuity)
            except (TypeError, ValueError):
                continue
            if level in ESI_LABELS:
                acuity_counts[level] += 1
        acuity_breakdown = [
            {"level": level, "label": ESI_LABELS[level], "count": acuity_counts.get(level, 0)}
            for level in sorted(ESI_LABELS)
        ]

        complaint_counts = defaultdict(int)
        for r in arrived_rows:
            cc = (r.chiefcomplaint or "").strip()
            if cc:
                complaint_counts[cc.title()] += 1
        top_complaints = sorted(
            ({"complaint": c, "count": n} for c, n in complaint_counts.items()),
            key=lambda x: x["count"], reverse=True,
        )[:5]

        wait_minutes = []
        for r in arrived_rows:
            m = _minutes_between(r.arrival_time, r.bed_occupation_time)
            if m is not None and m <= 1440:  # same 24h data-quality cap as StatsManager
                wait_minutes.append(m)
        avg_wait = round(sum(wait_minutes) / len(wait_minutes), 1) if wait_minutes else None

        los_hours = []
        destination_breakdown = defaultdict(int)
        for r in discharged_rows:
            m = _minutes_between(r.arrival_time, r.departure_time)
            if m is not None and 0 < m <= 10080:  # same 7-day cap as StatsManager
                los_hours.append(m / 60)
            dest = (r.destination or "").strip() or "Unknown"
            if dest.startswith("Hospital Department"):
                dest = "Hospital Department"
            destination_breakdown[dest] += 1
        avg_los = round(sum(los_hours) / len(los_hours), 2) if los_hours else None

        return {
            "arrived":               len(arrived_rows),
            "discharged":            len(discharged_rows),
            "net_change":            len(arrived_rows) - len(discharged_rows),
            "avg_age":               avg_age,
            "gender_breakdown":      dict(gender_breakdown),
            "acuity_breakdown":      acuity_breakdown,
            "top_complaints":        top_complaints,
            "avg_wait_to_bed_min":   avg_wait,
            "wait_sample_count":     len(wait_minutes),
            "avg_los_hours":         avg_los,
            "los_sample_count":      len(los_hours),
            "destination_breakdown": dict(destination_breakdown),
        }

    def _staff_load(self, session, target_date: str, live_model, log_model, id_col: str, name_col: str, live_registry):
        """Shared logic for doctor/nurse patient-load-per-day (they're identical
        apart from which models/column names are involved)."""
        live_names = {getattr(r, "id"): r.name for r in session.query(live_registry).all()}

        active_counts = defaultdict(int)
        if target_date == _today_str():
            for link in session.query(live_model).all():
                active_counts[getattr(link, id_col)] += 1

        ended_counts = defaultdict(int)
        archived_names = {}
        for log in session.query(log_model).filter(getattr(log_model, "archived_at").like(f"{target_date}%")).all():
            sid = getattr(log, id_col)
            ended_counts[sid] += 1
            archived_names[sid] = getattr(log, name_col)

        ids = set(active_counts) | set(ended_counts)
        rows = []
        for sid in ids:
            name = live_names.get(sid) or archived_names.get(sid) or f"#{sid}"
            a, e = active_counts.get(sid, 0), ended_counts.get(sid, 0)
            rows.append({"id": sid, "name": name, "active_patients": a, "ended_patients": e, "total_patients": a + e})
        rows.sort(key=lambda r: (r["name"] or ""))
        return rows

    def get_report(self, target_date: str = None) -> dict:
        target_date = target_date or _today_str()
        prev_date = (date_cls.fromisoformat(target_date) - timedelta(days=1)).isoformat()
        with SessionLocal() as session:
            patients      = self._patient_stats(session, target_date)
            prev_patients = self._patient_stats(session, prev_date)
            doctors = self._staff_load(
                session, target_date, PatientDoctor, PatientDoctorLog, "doctor_id", "doctor_name", Doctor,
            )
            nurses = self._staff_load(
                session, target_date, PatientNurse, PatientNurseLog, "nurse_id", "nurse_name", Nurse,
            )
        # WardCensusManager manages its own sessions — reuse its public methods
        # rather than reaching into its internals here.
        ward_data = (
            WardCensusManager().get_today() if target_date == _today_str()
            else {"date": target_date, "wards": [
                {"ward_name": r["ward_name"], "active_patients": r["active_patients"],
                 "discharged_patients": r["discharged_patients"], "total_patients": r["total_patients"]}
                for r in WardCensusManager().get_history(target_date, target_date)
            ]}
        )
        return {
            "date": target_date,
            "patients": patients,
            "comparison": {
                "prev_date":        prev_date,
                "arrived_delta":    patients["arrived"] - prev_patients["arrived"],
                "discharged_delta": patients["discharged"] - prev_patients["discharged"],
            },
            "wards": ward_data["wards"],
            "doctors": doctors,
            "nurses": nurses,
        }

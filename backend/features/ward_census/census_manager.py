# =============================================================================
# ward_census/census_manager.py — Daily Ward Patient Census
# =============================================================================
#
# Computes, and permanently records once per calendar day, how many patients
# were associated with each ward that day:
#
#   active_patients     — currently occupying a bed in that ward right now
#                          (live join of patient_bed + ward_bed + Wards; only
#                          meaningful for "today" — a past day's live state
#                          can't be reconstructed after the fact).
#   discharged_patients — discharged (moved to LogPatients) on that date,
#                          attributed to the ward of their FIRST bed this stay
#                          (DailyPatient/LogPatient.admission_ward_name — set
#                          once by BedManager.add_bed_to_history() and never
#                          overwritten by later moves). This is always exact,
#                          for any date, since LogPatients keeps full history.
#
# Persisted to WardDailyCensus — one upserted row per (census_date, ward_name)
# — so "today" can be refreshed repeatedly (hourly job, manual view, etc.)
# without creating duplicates, and past days stay frozen at whatever was last
# saved before the date rolled over.
# =============================================================================

from collections import defaultdict
from datetime import date as date_cls, datetime

from db.session import SessionLocal
from db.models import LogPatient, PatientBed, Ward, WardBed, WardDailyCensus

_UNASSIGNED = "Unassigned"


def _today_str() -> str:
    return date_cls.today().isoformat()


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


class WardCensusManager:
    """Computes and persists the daily per-ward patient census."""

    def _active_counts(self, session) -> dict:
        """{ward_name: count} of patients currently occupying a bed in each ward, live."""
        ward_names = {w.ward_id: w.ward_name for w in session.query(Ward).all()}
        ward_by_bed = {wb.bed_id: wb.ward_id for wb in session.query(WardBed).all()}
        counts = defaultdict(int)
        for pb in session.query(PatientBed).all():
            ward_id = ward_by_bed.get(pb.bed_id)
            name = ward_names.get(ward_id, _UNASSIGNED) if ward_id is not None else _UNASSIGNED
            counts[name] += 1
        return counts

    def _discharged_counts(self, session, target_date: str) -> dict:
        """{ward_name: count} of patients discharged on target_date ('YYYY-MM-DD'),
        attributed to their admission ward. Exact for any date — LogPatients
        keeps every discharge forever."""
        counts = defaultdict(int)
        for p in session.query(LogPatient).all():
            dep = str(p.departure_time or "").strip()
            # departure_time is a free-form "YYYY-MM-DDTHH:MM[:SS]" string, not
            # a native date column, so a date-prefix match is the safe way to
            # bucket it without risking a parse failure on an odd legacy value.
            if not dep.startswith(target_date):
                continue
            name = p.admission_ward_name or _UNASSIGNED
            counts[name] += 1
        return counts

    def _compute(self, session, target_date: str) -> list:
        discharged = self._discharged_counts(session, target_date)
        active = self._active_counts(session) if target_date == _today_str() else {}
        # Every real ward gets a row even with zero patients, so the report
        # reads as a complete census rather than silently omitting quiet
        # wards. "Unassigned" only appears when it actually has a count.
        all_ward_names = {w.ward_name for w in session.query(Ward).all()}
        names = all_ward_names | set(active) | set(discharged)
        names.discard(_UNASSIGNED)
        if active.get(_UNASSIGNED) or discharged.get(_UNASSIGNED):
            names.add(_UNASSIGNED)
        wards = []
        for name in sorted(names):
            a, d = active.get(name, 0), discharged.get(name, 0)
            wards.append({
                "ward_name": name,
                "active_patients": a,
                "discharged_patients": d,
                "total_patients": a + d,
            })
        return wards

    def get_today(self) -> dict:
        """Live (uncached) census for today — always fresh, doesn't touch WardDailyCensus."""
        today = _today_str()
        with SessionLocal() as session:
            wards = self._compute(session, today)
        return {"date": today, "wards": wards}

    def compute_and_save(self, target_date: str = None) -> dict:
        """Compute today's (or an explicit past date's) census and upsert it
        into WardDailyCensus. Safe to call repeatedly — always overwrites."""
        target_date = target_date or _today_str()
        with SessionLocal() as session:
            wards = self._compute(session, target_date)
            now = _now_str()
            ward_ids = {w.ward_name: w.ward_id for w in session.query(Ward).all()}
            for w in wards:
                existing = session.query(WardDailyCensus).filter(
                    WardDailyCensus.census_date == target_date,
                    WardDailyCensus.ward_name == w["ward_name"],
                ).first()
                if existing:
                    existing.active_patients     = w["active_patients"]
                    existing.discharged_patients = w["discharged_patients"]
                    existing.total_patients      = w["total_patients"]
                    existing.computed_at         = now
                else:
                    session.add(WardDailyCensus(
                        census_date=target_date,
                        ward_id=ward_ids.get(w["ward_name"]),
                        ward_name=w["ward_name"],
                        active_patients=w["active_patients"],
                        discharged_patients=w["discharged_patients"],
                        total_patients=w["total_patients"],
                        computed_at=now,
                    ))
            session.commit()
        return {"date": target_date, "wards": wards}

    def get_history(self, start_date: str = None, end_date: str = None) -> list:
        """Saved WardDailyCensus rows, optionally bounded by ['start_date', 'end_date'] inclusive."""
        with SessionLocal() as session:
            q = session.query(WardDailyCensus)
            if start_date:
                q = q.filter(WardDailyCensus.census_date >= start_date)
            if end_date:
                q = q.filter(WardDailyCensus.census_date <= end_date)
            rows = q.order_by(WardDailyCensus.census_date.desc(), WardDailyCensus.ward_name).all()
            return [{
                "date":                 r.census_date,
                "ward_id":              r.ward_id,
                "ward_name":            r.ward_name,
                "active_patients":      r.active_patients,
                "discharged_patients":  r.discharged_patients,
                "total_patients":       r.total_patients,
                "computed_at":          r.computed_at,
            } for r in rows]

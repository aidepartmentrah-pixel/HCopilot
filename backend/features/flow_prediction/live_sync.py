# =============================================================================
# flow_prediction/live_sync.py — Sync Real Patient Arrivals into HistoricalEdStays
# =============================================================================
#
# HistoricalEdStays was originally a one-time import of a static synthetic
# demo dataset (edstays_with_synth.csv, see scripts/import_ml_historical_data.py)
# spanning ~2019-10 to ~2020-01. Nothing else in the app ever added this
# deployment's own real patient activity to it, so the Flow Prediction
# dashboard was structurally frozen on that demo data forever, regardless of
# how many real patients actually passed through the ED.
#
# sync_live_arrivals() closes that gap: it copies each not-yet-synced local
# DailyPatients/LogPatients row's arrival_time into a new HistoricalEdStays
# row tagged source="live", so the flow-prediction pipeline can prefer real
# recent activity for display/lag-seeding (see data_processor.py) once any
# exists, while training keeps using the full corpus (synthetic + live) for
# richer seasonal learning.
#
# A DailyPatients row (still an active, undischarged stay) is synced too —
# the model predicts daily ARRIVAL counts, and a patient currently in the ED
# already arrived today regardless of whether they've been discharged yet.
# When that stay later discharges and moves to LogPatients (same subject_id/
# stay_id, per data_management/log_patients_manager.py's discharge-copy), the
# dedupe check below correctly recognizes it as already synced and does not
# double-count it.
#
# DEDUPE: keyed on (subject_id, stay_id) scoped to source="live" only — NOT
# on stay_id alone. The synthetic dataset's own stay_id range (confirmed
# ~30,000,012-39,999,965) directly overlaps HCopilot's local stay_id seeding
# range (starts at 30,000,001 — see patient_management/patient_manager.py),
# so a bare stay_id lookup against the whole table would risk treating an
# unrelated synthetic row as if it were this patient's own live sync record.
# Scoping every dedupe check to source="live" avoids that collision
# entirely, since synthetic rows are never tagged "live".
#
# Called from scheduler.py on the same on-startup / hourly / finalize-
# yesterday cadence already used for the ward census snapshot.
# =============================================================================

import logging
from datetime import datetime

from db.session import SessionLocal
from db.models import DailyPatient, LogPatient, HistoricalEdStay

logger = logging.getLogger(__name__)

# Tried in order after datetime.fromisoformat() (which alone covers both the
# frontend's own "YYYY-MM-DDTHH:MM" format and full ISO timestamps under
# Python 3.11's relaxed parser) fails — arrival_time is a free-text string
# with no app-wide format enforcement, so a couple of common fallbacks are
# worth trying before giving up on a row.
_FALLBACK_FORMATS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%m/%d/%Y %H:%M")


def _parse_arrival_time(value):
    """Best-effort parse of the free-text arrival_time string. None if unparsable."""
    if not value or not str(value).strip():
        return None
    text = str(value).strip()
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        pass
    for fmt in _FALLBACK_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    logger.warning("live_sync: could not parse arrival_time %r — skipping row", text)
    return None


def sync_live_arrivals() -> dict:
    """
    Copy any not-yet-synced DailyPatients/LogPatients rows into
    HistoricalEdStays as source="live" rows. Safe to call repeatedly —
    already-synced (subject_id, stay_id) pairs are skipped.

    Returns:
        {"synced": N, "skipped": M} — skipped counts rows whose arrival_time
        was missing or unparsable (never raises for those).
    """
    synced  = 0
    skipped = 0
    with SessionLocal() as session:
        already_synced = {
            (row.subject_id, row.stay_id)
            for row in session.query(HistoricalEdStay.subject_id, HistoricalEdStay.stay_id)
                              .filter(HistoricalEdStay.source == "live")
                              .all()
        }

        candidates = [
            (row.subject_id, row.stay_id, row.arrival_time, row.gender, row.destination)
            for row in session.query(DailyPatient).all()
        ] + [
            (row.subject_id, row.stay_id, row.arrival_time, row.gender, row.destination)
            for row in session.query(LogPatient).all()
        ]

        for subject_id, stay_id, arrival_time_raw, gender, destination in candidates:
            if (subject_id, stay_id) in already_synced:
                continue
            intime = _parse_arrival_time(arrival_time_raw)
            if intime is None:
                skipped += 1
                continue
            session.add(HistoricalEdStay(
                subject_id=subject_id, stay_id=stay_id,
                intime_synth=intime, gender=gender, disposition=destination,
                source="live",
            ))
            already_synced.add((subject_id, stay_id))
            synced += 1

        session.commit()

    if synced:
        logger.info("live_sync: synced %d new live arrival(s) into HistoricalEdStays (%d skipped)", synced, skipped)
    return {"synced": synced, "skipped": skipped}

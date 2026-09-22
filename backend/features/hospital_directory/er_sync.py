# =============================================================================
# hospital_directory/er_sync.py — ER Live-Roster Poll-Diff Safety Net
# =============================================================================
#
# The "double departure" mechanism (see docs/development/ER Live Roster
# Redesign/0. Slicing Task Table.md, slice ER7): a nurse's own manual
# discharge is authoritative whenever it happens. This module is the
# safety net that catches anyone a nurse forgot — called on an interval
# from scheduler.py, same as every other background job in this app.
#
# DESIGN:
#   1. Poll GET /er/current-visits (via hospital_directory.client, never
#      raises — any non-"ok" status is logged and skipped this cycle,
#      matching every other job in scheduler.py).
#   2. Compute the current er_visit_id set from the response.
#   3. The "last seen" baseline is derived FRESH from the database every
#      run (every DailyPatients row with a non-null er_visit_id) — never
#      held in memory. This is deliberate: an in-memory baseline would be
#      lost on every process restart, which could misfire a false wave of
#      departures on the very next poll. Deriving it from the DB instead
#      means a restart changes nothing about correctness.
#   4. Any such row whose er_visit_id is missing from the current poll's
#      set gets discharged via the shared discharge_active_stay()
#      (patient_management/discharge_manager.py — the same function every
#      other discharge path in the app uses), tagged
#      departure_source="api_detected".
#   5. Reappearance handling: a previously-departed er_visit_id showing up
#      in a later poll is NEVER matched back to the old (already-archived)
#      stay — DailyPatients no longer has that row once step 4 has run, so
#      it is structurally impossible for this query to "resume" it. A
#      fresh pick from the roster (see patient_management/api.py's
#      roster-origin create path) is what happens instead when a nurse
#      re-adds that person, which is exactly the desired "new admission,
#      never a resumed stay" behavior — confirmed as a real, unconfirmed-
#      by-the-vendor risk by the restful-api-integration-f9 peer session,
#      not just a theoretical concern.
# =============================================================================

import logging

from db.session import SessionLocal
from db.models import DailyPatient
from . import client
from features.patient_management.discharge_manager import discharge_active_stay

logger = logging.getLogger(__name__)


def reconcile_er_departures() -> dict:
    """
    One poll-diff cycle. Safe to call repeatedly and on any interval —
    fully idempotent (a patient already discharged has no DailyPatients
    row left to match on the next call).

    Returns:
        {"discharged": N, "status": <client status>} — "discharged" is 0
        whenever the client call didn't succeed (status != "ok"); never
        raises.
    """
    result = client.get_er_current_visits()
    if result["status"] != "ok":
        logger.warning("er_sync: could not poll the ER roster (%s) — skipping this cycle", result["status"])
        return {"discharged": 0, "status": result["status"]}

    current_ids = {
        str(item["er_visit_id"]) for item in result["items"]
        if item.get("er_visit_id") is not None
    }

    with SessionLocal() as session:
        tracked = session.query(DailyPatient.subject_id, DailyPatient.er_visit_id).filter(
            DailyPatient.er_visit_id.isnot(None),
        ).all()

    to_discharge = [subject_id for subject_id, er_visit_id in tracked if er_visit_id not in current_ids]

    discharged = 0
    for patient_id in to_discharge:
        try:
            discharge_active_stay(patient_id, departure_time=None, destination=None,
                                   departure_source="api_detected")
            discharged += 1
        except Exception:
            # Never let one bad row (e.g. a race with a manual discharge
            # that just happened) abort the rest of this cycle's reconciliation.
            logger.exception("er_sync: failed to auto-discharge patient %s", patient_id)

    if discharged:
        logger.info("er_sync: auto-discharged %d patient(s) no longer on the ER roster", discharged)
    return {"discharged": discharged, "status": "ok"}

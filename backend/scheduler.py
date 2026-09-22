# =============================================================================
# scheduler.py — Background jobs (daily ward census, live flow-prediction sync)
# =============================================================================
#
# Ward daily census (see features/ward_census/census_manager.py). Three
# triggers keep it accurate without requiring anyone to open the app:
#
#   1. On startup            — save today's snapshot immediately, so a
#                               freshly-deployed instance isn't empty until
#                               the next scheduled tick.
#   2. Every hour, on the hour — re-save today's snapshot, so WardDailyCensus
#                               stays reasonably fresh through the day even
#                               if GET /today (which is always live) is never
#                               called.
#   3. Daily at 00:05         — re-save YESTERDAY's snapshot one last time,
#                               to catch any discharge that happened in the
#                               last stretch before midnight, after which
#                               that date is never touched again (frozen).
#
# Live flow-prediction sync (see features/flow_prediction/live_sync.py) uses
# the same startup + hourly cadence (triggers 1-2) to keep HistoricalEdStays'
# "live" rows current. It does NOT need a ward-census-style "finalize
# yesterday" trigger: sync_live_arrivals() is fully idempotent and re-scans
# every not-yet-synced patient on every call (there's no per-date snapshot
# being frozen, unlike the census), so the hourly tick alone always catches
# up regardless of exactly when a stay arrived or discharged relative to
# midnight.
#
# ER live-roster departure safety net (see features/hospital_directory/
# er_sync.py, ER Live-Roster Redesign slice ER7) runs on its own short
# IntervalTrigger (~2 min) rather than the hourly cadence above — the whole
# point is catching a forgotten discharge promptly, not once an hour.
# reconcile_er_departures() re-derives its "last seen" baseline from the
# database on every call (no in-memory state), so it needs no startup-time
# immediate run the way the hourly jobs above do to avoid an empty first
# hour — there's nothing to "seed."
#
# BackgroundScheduler (thread-based) is used rather than AsyncIOScheduler
# because the job bodies do synchronous SQLAlchemy/pyodbc I/O — running them
# on a separate thread avoids blocking the FastAPI event loop.
# =============================================================================

from datetime import date, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from features.ward_census.census_manager import WardCensusManager
from features.flow_prediction.live_sync import sync_live_arrivals
from features.hospital_directory.er_sync import reconcile_er_departures

_scheduler = None


def _save_today():
    WardCensusManager().compute_and_save()


def _finalize_yesterday():
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    WardCensusManager().compute_and_save(yesterday)


def _sync_flow_prediction_live_data():
    sync_live_arrivals()


def _reconcile_er_departures():
    reconcile_er_departures()


def start_scheduler():
    """Idempotent — safe to call more than once (e.g. under a dev auto-reloader)."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _save_today()                       # trigger 1: immediate snapshot so today is never empty
    _sync_flow_prediction_live_data()   # immediate sync so a fresh instance isn't stuck on startup

    sched = BackgroundScheduler(daemon=True)
    sched.add_job(_save_today, CronTrigger(minute=0), id="ward_census_hourly")           # trigger 2
    sched.add_job(_finalize_yesterday, CronTrigger(hour=0, minute=5), id="ward_census_finalize_yesterday")  # trigger 3
    sched.add_job(_sync_flow_prediction_live_data, CronTrigger(minute=0), id="flow_prediction_live_sync_hourly")
    sched.add_job(_reconcile_er_departures, IntervalTrigger(minutes=2), id="er_departure_reconcile")
    sched.start()
    _scheduler = sched
    return _scheduler


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None

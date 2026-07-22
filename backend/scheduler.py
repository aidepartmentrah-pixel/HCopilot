# =============================================================================
# scheduler.py — Background jobs (daily ward census)
# =============================================================================
#
# The only recurring job today is the ward daily census (see
# features/ward_census/census_manager.py). Three triggers keep it accurate
# without requiring anyone to open the app:
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
# BackgroundScheduler (thread-based) is used rather than AsyncIOScheduler
# because the job body does synchronous SQLAlchemy/pyodbc I/O — running it on
# a separate thread avoids blocking the FastAPI event loop.
# =============================================================================

from datetime import date, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from features.ward_census.census_manager import WardCensusManager

_scheduler = None


def _save_today():
    WardCensusManager().compute_and_save()


def _finalize_yesterday():
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    WardCensusManager().compute_and_save(yesterday)


def start_scheduler():
    """Idempotent — safe to call more than once (e.g. under a dev auto-reloader)."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _save_today()  # trigger 1: immediate snapshot so today is never empty

    sched = BackgroundScheduler(daemon=True)
    sched.add_job(_save_today, CronTrigger(minute=0), id="ward_census_hourly")           # trigger 2
    sched.add_job(_finalize_yesterday, CronTrigger(hour=0, minute=5), id="ward_census_finalize_yesterday")  # trigger 3
    sched.start()
    _scheduler = sched
    return _scheduler


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None

# HTTP API for the statistics feature.
#
# Exposes 8 read-only GET endpoints that each delegate immediately to the
# corresponding StatsManager method.  No write operations are performed here —
# this module exists purely to wire the router to the business logic layer.
#
# Endpoints (all prefixed by the router mount path, e.g. /api/statistics/...):
#   GET /overview           — high-level KPIs (active patients, avg wait, occupancy…)
#   GET /data-quality       — timestamp integrity audit across DailyPatients + LogPatients
#   GET /waiting-times      — wait-to-bed and length-of-stay distributions
#   GET /acuity-breakdown   — per-ESI-level counts, avg wait, avg LOS
#   GET /throughput         — arrival counts bucketed by hour and day-of-week
#   GET /top-complaints     — top-N chief complaints ranked by frequency
#   GET /vitals-summary     — mean/min/max of six vital signs for current patients
#   GET /staff-stats        — nurse & doctor headcount, role breakdown, patient load

from fastapi import APIRouter, HTTPException
from .stats_manager import StatsManager

# A single shared StatsManager instance is safe here because StatsManager is
# stateless — it reads CSVs fresh on every method call.
router = APIRouter()
_mgr = StatsManager()


@router.get("/overview")
def get_overview():
    """
    Return high-level emergency-department KPIs.

    Aggregates data from DailyPatients (active) and LogPatients (discharged):
    active patient count, average wait-to-bed time, average length of stay,
    bed occupancy rate, average acuity, and percentage of long-waiters (>4 h).
    """
    return _mgr.overview()


@router.get("/data-quality")
def get_data_quality():
    """
    Audit timestamp integrity across DailyPatients and LogPatients.

    Returns counts of rows with missing arrival_time, bed_occupation_time before
    arrival (inverted_bed), and departure_time before arrival (inverted_departure),
    plus an overall quality percentage based on clean records.
    """
    return _mgr.data_quality()


@router.get("/waiting-times")
def get_waiting_times():
    """
    Return wait-to-bed and length-of-stay distributions.

    Wait times (arrival → bed_occupation_time) are capped at 1440 min (24 h);
    LOS values (arrival → departure_time) are capped at 10080 min (7 days).
    Both caps strip data-entry errors before computing statistics.
    """
    return _mgr.waiting_times()


@router.get("/acuity-breakdown")
def get_acuity_breakdown():
    """
    Return per-ESI-level (1–5) patient counts, average wait, and average LOS.

    ESI labels follow the Emergency Severity Index standard:
    1=Immediate, 2=Emergent, 3=Urgent, 4=Less Urgent, 5=Non-Urgent.
    """
    return _mgr.acuity_breakdown()


@router.get("/throughput")
def get_throughput():
    """
    Return patient arrival counts grouped by hour-of-day and day-of-week.

    Useful for identifying peak demand periods and planning staff schedules.
    """
    return _mgr.throughput()


@router.get("/top-complaints")
def get_top_complaints():
    """
    Return the top-10 chief complaints ranked by patient volume.

    Each entry includes the complaint label, total count, and average LOS
    for patients discharged with that complaint.
    """
    return _mgr.top_complaints()


@router.get("/vitals-summary")
def get_vitals_summary():
    """
    Return aggregated vital-sign statistics (mean, min, max) for active patients.

    Covers temperature, heart rate, respiratory rate, SpO2, SBP, and DBP.
    Each vital includes a 'normal' boolean flag indicating whether the average
    falls within the clinically accepted reference range.
    """
    return _mgr.vitals_summary()


@router.get("/staff-stats")
def get_staff_stats():
    """
    Return distribution and workload statistics for nurses and doctors.

    Includes headcount (total / active / absent), role breakdown for nurses
    (PN, RN, Bed_Admission…), type breakdown for doctors (doctor vs intern),
    shift distribution, and patient-load buckets for both groups.
    """
    return _mgr.staff_stats()


@router.get("/staff-member/nurse/{member_id}")
def get_nurse_detail(member_id: int):
    """
    Return full profile and patient/bed details for a single nurse.

    Includes personal fields, list of assigned active patients, their beds,
    and a ward-level distribution of those beds.
    """
    result = _mgr.staff_member_detail("nurse", member_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/staff-member/doctor/{member_id}")
def get_doctor_detail(member_id: int):
    """
    Return full profile and patient/bed details for a single doctor.

    Includes personal fields, list of assigned active patients, their beds,
    and a ward-level distribution of those beds.
    """
    result = _mgr.staff_member_detail("doctor", member_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

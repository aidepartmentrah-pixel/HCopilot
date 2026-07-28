# =============================================================================
# daily_analysis/api.py — Date-filterable Daily Statistics Endpoint
# =============================================================================
#
#   GET /api/daily-analysis/report?date=YYYY-MM-DD  — combined patients/wards/
#                                                       doctors/nurses report
#                                                       for that date (defaults
#                                                       to today if omitted)
# =============================================================================

from typing import Optional

from fastapi import APIRouter, HTTPException

from .analysis_manager import DailyAnalysisManager

router = APIRouter()
mgr    = DailyAnalysisManager()


@router.get("/report")
async def get_daily_report(date: Optional[str] = None):
    try:
        return mgr.get_report(date)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

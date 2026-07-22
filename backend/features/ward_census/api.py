# =============================================================================
# ward_census/api.py — Daily Ward Patient Census Endpoints
# =============================================================================
#
# ENDPOINTS:
#   GET  /api/ward-census/today    — live count per ward for right now (always
#                                     fresh; does not read/write WardDailyCensus)
#   GET  /api/ward-census/history  — saved daily snapshots, optionally bounded
#                                     by ?start=YYYY-MM-DD&end=YYYY-MM-DD
#   POST /api/ward-census/snapshot — manually (re)save today's — or an explicit
#                                     ?date=YYYY-MM-DD — census. The scheduler
#                                     (see backend/scheduler.py) calls the same
#                                     manager method automatically; this exists
#                                     as a manual trigger/testing escape hatch.
# =============================================================================

from typing import Optional

from fastapi import APIRouter, HTTPException

from .census_manager import WardCensusManager

router = APIRouter()
mgr    = WardCensusManager()


@router.get("/today")
async def get_today_census():
    try:
        return mgr.get_today()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_census_history(start: Optional[str] = None, end: Optional[str] = None):
    try:
        return {"rows": mgr.get_history(start, end)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/snapshot")
async def save_census_snapshot(date: Optional[str] = None):
    try:
        return mgr.compute_and_save(date)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

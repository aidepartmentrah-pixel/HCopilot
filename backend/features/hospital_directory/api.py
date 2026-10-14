# =============================================================================
# hospital_directory/api.py — Hospital Directory API Config & Patient Search
# =============================================================================
#
# ENDPOINTS:
#   GET  /config                          — current connection settings (key masked)
#   POST /config/save                     — create/update the connection settings
#   POST /config/test-connection          — health + auth check against the SAVED
#                                            settings; persists the last-test result
#   GET  /config/middle-name-candidates   — the admin-editable guess-loop candidate list
#   POST /config/middle-name-candidates   — replace the candidate list
#   POST /config/er-roster/test           — force one /er/current-visits call, ignoring the switch
#   POST /config/er-roster/enable         — flip the "Live ER roster" switch (enable needs a passing test)
#   GET  /patients/search                 — proxy a structured patient search
#   GET  /patients/find-possible-matches  — the "Find possible matches" guess loop
#
# See client.py's module docstring for the status vocabulary every
# search/test result carries. No backend role-enforcement exists anywhere in
# this app today (see features/model_training/api.py's own docstring) —
# these endpoints are unauthenticated like every other endpoint here, not a
# new gap introduced by this feature. The frontend hides the Settings tab
# from non-admin users; that is a UI convenience only, not an access boundary.
# =============================================================================

import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from db.session import SessionLocal
from db.models import LogPatient
from . import client, settings_db, crypto_utils, candidates_db, guess

router = APIRouter()


class ExternalApiConfigSave(BaseModel):
    base_url: str = Field(..., min_length=1)
    # None, empty, or a masked placeholder ("•••••me") => leave the stored key unchanged.
    api_key: Optional[str] = None
    timeout_seconds: int = Field(10, ge=1, le=120)
    verify_tls: bool = True


@router.get("/config")
async def get_config():
    """Current settings, API key masked. Never returns the real key — see reveal-key... (not exposed in v1)."""
    try:
        row = settings_db.get_settings_row()
        api_key, key_err = crypto_utils.decrypt_api_key(row["api_key_encrypted"])
        return {
            "configured":         bool(row["base_url"]),
            "base_url":           row["base_url"],
            "api_key_masked":     crypto_utils.mask_api_key(api_key),
            "api_key_error":      key_err,  # "key_missing" | "key_error" | None
            "timeout_seconds":    row["timeout_seconds"],
            "verify_tls":         row["verify_tls"],
            "er_roster_enabled":  row["er_roster_enabled"],
            "last_test_status":   row["last_test_status"],
            "last_test_message":  row["last_test_message"],
            "last_test_at":       row["last_test_at"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config/save")
async def save_config(body: ExternalApiConfigSave):
    """
    Create/update the connection settings. Applies immediately — no restart.
    A masked placeholder (or an omitted key) leaves the stored key
    unchanged, so re-saving the form without retyping the key never
    overwrites it with literal mask characters.
    """
    try:
        api_key_encrypted = None
        if body.api_key and not crypto_utils.is_masked_placeholder(body.api_key):
            api_key_encrypted = crypto_utils.encrypt_api_key(body.api_key)
            if api_key_encrypted is None:
                raise HTTPException(
                    status_code=500,
                    detail="Cannot encrypt the API key — SETTINGS_ENCRYPTION_KEY is not configured on this server.",
                )
        settings_db.save_settings(
            base_url=body.base_url.strip(),
            api_key_encrypted=api_key_encrypted,
            timeout_seconds=body.timeout_seconds,
            verify_tls=body.verify_tls,
        )
        return {"success": True, "message": "Hospital Directory API settings saved."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config/test-connection")
async def test_connection():
    """
    Test the currently SAVED settings (save first, then test) — health
    check, then only if healthy, an authenticated call to prove the key
    works. Persists the outcome as the row's last_test_status/message/at.
    """
    try:
        result = client.verify_connection()
        status = "success" if result["status"] == "ok" else "failure"
        settings_db.update_last_test_result(status, result.get("message", ""))
        return {
            "success": result["status"] == "ok",
            "status":  result["status"],
            "message": result.get("message", ""),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _check_er_roster() -> dict:
    """One forced roster call (ignores the switch) plus a shape check. Never raises."""
    result = client.get_er_current_visits(force=True)
    if result["status"] != "ok":
        return {"success": False, "status": result["status"],
                "message": result.get("message") or "The ER roster endpoint did not respond as expected."}
    items = result["items"]
    if not isinstance(items, list) or any(not isinstance(i, dict) or i.get("er_visit_id") is None for i in items):
        return {"success": False, "status": "invalid_response",
                "message": "The ER roster responded, but entries are missing er_visit_id."}
    return {"success": True, "status": "ok", "message": f"ER roster reachable — {len(items)} patient(s) currently listed."}


@router.post("/config/er-roster/test")
async def test_er_roster():
    """Check that the directory API serves /er/current-visits. Does not change the switch."""
    try:
        return _check_er_roster()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ErRosterEnable(BaseModel):
    enabled: bool


@router.post("/config/er-roster/enable")
async def set_er_roster_enabled(body: ErRosterEnable):
    """
    Turn the Live ER roster on or off. Turning it OFF always succeeds.
    Turning it ON re-runs the roster check server-side and refuses (leaving
    the switch off) unless it passes — a UI can't skip the test.
    """
    try:
        if body.enabled:
            check = _check_er_roster()
            if not check["success"]:
                return {**check, "er_roster_enabled": False}
        if not settings_db.set_er_roster_enabled(body.enabled):
            return {"success": False, "status": "disabled",
                     "message": "Save the Hospital Directory connection settings first.",
                     "er_roster_enabled": False}
        return {"success": True, "status": "ok", "er_roster_enabled": body.enabled,
                 "message": "Live ER roster enabled." if body.enabled else "Live ER roster disabled."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patients/search")
async def search_patients(patient_id: Optional[str] = None, first_name: Optional[str] = None,
                           father_name: Optional[str] = None, last_name: Optional[str] = None,
                           limit: int = 20):
    """
    Proxy a patient search to the external directory. The vendor API accepts
    exactly one search mode per call: patient_id alone, or first_name +
    father_name + last_name together (confirmed via live testing against the
    deployed mock — there is no free-text search on this endpoint). Always
    returns 200 with a status/message rather than propagating a raw error —
    an unreachable or misconfigured external API must never break the
    Add-Patient search box; local patient creation stays available either way.
    """
    try:
        result = client.search_patients(
            patient_id=(patient_id or "").strip() or None,
            first_name=(first_name or "").strip() or None,
            father_name=(father_name or "").strip() or None,
            last_name=(last_name or "").strip() or None,
            limit=limit,
        )
        if result["status"] != "ok":
            return {"success": False, "status": result["status"], "message": result.get("message", ""), "items": []}
        return {"success": True, "status": "ok", "items": result["items"], "total": result["total"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/er/current-visits")
async def er_current_visits():
    """
    Proxy the live ER roster (ER Live-Roster Redesign — see docs/
    development/ER Live Roster Redesign/). Same never-break-the-caller
    contract as /patients/search: always 200 with a status/message rather
    than propagating a raw error, so an unreachable/misconfigured
    external API never blocks the Addition tab's manual fallback.
    """
    try:
        result = client.get_er_current_visits()
        if result["status"] != "ok":
            return {"success": False, "status": result["status"], "message": result.get("message", ""), "items": []}
        items = _without_handled_visits(result["items"])
        return {"success": True, "status": "ok", "items": items, "total": len(items)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# How long a manually discharged visit stays off the roster while the hospital API still lists it.
_ROSTER_HIDE_HOURS = float(os.environ.get("ER_ROSTER_HIDE_HOURS", "24"))


def _without_handled_visits(items: list) -> list:
    """
    Drop roster entries a nurse already admitted AND manually discharged in HCopilot within the last
    _ROSTER_HIDE_HOURS (default 24 h).

    The hospital system keeps listing a visit until its own staff close it, so a person discharged
    in HCopilot would otherwise reappear on the roster straight away. Deliberately narrow:
      * only departure_source == "manual" — an "api_detected" departure means the hospital already
        dropped the visit, so the same id showing up again is a NEW visit and must stay visible;
      * only recent discharges — if ids were ever reused later, a genuinely new visit is not hidden.
    Anyone hidden by mistake can still be re-admitted via Search Directory / Enter Manually, which
    creates a brand-new stay (never a resumed one — see er_sync.py). Currently-active stays are
    hidden client-side already; this covers the archived ones.
    """
    cutoff = datetime.now() - timedelta(hours=_ROSTER_HIDE_HOURS)
    with SessionLocal() as session:
        rows = (
            session.query(LogPatient.er_visit_id, LogPatient.departure_time)
            .filter(LogPatient.er_visit_id.isnot(None), LogPatient.departure_source == "manual")
            .all()
        )
    handled = set()
    for visit_id, departed in rows:
        try:
            if datetime.fromisoformat(str(departed)) >= cutoff:
                handled.add(str(visit_id))
        except (TypeError, ValueError):
            continue
    if not handled:
        return items
    return [i for i in items if str(i.get("er_visit_id")) not in handled]


@router.get("/patients/find-possible-matches")
async def find_possible_matches(first_name: str, last_name: str):
    """
    The "Find possible matches" guess loop — tried when the user knows a
    patient's first and last name but not the middle/father name. See
    guess.py for the concurrency/dedup design (modeled on the sibling app's
    documented behavior). Only ever fired by one explicit button click, not
    per keystroke.
    """
    first_name, last_name = first_name.strip(), last_name.strip()
    if not first_name or not last_name:
        raise HTTPException(status_code=400, detail="first_name and last_name are required")
    try:
        result = guess.find_possible_matches(first_name, last_name)
        if result["status"] != "ok":
            return {"success": False, "status": result["status"], "message": result.get("message", ""),
                     "items": [], "tried": result.get("tried", 0)}
        return {"success": True, "status": "ok", "items": result["items"], "tried": result["tried"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config/middle-name-candidates")
async def get_middle_name_candidates():
    """
    The active candidate list, in try-order. No password gate (same trust
    level as any other search-support endpoint) — read fresh off the DB so
    an admin's edit is live on the very next guess loop.
    """
    try:
        return {"names": candidates_db.list_candidates()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class MiddleNameCandidatesSave(BaseModel):
    names: list[str]


@router.post("/config/middle-name-candidates")
async def save_middle_name_candidates(body: MiddleNameCandidatesSave):
    """Replace the entire candidate list, preserving the given order as try-order."""
    try:
        saved = candidates_db.replace_candidates(body.names)
        return {"success": True, "names": saved}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

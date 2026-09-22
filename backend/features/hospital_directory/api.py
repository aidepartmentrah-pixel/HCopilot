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

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

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
        return {"success": True, "status": "ok", "items": result["items"], "total": result["total"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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

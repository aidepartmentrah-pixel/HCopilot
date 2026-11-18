# =============================================================================
# hospital_directory/client.py — Canonical Hospital Directory API Client
# =============================================================================
#
# The ONLY module in this codebase allowed to make HTTP calls to the external
# Hospital Directory API and to 3iSoft's separate ER API (v1.2, see
# get_er_current_visits). Any code that needs data from it (patient search,
# the settings "Test Connection" button, a future doctor/worker lookup) must
# go through the functions here — do not scatter ad-hoc requests/httpx calls
# to this API elsewhere.
#
# Every public function returns a structured dict with a "status" key and
# NEVER raises for an expected failure mode (network down, bad key, 4xx from
# the vendor, etc.) — callers render each status as a distinct, honest
# message instead of a generic error or a silently-empty result. This
# mirrors the app's existing "local data must survive an external outage"
# principle: patient search failing here must never break patient creation.
#
# Status vocabulary:
#   ok                — call succeeded
#   disabled          — no base_url configured yet (not treated as an error)
#   er_not_configured — no ER API base URL saved yet (ER roster only; not an
#                        error — same treatment as "disabled")
#   key_missing       — a key is stored but SETTINGS_ENCRYPTION_KEY isn't set
#                        on this process
#   key_error         — a key is stored but doesn't decrypt with the
#                        currently-configured SETTINGS_ENCRYPTION_KEY
#   unauthorized      — HTTP 401 (bad/expired API key)
#   not_found         — HTTP 404 (exact-lookup only)
#   bad_request       — HTTP 400/422
#   unhealthy         — /health responded but reports status != "healthy"
#   timeout           — request timed out
#   connection_error  — could not reach the server at all (also used for a
#                        503 "dependency unavailable" response; the ER API
#                        has no 503 — any failure there is "couldn't poll")
#   ssl_error         — TLS verification failed
#   http_error        — any other non-2xx
#   invalid_response  — 2xx but the body wasn't parseable/expected shape
#   roster_off        — the admin "Live ER roster" switch is OFF; returned
#                        BEFORE any HTTP call (ER roster only). Not an error.
# =============================================================================

import logging
from datetime import datetime

import requests

from . import settings_db, crypto_utils

logger = logging.getLogger(__name__)


def _load_config() -> dict:
    """
    Load and decrypt the current connection settings.

    Returns {"status": "ok", "base_url", "api_key", "timeout_seconds",
    "verify_tls"} or {"status": "disabled"|"key_missing"|"key_error",
    "message": ...} when the client can't be used yet.
    """
    row = settings_db.get_settings_row()
    if not row["base_url"]:
        return {"status": "disabled", "message": "Hospital Directory API is not configured yet."}
    api_key, key_err = crypto_utils.decrypt_api_key(row["api_key_encrypted"])
    if key_err == "key_missing":
        return {"status": "key_missing", "message": "SETTINGS_ENCRYPTION_KEY is not set on this server."}
    if key_err == "key_error":
        return {"status": "key_error", "message": "Stored API key could not be decrypted (was it copied from a different environment?)."}
    return {
        "status": "ok",
        "base_url": row["base_url"].rstrip("/"),
        "api_key": api_key,
        "timeout_seconds": row["timeout_seconds"] or 10,
        "verify_tls": bool(row["verify_tls"]),
    }


ER_API_LABEL = "ER API"


def _load_er_config() -> dict:
    """
    Load and decrypt the ER API's OWN settings (er_base_url/er_api_key_encrypted).
    Never falls back to the Directory base_url/key: on the hospital network
    the ER API (meraj) rejects the Directory key with 401, and the Directory
    host (malin) answers 500 on /his-er. Timeout and TLS verification are
    shared with the Directory settings.
    """
    row = settings_db.get_settings_row()
    if not row.get("er_base_url"):
        return {"status": "er_not_configured", "message": "The ER API is not configured yet (Settings → ER API)."}
    api_key, key_err = crypto_utils.decrypt_api_key(row.get("er_api_key_encrypted"))
    if key_err == "key_missing":
        return {"status": "key_missing", "message": "SETTINGS_ENCRYPTION_KEY is not set on this server."}
    if key_err == "key_error":
        return {"status": "key_error", "message": "Stored ER API key could not be decrypted (was it copied from a different environment?)."}
    return {
        "status": "ok",
        "label": ER_API_LABEL,
        "base_url": row["er_base_url"].strip().rstrip("/"),
        "api_key": api_key or "",
        "timeout_seconds": row["timeout_seconds"] or 10,
        "verify_tls": bool(row["verify_tls"]),
    }


def _parse_error_message(resp) -> str | None:
    """Every non-2xx response is contractually {"error": CODE, "message": text} — extract it."""
    try:
        return resp.json().get("message")
    except ValueError:
        return None


def _get(cfg: dict, path: str, params: dict | None = None, auth: bool = True) -> dict:
    """Issue one GET request using an already-loaded config dict; never raises."""
    label = cfg.get("label", "Hospital Directory API")
    headers = {"X-API-Key": cfg["api_key"]} if auth else {}
    try:
        resp = requests.get(
            f"{cfg['base_url']}{path}",
            params=params, headers=headers,
            timeout=cfg["timeout_seconds"], verify=cfg["verify_tls"],
        )
    except requests.exceptions.SSLError as e:
        return {"status": "ssl_error", "message": f"TLS verification failed: {e}"}
    except requests.exceptions.Timeout:
        return {"status": "timeout", "message": f"The {label} did not respond in time."}
    except requests.exceptions.ConnectionError:
        return {"status": "connection_error", "message": f"Could not reach the {label}."}
    except requests.exceptions.RequestException as e:
        return {"status": "http_error", "message": str(e)}

    if resp.status_code == 200:
        try:
            return {"status": "ok", "data": resp.json()}
        except ValueError:
            return {"status": "invalid_response", "message": "Response was not valid JSON."}

    message = _parse_error_message(resp)
    if resp.status_code == 401:
        return {"status": "unauthorized", "message": message or f"{label} key rejected."}
    if resp.status_code == 404:
        return {"status": "not_found", "message": message or "Not found."}
    if resp.status_code in (400, 422):
        return {"status": "bad_request", "message": message or "Invalid search parameters."}
    if resp.status_code == 503:
        return {"status": "connection_error", "message": message or f"{label} dependency is unavailable."}
    return {"status": "http_error", "message": message or f"HTTP {resp.status_code}"}


# ── Public API ──────────────────────────────────────────────────────────────

def check_health() -> dict:
    """
    GET /health — unauthenticated. Proves reachability only, never that the
    configured key works (see verify_key()/verify_connection()). Uses the
    saved base_url directly rather than _load_config(), since health doesn't
    require a decryptable key.
    """
    row = settings_db.get_settings_row()
    if not row["base_url"]:
        return {"status": "disabled", "message": "Hospital Directory API is not configured yet."}
    cfg = {
        "base_url": row["base_url"].rstrip("/"),
        "timeout_seconds": row["timeout_seconds"] or 10,
        "verify_tls": bool(row["verify_tls"]),
    }
    result = _get(cfg, "/health", auth=False)
    if result["status"] != "ok":
        return result
    body = result["data"]
    if not isinstance(body, dict) or body.get("status") != "healthy":
        return {"status": "unhealthy", "message": f"Hospital Directory API reports status={body.get('status')!r}." if isinstance(body, dict) else "Hospital Directory API returned an unexpected health response."}
    return {"status": "ok", "message": "Hospital Directory API is reachable.", "data": body}


def verify_key() -> dict:
    """
    Prove the configured API key actually authenticates, via the cheapest
    real authenticated call available: an exact patient_id lookup for a
    value guaranteed not to exist. A 200 with an empty result (not a 404 —
    the search endpoint always returns 200 even for zero matches) proves the
    key is valid; a 401 proves it's rejected.
    """
    cfg = _load_config()
    if cfg["status"] != "ok":
        return cfg
    result = _get(cfg, "/patients", params={"patient_id": "__hcopilot_key_verify__"})
    if result["status"] == "ok":
        return {"status": "ok", "message": "API key verified — authenticated successfully."}
    return result


def verify_connection() -> dict:
    """
    The full "Test Connection" check: health first, and only if that
    succeeds, a real authenticated call to prove the key works. Skips the
    key check entirely if the server isn't even reachable, so a down server
    is never misreported as "bad key".
    """
    health = check_health()
    if health["status"] != "ok":
        return health
    key = verify_key()
    if key["status"] != "ok":
        return key
    return {"status": "ok", "message": "Server reachable and API key verified."}


def search_patients(patient_id: str | None = None, first_name: str | None = None,
                     father_name: str | None = None, last_name: str | None = None,
                     limit: int = 20, offset: int = 0) -> dict:
    """
    GET /patients — confirmed (via live testing against the deployed mock,
    see its own /openapi.json) to accept exactly one search mode per call:
    either `patient_id` alone, or `first_name`+`father_name`+`last_name`
    together as three separate params. There is no free-text `q` parameter
    on this endpoint (despite an earlier/different draft spec describing
    one) and no `visit_id`/medical_file_number/phone_number concept — the
    Patient object is just patient_id, full_name, first_name, last_name,
    birth_date, age, sex.
    """
    has_id    = bool(patient_id)
    has_names = bool(first_name) and bool(father_name) and bool(last_name)
    if not has_id and not has_names:
        return {"status": "bad_request",
                "message": "Provide a Patient ID, or First, Father, and Last name together."}

    cfg = _load_config()
    if cfg["status"] != "ok":
        return cfg
    params = {"limit": min(max(limit, 1), 500), "offset": max(offset, 0)}
    if has_id:
        params["patient_id"] = patient_id
    else:
        params["first_name"], params["father_name"], params["last_name"] = first_name, father_name, last_name
    result = _get(cfg, "/patients", params=params)
    if result["status"] != "ok":
        return result
    body = result["data"]
    if not isinstance(body, dict) or "items" not in body:
        return {"status": "invalid_response", "message": "Unexpected response shape from Hospital Directory API."}
    return {"status": "ok", "items": body["items"], "total": body.get("total", len(body["items"]))}


def get_patient(patient_id: str) -> dict:
    """GET /patients/{patient_id} — exact lookup. There is no visit concept in this API."""
    cfg = _load_config()
    if cfg["status"] != "ok":
        return cfg
    result = _get(cfg, f"/patients/{patient_id}")
    if result["status"] != "ok":
        return result
    return {"status": "ok", "patient": result["data"]}


# 3iSoft v1.2 gender values: Arabic labels, or the raw code when they can't
# resolve it. Mapped to HCopilot's own "Male"/"Female" convention (the ISBAR
# gender options); anything else is "unknown" (None) — never guessed.
_ER_GENDER_MAP = {"ذكر": "Male", "انثى": "Female", "أنثى": "Female"}


def map_er_gender(raw) -> str | None:
    """ذكر -> Male, انثى -> Female, anything else (incl. a raw code or null) -> None."""
    if raw is None:
        return None
    return _ER_GENDER_MAP.get(str(raw).strip())


def to_local_wall_clock(value) -> str | None:
    """
    ISO 8601 with offset (e.g. 2026-11-10T07:15:00+02:00) -> naive local
    wall-clock "YYYY-MM-DDTHH:MM:SS" in this process's timezone (TZ=Asia/Beirut
    in compose — every timestamp HCopilot stores is naive local time, see
    features/timestamp_utils.py). A value without an offset is taken as
    already-local. Unparseable -> None (never crash the roster on one bad row).
    """
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt.replace(microsecond=0).isoformat()


def _clean_name(value) -> str | None:
    if value is None:
        return None
    v = str(value).strip()
    return v or None


def _normalize_er_item(item: dict) -> dict:
    """
    One v1.2 ER item -> HCopilot's shape. All 8 fields are always present but
    any can be null, INCLUDING the names. Keeps the vendor's raw gender as
    gender_raw and the original timestamp as arrival_time_raw.
    """
    age = item.get("age")
    if isinstance(age, bool) or not isinstance(age, (int, float)):
        age = None
    complaint = item.get("chief_complaint")
    return {
        "er_visit_id":      str(item["er_visit_id"]),
        "first_name":       _clean_name(item.get("first_name")),
        "father_name":      _clean_name(item.get("father_name")),
        "last_name":        _clean_name(item.get("last_name")),
        "arrival_time":     to_local_wall_clock(item.get("arrival_time")),
        "arrival_time_raw": item.get("arrival_time"),
        "gender":           map_er_gender(item.get("gender")),
        "gender_raw":       item.get("gender"),
        "age":              int(age) if age is not None else None,
        "chief_complaint":  (str(complaint).strip() or None) if complaint is not None else None,
    }


def get_er_current_visits(force: bool = False) -> dict:
    """
    GET {ER base}/current-visits — the live ER roster (ER Live-Roster
    Redesign, see docs/development/ER Live Roster Redesign/).

    As DELIVERED by 3iSoft (v1.2, 18 Nov 2026) this is a SEPARATE ER API —
    real: http://meraj:8080/his-er/api/er/v1 — with its own address and its
    own X-API-Key, configured via the ER settings (_load_er_config), never
    the Directory base_url/key. (Our original proposal had it as
    /er/current-visits on the Directory API; that path now 404s.)

    Contract: every active ER visit in state "in preparation", as one full
    unpaginated snapshot ordered by arrival_time then visit id; an empty ER
    is 200 with an empty list. All 8 fields always present, any may be null
    (names included). No 503: ANY failure is "couldn't poll", never "the ER
    is empty" — er_sync.py relies on that, since a wrongly-empty snapshot
    would auto-discharge everyone. Items are normalized by
    _normalize_er_item (gender mapped, arrival_time made local);
    `er_visit_id` is the only field callers should key on.

    Gated by the admin "Live ER roster" switch (settings_db
    er_roster_enabled, default OFF): while off this returns "roster_off"
    without touching the network. `force=True` bypasses the switch and is
    used only by the "Test ER roster" check (see api.py) — never by pollers.
    """
    if not force and not settings_db.get_settings_row()["er_roster_enabled"]:
        return {"status": "roster_off", "message": "Live ER roster is not enabled."}
    cfg = _load_er_config()
    if cfg["status"] != "ok":
        return cfg
    result = _get(cfg, "/current-visits")
    if result["status"] == "not_found":
        return {"status": "not_found",
                "message": "The ER API answered 404 for /current-visits — check the ER base URL "
                           "(it should end in /his-er/api/er/v1)."}
    if result["status"] == "unauthorized":
        return {"status": "unauthorized",
                "message": "ER API key rejected (HTTP 401) — check the ER API key in Settings. "
                           "The ER API has its own key; the Directory key is not accepted."}
    if result["status"] != "ok":
        return result
    body = result["data"]
    if not isinstance(body, dict) or not isinstance(body.get("items"), list):
        return {"status": "invalid_response", "message": "Unexpected response shape from the ER API."}
    if body.get("success") is False:
        return {"status": "invalid_response", "message": "The ER API reported success=false."}
    raw_items = body["items"]
    if any(not isinstance(i, dict) or i.get("er_visit_id") is None for i in raw_items):
        # Refuse the WHOLE snapshot rather than silently dropping rows: a
        # dropped row would look like a departure to er_sync.
        return {"status": "invalid_response", "message": "The ER API responded, but some entries are missing er_visit_id."}
    items = [_normalize_er_item(i) for i in raw_items]
    return {"status": "ok", "items": items, "total": body.get("total", len(items))}

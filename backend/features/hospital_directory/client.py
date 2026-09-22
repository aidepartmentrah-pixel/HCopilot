# =============================================================================
# hospital_directory/client.py — Canonical Hospital Directory API Client
# =============================================================================
#
# The ONLY module in this codebase allowed to make HTTP calls to the external
# Hospital Directory API. Any code that needs data from it (patient search,
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
#                        503 "dependency unavailable" response)
#   ssl_error         — TLS verification failed
#   http_error        — any other non-2xx
#   invalid_response  — 2xx but the body wasn't parseable/expected shape
# =============================================================================

import logging

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


def _parse_error_message(resp) -> str | None:
    """Every non-2xx response is contractually {"error": CODE, "message": text} — extract it."""
    try:
        return resp.json().get("message")
    except ValueError:
        return None


def _get(cfg: dict, path: str, params: dict | None = None, auth: bool = True) -> dict:
    """Issue one GET request using an already-loaded config dict; never raises."""
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
        return {"status": "timeout", "message": "The Hospital Directory API did not respond in time."}
    except requests.exceptions.ConnectionError:
        return {"status": "connection_error", "message": "Could not reach the Hospital Directory API."}
    except requests.exceptions.RequestException as e:
        return {"status": "http_error", "message": str(e)}

    if resp.status_code == 200:
        try:
            return {"status": "ok", "data": resp.json()}
        except ValueError:
            return {"status": "invalid_response", "message": "Response was not valid JSON."}

    message = _parse_error_message(resp)
    if resp.status_code == 401:
        return {"status": "unauthorized", "message": message or "API key rejected."}
    if resp.status_code == 404:
        return {"status": "not_found", "message": message or "Not found."}
    if resp.status_code in (400, 422):
        return {"status": "bad_request", "message": message or "Invalid search parameters."}
    if resp.status_code == 503:
        return {"status": "connection_error", "message": message or "Hospital Directory API dependency is unavailable."}
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


def get_er_current_visits() -> dict:
    """
    GET /er/current-visits — ER Live-Roster Redesign (see docs/development/
    ER Live Roster Redesign/). A separate system from the his-general
    Directory API in practice (ER data currently lives behind 3iSoft's
    "meraj" system) but exposed on this same host/auth/conventions per the
    v1.2 proposal — not yet sent to 3iSoft as of this writing; a mock
    implementation is live at dev time for exactly this reason.

    Always a full, unpaginated snapshot of everyone currently in the ER
    (no limit/offset — see the requirement doc's own §4: a partial page
    would make someone who simply fell off it look like they'd departed,
    which would corrupt the departure-detection diff in features/
    hospital_directory/er_sync.py). Treat `gender`/`age`/`chief_complaint`
    as optional, unconfirmed-shape fields — never require them at the
    call site (see the sex-field precedent in this module's own docstring:
    vendor-documented shapes have already been wrong once for this
    contract). `er_visit_id` is the only field callers should key on.
    """
    cfg = _load_config()
    if cfg["status"] != "ok":
        return cfg
    result = _get(cfg, "/er/current-visits")
    if result["status"] != "ok":
        return result
    body = result["data"]
    if not isinstance(body, dict) or "items" not in body:
        return {"status": "invalid_response", "message": "Unexpected response shape from Hospital Directory API."}
    return {"status": "ok", "items": body["items"], "total": body.get("total", len(body["items"]))}

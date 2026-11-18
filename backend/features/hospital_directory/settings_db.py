# =============================================================================
# hospital_directory/settings_db.py — Connection Settings DB Layer
# =============================================================================
#
# Single-row table (ExternalApiSettings, integration_name="hospital_directory")
# holding the external Hospital Directory API's connection details. Every
# function here reads/writes the DB directly with no in-process caching, so a
# change saved via POST /api/hospital-directory/config/save takes effect on
# the very next search or test-connection call — no backend restart needed.
#
# api_key_encrypted / er_api_key_encrypted are Fernet ciphertext (see
# crypto_utils.py); this module never decrypts them — client.py does that at
# call time.
#
# The same row also holds the SEPARATE ER API's settings (er_base_url,
# er_api_key_encrypted — v1.2 as delivered by 3iSoft lives on "meraj", with
# its own key). Saving the Directory settings never touches them, and
# save_er_settings() never touches the Directory ones.
# =============================================================================

from datetime import datetime, timezone

from db.session import SessionLocal
from db.models import ExternalApiSettings

INTEGRATION_NAME = "hospital_directory"

_DEFAULTS = {
    "base_url": None, "api_key_encrypted": None,
    "timeout_seconds": 10, "verify_tls": True, "er_roster_enabled": False,
    "er_base_url": None, "er_api_key_encrypted": None,
    "last_test_status": None, "last_test_message": None, "last_test_at": None,
}


def _row_to_dict(row: ExternalApiSettings) -> dict:
    return {
        "base_url":           row.base_url,
        "api_key_encrypted":  row.api_key_encrypted,
        "timeout_seconds":    row.timeout_seconds,
        "verify_tls":         row.verify_tls,
        "er_roster_enabled":  bool(row.er_roster_enabled),
        "er_base_url":          row.er_base_url,
        "er_api_key_encrypted": row.er_api_key_encrypted,
        "last_test_status":   row.last_test_status,
        "last_test_message":  row.last_test_message,
        "last_test_at":       row.last_test_at.isoformat() if row.last_test_at else None,
    }


def get_settings_row() -> dict:
    """Current connection settings, or defaults (base_url=None) if never saved."""
    with SessionLocal() as session:
        row = session.query(ExternalApiSettings).filter(
            ExternalApiSettings.integration_name == INTEGRATION_NAME
        ).first()
        return _row_to_dict(row) if row is not None else dict(_DEFAULTS)


def save_settings(base_url: str, api_key_encrypted: str | None, timeout_seconds: int, verify_tls: bool) -> dict:
    """
    Create or update the single settings row.

    api_key_encrypted=None leaves the stored key unchanged — used when the
    frontend re-submits the masked placeholder rather than a real new key
    (see hospital_directory/api.py, which decides when to pass None here).
    """
    with SessionLocal() as session:
        row = session.query(ExternalApiSettings).filter(
            ExternalApiSettings.integration_name == INTEGRATION_NAME
        ).first()
        if row is None:
            row = ExternalApiSettings(integration_name=INTEGRATION_NAME)
            session.add(row)
        row.base_url = base_url
        if api_key_encrypted is not None:
            row.api_key_encrypted = api_key_encrypted
        row.timeout_seconds = timeout_seconds
        row.verify_tls = verify_tls
        session.commit()
        session.refresh(row)
        return _row_to_dict(row)


def save_er_settings(er_base_url: str | None, er_api_key_encrypted: str | None) -> dict:
    """
    Create or update only the ER API settings on the single row.

    er_api_key_encrypted=None leaves the stored ER key unchanged (same
    masked-placeholder rule as save_settings). An empty er_base_url clears
    it, which makes the ER roster "er_not_configured" again.
    """
    with SessionLocal() as session:
        row = session.query(ExternalApiSettings).filter(
            ExternalApiSettings.integration_name == INTEGRATION_NAME
        ).first()
        if row is None:
            row = ExternalApiSettings(integration_name=INTEGRATION_NAME)
            session.add(row)
        row.er_base_url = er_base_url or None
        if er_api_key_encrypted is not None:
            row.er_api_key_encrypted = er_api_key_encrypted
        if not row.er_base_url:
            # No ER API -> nothing to poll; never leave the switch on pointing at nothing.
            row.er_roster_enabled = False
        session.commit()
        session.refresh(row)
        return _row_to_dict(row)


def update_last_test_result(status: str, message: str) -> None:
    """Persist the outcome of the most recent Test Connection click."""
    with SessionLocal() as session:
        row = session.query(ExternalApiSettings).filter(
            ExternalApiSettings.integration_name == INTEGRATION_NAME
        ).first()
        if row is None:
            return  # nothing saved yet — nothing to record the test result against
        row.last_test_status  = status
        row.last_test_message = message
        row.last_test_at      = datetime.now(timezone.utc)
        session.commit()


def set_er_roster_enabled(enabled: bool) -> bool:
    """
    Flip only the Live ER roster switch, leaving every other setting alone.
    Returns False (and does nothing) if no settings row exists yet — the
    switch has no meaning before a base_url has been saved.
    """
    with SessionLocal() as session:
        row = session.query(ExternalApiSettings).filter(
            ExternalApiSettings.integration_name == INTEGRATION_NAME
        ).first()
        if row is None:
            return False
        row.er_roster_enabled = bool(enabled)
        session.commit()
        return True

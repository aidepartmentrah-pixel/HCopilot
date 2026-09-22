# =============================================================================
# hospital_directory/crypto_utils.py — API Key Encryption at Rest
# =============================================================================
#
# The Hospital Directory API key is stored in SQL Server
# (ExternalApiSettings.api_key_encrypted) but the decryption key itself lives
# ONLY in the SETTINGS_ENCRYPTION_KEY process environment variable — never in
# the database, never alongside the ciphertext. This means a database backup
# (or just this one row) copied to a different environment is undecryptable
# there unless SETTINGS_ENCRYPTION_KEY also matches; callers must treat that
# as an expected, recoverable failure (the "key_error"/"key_missing" returns
# below), not crash the settings page.
# =============================================================================

import os
import logging

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


def _get_fernet() -> Fernet | None:
    key = os.environ.get("SETTINGS_ENCRYPTION_KEY")
    if not key:
        return None
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except (ValueError, TypeError):
        logger.error("SETTINGS_ENCRYPTION_KEY is set but is not a valid Fernet key")
        return None


def encrypt_api_key(plain_key: str) -> str | None:
    """Encrypt a plaintext API key for storage. None if SETTINGS_ENCRYPTION_KEY is missing/invalid."""
    if not plain_key:
        return None
    fernet = _get_fernet()
    if fernet is None:
        return None
    return fernet.encrypt(plain_key.encode()).decode()


def decrypt_api_key(encrypted_key: str | None) -> tuple[str | None, str | None]:
    """
    Decrypt a stored API key.

    Returns:
        (plain_key, error) — exactly one is non-None when a key was stored.
        error is "key_missing" (SETTINGS_ENCRYPTION_KEY not set on this
        process) or "key_error" (set, but doesn't decrypt this ciphertext —
        e.g. a row copied from an environment with a different key).
        (None, None) means no key has ever been saved — not an error.
    """
    if not encrypted_key:
        return None, None
    fernet = _get_fernet()
    if fernet is None:
        return None, "key_missing"
    try:
        return fernet.decrypt(encrypted_key.encode()).decode(), None
    except InvalidToken:
        return None, "key_error"


def mask_api_key(plain_key: str | None) -> str | None:
    """e.g. 'change_me' -> '•••••me' — never expose enough to reconstruct the real key."""
    if not plain_key:
        return None
    if len(plain_key) <= 4:
        return "•" * len(plain_key)
    return "•" * (len(plain_key) - 4) + plain_key[-4:]


def is_masked_placeholder(value: str | None) -> bool:
    """True if `value` is a masked display string (all mask chars, or ending with a
    mask char), i.e. the frontend re-submitted the masked placeholder unchanged
    rather than a real new key the user typed."""
    return bool(value) and "•" in value

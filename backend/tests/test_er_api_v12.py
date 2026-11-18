# =============================================================================
# tests/test_er_api_v12.py — ER roster against 3iSoft's SEPARATE ER API (v1.2)
# =============================================================================
#
# 3iSoft delivered the ER roster (18 Nov 2026) as its own API — real:
# http://meraj:8080/his-er/api/er/v1 — with its own address and its own key,
# not as /er/current-visits on the Directory API. These tests need NO
# network: requests.get is replaced by a tiny fake "ER server" that only
# accepts the ER key, and the settings/crypto layers are stubbed. The one
# DB round-trip test restores whatever it changed.
# =============================================================================

from datetime import datetime

import pytest
import requests

from features.hospital_directory import client as hd_client
from features.hospital_directory import crypto_utils, er_sync, settings_db

DIR_URL = "http://localhost:6001/his-general/api/directory/v1"
ER_URL = "http://localhost:6001/his-er/api/er/v1"
DIR_KEY, ER_KEY = "directory-key", "er-key"

# Fake ciphertext -> plaintext, so tests don't depend on SETTINGS_ENCRYPTION_KEY.
_CIPHER = {"enc-dir": DIR_KEY, "enc-er": ER_KEY}


def _row(**over):
    row = {"base_url": DIR_URL, "api_key_encrypted": "enc-dir", "timeout_seconds": 7,
           "verify_tls": True, "er_roster_enabled": True,
           "er_base_url": ER_URL, "er_api_key_encrypted": "enc-er",
           "last_test_status": None, "last_test_message": None, "last_test_at": None}
    row.update(over)
    return row


ITEM_FULL = {"er_visit_id": "8441", "first_name": "أحمد", "father_name": "خليل", "last_name": "منصور",
             "arrival_time": "2026-11-10T07:15:00+02:00", "gender": "ذكر", "age": 48,
             "chief_complaint": "ألم في الصدر وضيق نفس"}
ITEM_NULLS = {"er_visit_id": "8442", "first_name": None, "father_name": None, "last_name": None,
              "arrival_time": None, "gender": None, "age": None, "chief_complaint": None}
ITEM_FEMALE_RAW = {"er_visit_id": 8443, "first_name": "ليلى", "father_name": None, "last_name": "حداد",
                   "arrival_time": "2026-07-10T07:15:00+03:00", "gender": "X9", "age": 30,
                   "chief_complaint": "Fever"}
ITEM_FEMALE = {**ITEM_FEMALE_RAW, "er_visit_id": "8444", "gender": "انثى"}


class _Resp:
    def __init__(self, status, body):
        self.status_code, self._body = status, body

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


@pytest.fixture
def er_server(monkeypatch):
    """
    Settings stub + a fake ER API. `state["items"]` is the roster it serves;
    `state["status"]` forces a status; `state["raise"]` forces an exception.
    Every request is recorded in `state["calls"]` as (url, headers, timeout).
    """
    state = {"row": _row(), "items": [ITEM_FULL], "status": None, "raise": None, "calls": []}
    monkeypatch.setattr(settings_db, "get_settings_row", lambda: dict(state["row"]))
    monkeypatch.setattr(crypto_utils, "decrypt_api_key",
                        lambda enc: (_CIPHER.get(enc), None) if enc else (None, None))

    def fake_get(url, params=None, headers=None, timeout=None, verify=None):
        state["calls"].append((url, dict(headers or {}), timeout))
        if state["raise"]:
            raise state["raise"]
        if state["status"]:
            return _Resp(state["status"], {"error": "INTERNAL_ERROR", "message": "boom"})
        if url != f"{ER_URL}/current-visits":
            return _Resp(404, {"error": "NOT_FOUND", "message": "Not Found"})
        if (headers or {}).get("X-API-Key") != ER_KEY:
            return _Resp(401, {"error": "UNAUTHORIZED", "message": "Invalid or missing API key"})
        return _Resp(200, {"success": True, "items": state["items"], "total": len(state["items"])})

    monkeypatch.setattr(hd_client.requests, "get", fake_get)
    return state


# ── Happy path & field normalization ────────────────────────────────────────

def test_ok_uses_er_settings_not_directory(er_server):
    r = hd_client.get_er_current_visits()
    assert r["status"] == "ok" and r["total"] == 1
    url, headers, timeout = er_server["calls"][0]
    assert url == f"{ER_URL}/current-visits"            # the ER base, not the Directory base
    assert headers["X-API-Key"] == ER_KEY               # the ER key, not the Directory key
    assert timeout == 7                                 # timeout shared with the Directory settings
    assert all(DIR_URL not in c[0] for c in er_server["calls"])


def test_arabic_gender_names_age_and_complaint(er_server):
    er_server["items"] = [ITEM_FULL, ITEM_FEMALE]
    a, b = hd_client.get_er_current_visits()["items"]
    assert (a["first_name"], a["father_name"], a["last_name"]) == ("أحمد", "خليل", "منصور")
    assert a["gender"] == "Male" and a["gender_raw"] == "ذكر"
    assert b["gender"] == "Female" and b["gender_raw"] == "انثى"
    assert a["age"] == 48 and a["chief_complaint"] == "ألم في الصدر وضيق نفس"
    assert a["er_visit_id"] == "8441"


def test_raw_gender_code_is_unknown_but_kept(er_server):
    er_server["items"] = [ITEM_FEMALE_RAW]
    (item,) = hd_client.get_er_current_visits()["items"]
    assert item["gender"] is None and item["gender_raw"] == "X9"
    assert item["er_visit_id"] == "8443"               # numeric id normalized to a string
    assert item["father_name"] is None


def test_all_null_fields_never_crash(er_server):
    er_server["items"] = [ITEM_NULLS]
    (item,) = hd_client.get_er_current_visits()["items"]
    assert item["er_visit_id"] == "8442"
    assert all(item[k] is None for k in ("first_name", "father_name", "last_name", "arrival_time",
                                         "gender", "age", "chief_complaint"))


def test_empty_list_is_ok_not_error(er_server):
    er_server["items"] = []
    assert hd_client.get_er_current_visits() == {"status": "ok", "items": [], "total": 0}


def test_arrival_time_parsed_with_offset():
    # Same instant in Beirut winter (+02) and expressed in UTC -> same local wall-clock.
    winter = hd_client.to_local_wall_clock("2026-11-10T07:15:00+02:00")
    utc = hd_client.to_local_wall_clock("2026-11-10T05:15:00Z")
    assert winter == utc
    assert winter == datetime.fromisoformat("2026-11-10T07:15:00+02:00").astimezone().replace(tzinfo=None).isoformat()
    summer = hd_client.to_local_wall_clock("2026-07-10T07:15:00+03:00")
    assert summer == datetime.fromisoformat("2026-07-10T04:15:00+00:00").astimezone().replace(tzinfo=None).isoformat()
    assert "+" not in winter and len(winter) == 19      # naive local "YYYY-MM-DDTHH:MM:SS"
    assert hd_client.to_local_wall_clock("2026-11-10T07:15:00") == "2026-11-10T07:15:00"  # no offset = already local
    assert hd_client.to_local_wall_clock("not a date") is None
    assert hd_client.to_local_wall_clock(None) is None


def test_arrival_time_in_beirut_specifically():
    zoneinfo = pytest.importorskip("zoneinfo")
    try:
        beirut = zoneinfo.ZoneInfo("Asia/Beirut")
    except Exception:
        pytest.skip("tz database not available")
    local = datetime.fromisoformat(hd_client.to_local_wall_clock("2026-11-10T07:15:00+02:00"))
    # Whatever this process's TZ is, re-attaching it gives the vendor's instant back.
    assert local.astimezone().astimezone(beirut).strftime("%H:%M") == "07:15"


@pytest.mark.parametrize("raw, expected", [("ذكر", "Male"), ("انثى", "Female"), ("أنثى", "Female"),
                                            (" ذكر ", "Male"), ("M", None), ("1", None), (None, None)])
def test_gender_mapping(raw, expected):
    assert hd_client.map_er_gender(raw) == expected


# ── Failure modes: always "couldn't poll", never "the ER is empty" ──────────

def test_directory_key_on_er_api_is_401(er_server):
    er_server["row"] = _row(er_api_key_encrypted="enc-dir")   # someone pasted the Directory key
    r = hd_client.get_er_current_visits()
    assert r["status"] == "unauthorized"
    assert "ER API key rejected" in r["message"] and "items" not in r


def test_old_directory_path_is_404(er_server):
    er_server["row"] = _row(er_base_url=DIR_URL)               # ER base left pointing at the Directory
    r = hd_client.get_er_current_visits()
    assert r["status"] == "not_found" and "items" not in r
    assert "/his-er/api/er/v1" in r["message"]
    assert er_server["calls"][0][0] == f"{DIR_URL}/current-visits"
    assert not any(c[0].endswith("/er/current-visits") for c in er_server["calls"])  # the old v1.2-proposal path is gone


@pytest.mark.parametrize("status_code, expected", [(500, "http_error"), (405, "http_error")])
def test_server_errors(er_server, status_code, expected):
    er_server["status"] = status_code
    r = hd_client.get_er_current_visits()
    assert r["status"] == expected and "items" not in r


@pytest.mark.parametrize("exc, expected", [(requests.exceptions.Timeout(), "timeout"),
                                           (requests.exceptions.ConnectionError(), "connection_error")])
def test_network_errors(er_server, exc, expected):
    er_server["raise"] = exc
    r = hd_client.get_er_current_visits()
    assert r["status"] == expected and "ER API" in r["message"]


def test_bad_shapes_rejected_whole(er_server):
    er_server["items"] = [ITEM_FULL, {"first_name": "no id"}]
    assert hd_client.get_er_current_visits()["status"] == "invalid_response"


def test_er_not_configured_is_its_own_status_without_http(er_server):
    er_server["row"] = _row(er_base_url=None, er_api_key_encrypted=None)  # Directory still configured
    r = hd_client.get_er_current_visits(force=True)
    assert r["status"] == "er_not_configured"
    assert er_server["calls"] == []


def test_switch_off_still_wins(er_server):
    er_server["row"] = _row(er_roster_enabled=False)
    assert hd_client.get_er_current_visits()["status"] == "roster_off"
    assert er_server["calls"] == []


@pytest.mark.parametrize("fail", [{"status": 401}, {"status": 500}, {"raise": requests.exceptions.Timeout()},
                                  {"row_er_url": DIR_URL}])
def test_er_sync_never_discharges_on_a_failed_poll(er_server, monkeypatch, fail):
    if "status" in fail:
        er_server["status"] = fail["status"]
    if "raise" in fail:
        er_server["raise"] = fail["raise"]
    if "row_er_url" in fail:
        er_server["row"] = _row(er_base_url=fail["row_er_url"])
    discharged = []
    monkeypatch.setattr(er_sync, "discharge_active_stay", lambda *a, **k: discharged.append(a))
    monkeypatch.setattr(er_sync, "SessionLocal", lambda: pytest.fail("must not read the DB on a failed poll"))
    r = er_sync.reconcile_er_departures()
    assert r["discharged"] == 0 and r["status"] != "ok" and discharged == []


def test_er_sync_diffs_on_normalized_ids(er_server, monkeypatch):
    er_server["items"] = [ITEM_FULL, {**ITEM_NULLS, "er_visit_id": 77002}]   # numeric id from the vendor

    class _Q:
        def filter(self, *a):
            return self

        def all(self):
            return [(101, "8441"), (102, "77002"), (103, "77001")]       # 77001 has left the list

    class _S:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def query(self, *a):
            return _Q()

    discharged = []
    monkeypatch.setattr(er_sync, "SessionLocal", _S)
    monkeypatch.setattr(er_sync, "discharge_active_stay", lambda pid, **k: discharged.append((pid, k["departure_source"])))
    r = er_sync.reconcile_er_departures()
    assert r == {"discharged": 1, "status": "ok"}
    assert discharged == [(103, "api_detected")]


# ── HTTP endpoints ──────────────────────────────────────────────────────────

def test_config_exposes_er_settings_masked(client, er_server):
    body = client.get("/api/hospital-directory/config").json()
    assert body["er_configured"] is True and body["er_base_url"] == ER_URL
    assert body["er_api_key_masked"] and ER_KEY not in body["er_api_key_masked"]
    assert body["base_url"] == DIR_URL                    # Directory settings unchanged


def test_er_save_encrypts_and_keeps_key_on_mask(client, monkeypatch):
    saved = []
    monkeypatch.setattr(settings_db, "save_er_settings", lambda **k: saved.append(k) or {})
    monkeypatch.setattr(crypto_utils, "encrypt_api_key", lambda p: f"ENC({p})")
    r = client.post("/api/hospital-directory/config/er-roster/save",
                    json={"er_base_url": f"  {ER_URL}  ", "er_api_key": "new-er-key"})
    assert r.status_code == 200 and r.json()["success"] is True
    assert saved[-1] == {"er_base_url": ER_URL, "er_api_key_encrypted": "ENC(new-er-key)"}
    client.post("/api/hospital-directory/config/er-roster/save", json={"er_base_url": ER_URL, "er_api_key": "••••••-key"})
    assert saved[-1]["er_api_key_encrypted"] is None      # masked placeholder -> keep stored key
    client.post("/api/hospital-directory/config/er-roster/save", json={"er_base_url": ""})
    assert saved[-1] == {"er_base_url": None, "er_api_key_encrypted": None}


def test_er_test_endpoint_counts_and_reports_401(client, er_server):
    er_server["items"] = [ITEM_FULL, ITEM_NULLS, ITEM_FEMALE]
    t = client.post("/api/hospital-directory/config/er-roster/test").json()
    assert t["success"] is True and "3 patient(s)" in t["message"]
    er_server["row"] = _row(er_api_key_encrypted="enc-dir")
    t = client.post("/api/hospital-directory/config/er-roster/test").json()
    assert t["success"] is False and t["status"] == "unauthorized" and "key rejected" in t["message"]


def test_enable_refused_without_er_settings(client, er_server, monkeypatch):
    er_server["row"] = _row(er_base_url=None, er_roster_enabled=False)
    flipped = []
    monkeypatch.setattr(settings_db, "set_er_roster_enabled", lambda v: flipped.append(v) or True)
    e = client.post("/api/hospital-directory/config/er-roster/enable", json={"enabled": True}).json()
    assert e["success"] is False and e["status"] == "er_not_configured" and e["er_roster_enabled"] is False
    assert flipped == []


def test_proxy_returns_normalized_items(client, er_server, monkeypatch):
    from features.hospital_directory import api as hd_api
    monkeypatch.setattr(hd_api, "_without_handled_visits", lambda items: items)
    er_server["items"] = [ITEM_FULL, ITEM_NULLS]
    body = client.get("/api/hospital-directory/er/current-visits").json()
    assert body["success"] is True and body["total"] == 2
    assert body["items"][0]["gender"] == "Male" and body["items"][1]["first_name"] is None


# ── DB round trip: ER save never touches the Directory settings ─────────────

def test_save_er_settings_roundtrip_leaves_directory_alone():
    before = settings_db.get_settings_row()
    if not before["base_url"]:
        pytest.skip("No Hospital Directory settings row in this environment")
    try:
        after = settings_db.save_er_settings("http://example.invalid/his-er/api/er/v1", "ciphertext-under-test")
        assert after["er_base_url"] == "http://example.invalid/his-er/api/er/v1"
        assert after["er_api_key_encrypted"] == "ciphertext-under-test"
        directory = ("base_url", "api_key_encrypted", "timeout_seconds", "verify_tls")
        assert {k: after[k] for k in directory} == {k: before[k] for k in directory}
        kept = settings_db.save_er_settings("http://example.invalid/2", None)       # None keeps the key
        assert kept["er_api_key_encrypted"] == "ciphertext-under-test"
        cleared = settings_db.save_er_settings(None, None)                          # no URL -> switch off
        assert cleared["er_base_url"] is None and cleared["er_roster_enabled"] is False
    finally:
        from db.session import SessionLocal
        from db.models import ExternalApiSettings
        with SessionLocal() as s:
            row = s.query(ExternalApiSettings).filter(
                ExternalApiSettings.integration_name == settings_db.INTEGRATION_NAME).first()
            row.er_base_url = before["er_base_url"]
            row.er_api_key_encrypted = before["er_api_key_encrypted"]
            row.er_roster_enabled = before["er_roster_enabled"]
            s.commit()

# =============================================================================
# tests/test_er_roster_switch.py — "Live ER roster" admin switch (slices V1-V4)
# =============================================================================
#
# See docs/development/Directory API v1.1 Compatibility/0. Slicing Task
# Table.md. The switch keeps HCopilot from calling the v1.2-only
# /er/current-visits endpoint against a v1.1 directory API. Most tests here
# patch the settings layer/HTTP so they never write to the dev DB; the one
# DB round-trip test restores whatever it changed.
# =============================================================================

import pytest

from features.hospital_directory import client as hd_client
from features.hospital_directory import settings_db
from features.hospital_directory.er_sync import reconcile_er_departures

_CFG = {"base_url": "http://x/api", "api_key_encrypted": None, "timeout_seconds": 5,
        "verify_tls": True, "er_roster_enabled": False,
        "last_test_status": None, "last_test_message": None, "last_test_at": None}


def _settings(monkeypatch, enabled):
    monkeypatch.setattr(settings_db, "get_settings_row", lambda: {**_CFG, "er_roster_enabled": enabled})


def _forbid_http(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("HTTP call made while the roster switch is off")
    monkeypatch.setattr(hd_client, "_get", boom)
    monkeypatch.setattr(hd_client.requests, "get", boom)


def test_switch_off_returns_roster_off_without_http(monkeypatch):
    _settings(monkeypatch, False)
    _forbid_http(monkeypatch)
    assert hd_client.get_er_current_visits()["status"] == "roster_off"


def test_switch_on_makes_the_call(monkeypatch):
    _settings(monkeypatch, True)
    monkeypatch.setattr(hd_client, "_load_config", lambda: {"status": "ok"})
    monkeypatch.setattr(hd_client, "_get", lambda cfg, path, **k: {"status": "ok", "data": {"items": [{"er_visit_id": "1"}]}})
    r = hd_client.get_er_current_visits()
    assert r["status"] == "ok" and r["total"] == 1


def test_force_bypasses_the_switch(monkeypatch):
    _settings(monkeypatch, False)
    monkeypatch.setattr(hd_client, "_load_config", lambda: {"status": "ok"})
    monkeypatch.setattr(hd_client, "_get", lambda cfg, path, **k: {"status": "ok", "data": {"items": []}})
    assert hd_client.get_er_current_visits(force=True)["status"] == "ok"


def test_er_sync_is_a_silent_noop_when_off(client, monkeypatch, caplog):
    resp = client.get("/api/patients/next-ids").json()
    sid, stay = resp["next_patient_id"], resp["next_stay_id"]
    r = client.post("/api/patients/add", json={
        "patient_id": sid, "stay_id": stay, "name": "PYTEST_SWITCH", "gender": "F", "age": 30,
        "acuity": 3, "chiefcomplaint": "PYTEST", "arrival_time": "2026-01-01T00:00",
        "er_visit_id": "PYTEST-SWITCH-1", "record_source": "external"})
    assert r.status_code == 200, r.text
    _settings(monkeypatch, False)
    _forbid_http(monkeypatch)
    try:
        with caplog.at_level("WARNING"):
            result = reconcile_er_departures()
        assert result == {"discharged": 0, "status": "roster_off"}
        assert not [x for x in caplog.records if x.name.endswith("er_sync")]
        assert client.get(f"/api/patients/{stay}/details").json()["source"] == "daily"
    finally:
        client.delete(f"/api/patients/delete/{stay}")


def test_proxy_endpoint_reports_roster_off(client, monkeypatch):
    _settings(monkeypatch, False)
    _forbid_http(monkeypatch)
    body = client.get("/api/hospital-directory/er/current-visits").json()
    assert body["success"] is False and body["status"] == "roster_off" and body["items"] == []


@pytest.mark.parametrize("stub,ok", [
    ({"status": "not_found", "message": "Not Found"}, False),
    ({"status": "timeout", "message": "slow"}, False),
    ({"status": "ok", "items": [{"first_name": "a"}], "total": 1}, False),        # no er_visit_id
    ({"status": "ok", "items": [{"er_visit_id": "9"}], "total": 1}, True),
    ({"status": "ok", "items": [], "total": 0}, True),
])
def test_test_endpoint_and_enable_gate(client, monkeypatch, stub, ok):
    monkeypatch.setattr(hd_client, "get_er_current_visits", lambda force=False: stub)
    saved = []
    monkeypatch.setattr(settings_db, "set_er_roster_enabled", lambda v: saved.append(v) or True)

    t = client.post("/api/hospital-directory/config/er-roster/test").json()
    assert t["success"] is ok

    e = client.post("/api/hospital-directory/config/er-roster/enable", json={"enabled": True}).json()
    assert e["success"] is ok
    assert saved == ([True] if ok else [])          # a failed test never flips the switch
    if not ok:
        assert e["er_roster_enabled"] is False


def test_disable_always_allowed_even_if_endpoint_is_down(client, monkeypatch):
    monkeypatch.setattr(hd_client, "get_er_current_visits", lambda force=False: {"status": "connection_error", "message": "down"})
    saved = []
    monkeypatch.setattr(settings_db, "set_er_roster_enabled", lambda v: saved.append(v) or True)
    e = client.post("/api/hospital-directory/config/er-roster/enable", json={"enabled": False}).json()
    assert e["success"] is True and saved == [False]


def test_switch_roundtrip_in_db_leaves_other_settings_alone():
    before = settings_db.get_settings_row()
    if not before["base_url"]:
        pytest.skip("No Hospital Directory settings row in this environment")
    try:
        assert settings_db.set_er_roster_enabled(True) is True
        after = settings_db.get_settings_row()
        assert after["er_roster_enabled"] is True
        assert {k: v for k, v in after.items() if k != "er_roster_enabled"} == \
               {k: v for k, v in before.items() if k != "er_roster_enabled"}
    finally:
        settings_db.set_er_roster_enabled(before["er_roster_enabled"])

# =============================================================================
# tests/test_er_redesign.py — ER Live-Roster Redesign smoke tests
# =============================================================================
#
# Same conventions as test_endpoints.py: the real FastAPI app via the
# session-scoped `client` fixture, real writes against the real dev DB,
# cleaned up in a `finally` block. See docs/development/ER Live Roster
# Redesign/0. Slicing Task Table.md for the full slice-by-slice design
# these tests correspond to (ER2-ER7, ER11).
# =============================================================================

import pytest

from features.hospital_directory import client as hd_client
from features.hospital_directory.er_sync import reconcile_er_departures


def _add_patient(client, subject_id, stay_id, **overrides):
    payload = {
        "patient_id": subject_id, "stay_id": stay_id,
        "name": "PYTEST_ER", "gender": "F", "age": 30,
        "acuity": 3, "chiefcomplaint": "PYTEST",
        "arrival_time": "2026-01-01T00:00",
    }
    payload.update(overrides)
    return client.post("/api/patients/add", json=payload)


def test_er_schema_columns_roundtrip(client):
    # ER2 — er_visit_id/triage_time round-trip through add + details.
    resp = client.get("/api/patients/next-ids")
    ids = resp.json()
    subject_id, stay_id = ids["next_patient_id"], ids["next_stay_id"]

    resp = _add_patient(client, subject_id, stay_id,
                         er_visit_id="PYTEST-VISIT-1", triage_time="2026-01-01T00:30",
                         record_source="external")
    assert resp.status_code == 200, resp.text
    try:
        resp = client.get(f"/api/patients/{stay_id}/details")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["er_visit_id"] == "PYTEST-VISIT-1"
        assert body["triage_time"] == "2026-01-01T00:30"
        assert body["departure_source"] is None  # never set pre-discharge
    finally:
        client.delete(f"/api/patients/delete/{stay_id}")


def test_get_er_current_visits_against_mock(client):
    # ER3 — real call against whatever Hospital Directory API is currently
    # configured (dev: the v1.2 mock). Skips rather than fails if the
    # external API isn't reachable/configured in this environment — this
    # test proves the client function's shape, not environment uptime.
    result = hd_client.get_er_current_visits()
    if result["status"] != "ok":
        pytest.skip(f"Hospital Directory API not usable in this environment: {result}")
    assert "items" in result and "total" in result
    if result["items"]:
        item = result["items"][0]
        assert "er_visit_id" in item
        assert "first_name" in item


def test_bedless_endpoint_excludes_bedded_includes_unurgent(client):
    # ER5 — one bedded, one bedless-unurgent, one bedless-plain patient;
    # /api/beds/bedless must return exactly the two bedless ones.
    resp = client.get("/api/patients/next-ids")
    ids = resp.json()
    bedded_id, bedded_stay = ids["next_patient_id"], ids["next_stay_id"]
    unurgent_id, unurgent_stay = bedded_id + 1, bedded_stay + 1
    plain_id, plain_stay = bedded_id + 2, bedded_stay + 2

    resp = client.post("/api/beds/add", json={"bed_number": "PYTEST-BEDLESS-BED", "bed_type": "normal"})
    assert resp.status_code == 200, resp.text
    bed_id = resp.json()["bed"]["bed_id"]

    try:
        for pid, sid in ((bedded_id, bedded_stay), (unurgent_id, unurgent_stay), (plain_id, plain_stay)):
            resp = _add_patient(client, pid, sid)
            assert resp.status_code == 200, resp.text

        resp = client.post(f"/api/beds/assign/{bed_id}", json={"patient_id": bedded_id})
        assert resp.status_code == 200, resp.text

        from features.data_management.daily_patients_manager import DailyPatientsManager
        DailyPatientsManager().mark_unurgent(unurgent_stay)

        resp = client.get("/api/beds/bedless")
        assert resp.status_code == 200, resp.text
        bedless_ids = {p["subject_id"] for p in resp.json()["patients"]}
        assert bedded_id not in bedless_ids
        assert unurgent_id in bedless_ids
        assert plain_id in bedless_ids
        unurgent_entry = next(p for p in resp.json()["patients"] if p["subject_id"] == unurgent_id)
        assert unurgent_entry["unurgent"] is True
        plain_entry = next(p for p in resp.json()["patients"] if p["subject_id"] == plain_id)
        assert plain_entry["unurgent"] is False
    finally:
        client.post(f"/api/beds/release/{bed_id}")
        client.delete(f"/api/beds/delete/{bed_id}")
        for sid in (bedded_stay, unurgent_stay, plain_stay):
            client.delete(f"/api/patients/delete/{sid}")


def test_roster_create_relaxed_required_fields(client):
    # ER6 — a roster-origin stay (record_source="external" + er_visit_id)
    # needs only name + arrival_time. The same payload WITHOUT er_visit_id
    # must still 422 (ER11's regression check — the directory-search
    # shortcut, which is "external" but never carries an er_visit_id,
    # keeps today's full requirement).
    resp = client.get("/api/patients/next-ids")
    ids = resp.json()
    subject_id, stay_id = ids["next_patient_id"], ids["next_stay_id"]

    resp = client.post("/api/patients/add", json={
        "patient_id": subject_id, "stay_id": stay_id,
        "name": "PYTEST_ROSTER_PICK", "arrival_time": "2026-01-01T00:00",
        "record_source": "external", "er_visit_id": "PYTEST-VISIT-2",
    })
    assert resp.status_code == 200, resp.text
    try:
        resp = client.get(f"/api/patients/{stay_id}/details")
        assert resp.json()["gender"] is None
        assert resp.json()["acuity"] is None
    finally:
        client.delete(f"/api/patients/delete/{stay_id}")

    # Same shape, but external WITHOUT an er_visit_id — must still enforce
    # the full requirement (this is the directory-search shortcut's shape).
    resp = client.post("/api/patients/add", json={
        "patient_id": subject_id, "stay_id": stay_id,
        "name": "PYTEST_DIRECTORY_PICK", "arrival_time": "2026-01-01T00:00",
        "record_source": "external",
    })
    assert resp.status_code == 422, resp.text


def test_patient_add_rejects_missing_required_fields_local(client):
    # ER11 regression — a purely local (manually-typed) stay still requires
    # the full Patient & Arrival set, unaffected by ER6's roster-origin path.
    resp = client.get("/api/patients/next-ids")
    ids = resp.json()
    subject_id, stay_id = ids["next_patient_id"], ids["next_stay_id"]
    resp = client.post("/api/patients/add", json={
        "patient_id": subject_id, "stay_id": stay_id,
        "name": "PYTEST_LOCAL_INCOMPLETE", "arrival_time": "2026-01-01T00:00",
    })
    assert resp.status_code == 422, resp.text


def test_er_poll_diff_auto_discharges_missing_patient(client, monkeypatch):
    # ER7 — a DailyPatients row carrying an er_visit_id that's absent from
    # the (mocked) current roster gets auto-discharged, tagged
    # departure_source="api_detected". A row NOT tracked by er_visit_id is
    # left completely alone.
    resp = client.get("/api/patients/next-ids")
    ids = resp.json()
    tracked_id, tracked_stay = ids["next_patient_id"], ids["next_stay_id"]
    untracked_id, untracked_stay = tracked_id + 1, tracked_stay + 1

    resp = _add_patient(client, tracked_id, tracked_stay,
                         er_visit_id="PYTEST-GONE", record_source="external")
    assert resp.status_code == 200, resp.text
    resp = _add_patient(client, untracked_id, untracked_stay)
    assert resp.status_code == 200, resp.text

    monkeypatch.setattr(
        "features.hospital_directory.er_sync.client.get_er_current_visits",
        lambda: {"status": "ok", "items": [], "total": 0},
    )

    try:
        result = reconcile_er_departures()
        # >= 1, not == 1: this app runs a REAL APScheduler background thread
        # in the same process (see backend/scheduler.py) on its own 2-minute
        # interval, including this same reconcile job — if that real cycle
        # fires while this test's monkeypatch is active, it observes the
        # same patched (empty-roster) response and may legitimately
        # discharge something else concurrently. Assert what this test can
        # actually guarantee: our tracked patient was one of the ones
        # discharged, and specifically why (checked below) — not an exact
        # count that a real, unrelated concurrent cycle could also affect.
        assert result["discharged"] >= 1

        resp = client.get(f"/api/patients/{tracked_stay}/details")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["source"] == "log"
        assert body["departure_source"] == "api_detected"

        resp = client.get(f"/api/patients/{untracked_stay}/details")
        assert resp.status_code == 200, resp.text
        assert resp.json()["source"] == "daily"
    finally:
        client.delete(f"/api/data/log-patients/delete/{tracked_stay}")
        client.delete(f"/api/patients/delete/{untracked_stay}")

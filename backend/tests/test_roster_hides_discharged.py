"""A visit HCopilot already admitted and discharged must not come back on the Live ER roster."""
from db.models import LogPatient
from db.session import SessionLocal
from features.hospital_directory import client as hd_client

HANDLED = "PYTEST-HANDLED-VISIT"
FRESH = "PYTEST-FRESH-VISIT"


def _fake_roster(*_a, **_k):
    return {
        "status": "ok",
        "total": 2,
        "items": [
            {"er_visit_id": HANDLED, "first_name": "Done", "last_name": "Already"},
            {"er_visit_id": FRESH, "first_name": "New", "last_name": "Arrival"},
        ],
    }


def test_discharged_visit_is_hidden_but_new_visits_remain(client, monkeypatch):
    monkeypatch.setattr(hd_client, "get_er_current_visits", _fake_roster)
    with SessionLocal() as s:
        s.add(LogPatient(subject_id=99999993, stay_id=99999993, name="PYTEST_ROSTER", er_visit_id=HANDLED))
        s.commit()
    try:
        body = client.get("/api/hospital-directory/er/current-visits").json()
        ids = [i["er_visit_id"] for i in body["items"]]
        assert ids == [FRESH]
        assert body["total"] == 1
    finally:
        with SessionLocal() as s:
            s.query(LogPatient).filter(LogPatient.subject_id == 99999993).delete()
            s.commit()


def test_roster_untouched_when_nothing_was_discharged(client, monkeypatch):
    monkeypatch.setattr(hd_client, "get_er_current_visits", _fake_roster)
    body = client.get("/api/hospital-directory/er/current-visits").json()
    assert {i["er_visit_id"] for i in body["items"]} == {HANDLED, FRESH}

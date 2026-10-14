"""A visit a nurse just discharged by hand must not come straight back on the Live ER roster."""
from datetime import datetime, timedelta

from db.models import LogPatient
from db.session import SessionLocal
from features.hospital_directory import client as hd_client

JUST_DISCHARGED = "PYTEST-JUST-DISCHARGED"
OLD_DISCHARGE = "PYTEST-OLD-DISCHARGE"
HOSPITAL_CLOSED = "PYTEST-HOSPITAL-CLOSED"
FRESH = "PYTEST-FRESH-VISIT"
ALL = [JUST_DISCHARGED, OLD_DISCHARGE, HOSPITAL_CLOSED, FRESH]


def _fake_roster(*_a, **_k):
    return {"status": "ok", "total": len(ALL), "items": [{"er_visit_id": v, "first_name": v} for v in ALL]}


def _stamp(delta):
    return (datetime.now() + delta).strftime("%Y-%m-%dT%H:%M")


def _add_log(subject_id, visit_id, departed, source):
    return LogPatient(subject_id=subject_id, stay_id=subject_id, name="PYTEST_ROSTER", er_visit_id=visit_id,
                      departure_time=departed, departure_source=source)


def test_only_recent_manual_discharges_are_hidden(client, monkeypatch):
    monkeypatch.setattr(hd_client, "get_er_current_visits", _fake_roster)
    with SessionLocal() as s:
        s.add_all([
            _add_log(99999991, JUST_DISCHARGED, _stamp(timedelta(minutes=-5)), "manual"),
            _add_log(99999992, OLD_DISCHARGE, _stamp(timedelta(days=-3)), "manual"),
            _add_log(99999993, HOSPITAL_CLOSED, _stamp(timedelta(minutes=-5)), "api_detected"),
        ])
        s.commit()
    try:
        body = client.get("/api/hospital-directory/er/current-visits").json()
        ids = {i["er_visit_id"] for i in body["items"]}
        assert JUST_DISCHARGED not in ids  # discharged by a nurse a moment ago, hospital still lists it
        assert OLD_DISCHARGE in ids        # days old: a reused id would be a genuinely new visit
        assert HOSPITAL_CLOSED in ids      # hospital itself closed it: reappearing = new visit
        assert FRESH in ids
        assert body["total"] == len(body["items"]) == 3
    finally:
        with SessionLocal() as s:
            s.query(LogPatient).filter(LogPatient.subject_id.in_([99999991, 99999992, 99999993])).delete(synchronize_session=False)
            s.commit()


def test_roster_untouched_when_nothing_was_discharged(client, monkeypatch):
    monkeypatch.setattr(hd_client, "get_er_current_visits", _fake_roster)
    body = client.get("/api/hospital-directory/er/current-visits").json()
    assert {i["er_visit_id"] for i in body["items"]} == set(ALL)

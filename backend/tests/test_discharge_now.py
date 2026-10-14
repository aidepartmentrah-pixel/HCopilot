"""'Discharge now' must succeed even when the stored arrival/bed time is in the future."""
from datetime import datetime, timedelta

from db.models import DailyPatient
from db.session import SessionLocal  # noqa: F401  (same import path as the managers)


def _fmt(dt):
    return dt.strftime("%Y-%m-%dT%H:%M")


def _insert(subject_id, stay_id, arrival, bed=None):
    with SessionLocal() as s:
        s.add(DailyPatient(subject_id=subject_id, stay_id=stay_id, name="PYTEST_DISCHARGE",
                           arrival_time=arrival, bed_occupation_time=bed))
        s.commit()


def test_discharge_now_heals_future_arrival(client):
    ids = client.get("/api/patients/next-ids").json()
    sid, stay = ids["next_patient_id"], ids["next_stay_id"]
    future = _fmt(datetime.now() + timedelta(days=1))
    _insert(sid, stay, future, bed=future)
    try:
        resp = client.post(f"/api/unurgent/discharge/{sid}", json={"destination": "Home"})
        assert resp.status_code == 200, resp.text
    finally:
        client.delete(f"/api/patients/delete/{stay}")
        client.delete(f"/api/data/log-patients/delete/{stay}")


def test_explicit_departure_before_arrival_is_still_rejected(client):
    ids = client.get("/api/patients/next-ids").json()
    sid, stay = ids["next_patient_id"], ids["next_stay_id"]
    arrival = _fmt(datetime.now() - timedelta(hours=1))
    _insert(sid, stay, arrival)
    try:
        resp = client.post(f"/api/unurgent/discharge/{sid}",
                           json={"departure_time": _fmt(datetime.now() - timedelta(hours=3)), "destination": "Home"})
        assert resp.status_code == 400
        assert "must be at or after arrival" in resp.json()["detail"]
    finally:
        client.delete(f"/api/patients/delete/{stay}")

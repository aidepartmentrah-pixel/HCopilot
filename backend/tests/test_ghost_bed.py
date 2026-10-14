"""A bed linked to a patient with no active stay must be self-healing and dischargeable."""
from db.models import PatientBed
from db.session import SessionLocal


def _free_bed_id(client):
    beds = client.get("/api/beds/list").json()["beds"]
    free = [b for b in beds if b["bed_status"] == "Available" and b["bed_type"] != "chariot"]
    return free[0]["bed_id"] if free else None


def test_orphan_link_is_purged_on_list(client):
    bed_id = _free_bed_id(client)
    if bed_id is None:
        import pytest
        pytest.skip("no free bed in this dataset")
    ghost = 99999991
    with SessionLocal() as s:
        s.add(PatientBed(patient_id=ghost, bed_id=bed_id))
        s.commit()
    try:
        beds = {b["bed_id"]: b for b in client.get("/api/beds/list").json()["beds"]}
        assert beds[bed_id]["bed_status"] == "Available"
    finally:
        with SessionLocal() as s:
            s.query(PatientBed).filter(PatientBed.patient_id == ghost).delete()
            s.commit()


def test_discharging_a_ghost_bed_just_releases_it(client):
    bed_id = _free_bed_id(client)
    if bed_id is None:
        import pytest
        pytest.skip("no free bed in this dataset")
    ghost = 99999992
    with SessionLocal() as s:
        s.add(PatientBed(patient_id=ghost, bed_id=bed_id))
        s.commit()
    try:
        resp = client.post(f"/api/beds/discharge/{bed_id}", json={"destination": "Home"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["stay_id"] is None
    finally:
        with SessionLocal() as s:
            s.query(PatientBed).filter(PatientBed.patient_id == ghost).delete()
            s.commit()

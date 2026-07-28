# =============================================================================
# tests/test_endpoints.py — End-to-end endpoint regression suite
# =============================================================================
#
# Purpose: exercise every features/*/api.py router end-to-end through the real
# FastAPI app, so behavior can be diffed before/after each CSV -> SQL Server
# manager rewrite in Stage 1. Two kinds of coverage:
#
#   1. Safe GET smoke tests (parametrized) — every read-only endpoint should
#      keep returning 200 with the same basic response shape.
#   2. Mutation round-trips — one create/modify/delete cycle per entity type,
#      using clearly-marked ephemeral test data that is cleaned up in a
#      `finally` block so re-running the suite never accumulates junk rows.
#
# Destructive endpoints (features/reset/api.py) are intentionally NOT covered
# here — they wipe entire tables and must never run against real data as part
# of routine regression testing.
# =============================================================================


SAFE_GET_ENDPOINTS = [
    "/health",
    "/api/patient-flow/datasets",
    "/api/beds/list",
    "/api/beds/stats",
    "/api/models/list",
    "/api/staff/doctors/list",
    "/api/staff/doctors/stats",
    "/api/staff/nurses/list",
    "/api/staff/nurses/stats",
    "/api/staff/shifts/list",
    "/api/staff/groups/list",
    "/api/data/wards/list",
    "/api/data/wards/stats",
    "/api/data/daily-patients/list",
    "/api/data/daily-patients/stats",
    "/api/data/log-patients/list",
    "/api/data/log-patients/stats",
    "/api/patients/next-ids",
    "/api/patients/list",
    "/api/patients/stats",
    "/api/relations/tables",
    "/api/relations/patient_bed",
    "/api/relations/patient_doctor",
    "/api/relations/patient_nurse",
    "/api/relations/ward_bed",
    "/api/relations/ward_doctor",
    "/api/relations/ward_nurse",
    "/api/scheduling/list",
    "/api/simulation/current-context",
    "/api/statistics/overview",
    "/api/statistics/data-quality",
    "/api/statistics/waiting-times",
    "/api/statistics/acuity-breakdown",
    "/api/statistics/throughput",
    "/api/statistics/top-complaints",
    "/api/statistics/vitals-summary",
    "/api/statistics/staff-stats",
    "/api/unurgent/list",
    "/api/auth/users",
    "/api/ward-census/today",
    "/api/ward-census/history",
    "/api/daily-analysis/report",
]


import pytest
from datetime import date
from features.data_management.daily_patients_manager import DailyPatientsManager


@pytest.mark.parametrize("path", SAFE_GET_ENDPOINTS)
def test_safe_get_endpoints_return_200(client, path):
    resp = client.get(path)
    assert resp.status_code == 200, f"{path} -> {resp.status_code}: {resp.text}"
    body = resp.json()
    assert isinstance(body, dict)


def test_flow_prediction_endpoints_respond(client):
    # Stage 2: HistoricalEdStays/DailyWeather are populated and Flow_prediction.pkl
    # is trained, so these should always return real 200 responses now.
    for path in ("/api/flow-prediction/predict?days=5",
                 "/api/flow-prediction/historical?days=10",
                 "/api/flow-prediction/stats"):
        resp = client.get(path)
        assert resp.status_code == 200, f"{path} -> {resp.status_code}: {resp.text}"

    resp = client.get("/api/flow-prediction/predict?days=7")
    predictions = resp.json()["predictions"]
    assert len(predictions) == 7
    assert all(p["predicted_patients"] > 0 for p in predictions)


def test_dataset_display_daily_patients_page(client):
    resp = client.get("/api/patient-flow/data/DailyPatients", params={"page": 1, "page_size": 5})
    assert resp.status_code == 200


def test_staff_member_detail_endpoints(client, existing_doctor_id, existing_nurse_id):
    resp = client.get(f"/api/statistics/staff-member/doctor/{existing_doctor_id}")
    assert resp.status_code == 200
    resp = client.get(f"/api/statistics/staff-member/nurse/{existing_nurse_id}")
    assert resp.status_code == 200


def test_simulation_sample_patient_and_staff_audit(client):
    resp = client.get("/api/simulation/staff-audit")
    assert resp.status_code == 200
    # sample-patient depends on the historical Patients.csv sampler dataset,
    # which — like the flow-prediction data — may not be present in every
    # environment.
    resp = client.get("/api/simulation/sample-patient")
    assert resp.status_code in (200, 404)


# ── Mutation round-trips ────────────────────────────────────────────────────

def test_shift_crud_roundtrip(client):
    resp = client.post("/api/staff/shifts/add", json={"name": "PYTEST_SHIFT", "start_hour": 1, "end_hour": 2})
    assert resp.status_code == 200, resp.text
    shift_id = resp.json()["shift_id"]
    try:
        resp = client.put(f"/api/staff/shifts/modify/{shift_id}",
                           json={"name": "PYTEST_SHIFT_RENAMED", "start_hour": 3, "end_hour": 4})
        assert resp.status_code == 200, resp.text
    finally:
        resp = client.delete(f"/api/staff/shifts/delete/{shift_id}")
        assert resp.status_code == 200, resp.text


def test_shift_rename_cascades_to_doctor(client):
    # Regression test for the ON UPDATE CASCADE FK added in Stage 1: renaming a
    # shift must still propagate to every doctor/nurse referencing it by name,
    # exactly as the old CSV-era manual cascade-rename code did.
    resp = client.post("/api/staff/shifts/add", json={"name": "PYTEST_SHIFT_A", "start_hour": 1, "end_hour": 2})
    assert resp.status_code == 200, resp.text
    shift_id = resp.json()["shift_id"]
    doctor_id = None
    try:
        resp = client.post("/api/staff/doctors/add", json={
            "intern_or_not": "doctor", "shift": "PYTEST_SHIFT_A", "work_days": "Group 1",
            "name": "PYTEST_CASCADE_DOCTOR",
        })
        assert resp.status_code == 200, resp.text
        doctor_id = resp.json()["doctor"]["id"]

        resp = client.put(f"/api/staff/shifts/modify/{shift_id}",
                           json={"name": "PYTEST_SHIFT_B", "start_hour": 1, "end_hour": 2})
        assert resp.status_code == 200, resp.text

        resp = client.get("/api/staff/doctors/list")
        doctor = next(d for d in resp.json()["doctors"] if d["id"] == doctor_id)
        assert doctor["shift"] == "PYTEST_SHIFT_B"
    finally:
        if doctor_id is not None:
            client.delete(f"/api/staff/doctors/delete/{doctor_id}")
        client.delete(f"/api/staff/shifts/delete/{shift_id}")


def test_group_rename_cascades_to_nurse(client):
    resp = client.post("/api/staff/groups/add", json={"name": "PYTEST_GROUP_A", "days": "0,1"})
    assert resp.status_code == 200, resp.text
    group_id = resp.json()["group_id"]
    nurse_id = None
    try:
        resp = client.post("/api/staff/nurses/add", json={
            "role": "RN", "shift": "morning", "group": "PYTEST_GROUP_A", "name": "PYTEST_CASCADE_NURSE",
        })
        assert resp.status_code == 200, resp.text
        nurse_id = resp.json()["nurse"]["id"]

        resp = client.put(f"/api/staff/groups/modify/{group_id}",
                           json={"name": "PYTEST_GROUP_B", "days": "0,1"})
        assert resp.status_code == 200, resp.text

        resp = client.get("/api/staff/nurses/list")
        nurse = next(n for n in resp.json()["nurses"] if n["id"] == nurse_id)
        assert nurse["group"] == "PYTEST_GROUP_B"
    finally:
        if nurse_id is not None:
            client.delete(f"/api/staff/nurses/delete/{nurse_id}")
        client.delete(f"/api/staff/groups/delete/{group_id}")


def test_user_crud_roundtrip(client):
    resp = client.post("/api/auth/users", json={
        "username": "pytest_user", "password": "pytest_pw", "name": "PYTEST_USER",
        "role": "user", "sections": "home",
    })
    assert resp.status_code == 200, resp.text
    user_id = resp.json()["user_id"]
    try:
        resp = client.post("/api/auth/login", json={"username": "pytest_user", "password": "pytest_pw"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["user"]["user_id"] == user_id

        resp = client.put(f"/api/auth/users/{user_id}", json={
            "username": "pytest_user_renamed", "password": "new_pw",
            "name": "PYTEST_USER_RENAMED", "role": "user", "sections": "home,patients",
        })
        assert resp.status_code == 200, resp.text

        resp = client.post("/api/auth/login", json={"username": "pytest_user_renamed", "password": "new_pw"})
        assert resp.status_code == 200, resp.text
    finally:
        resp = client.delete(f"/api/auth/users/{user_id}")
        assert resp.status_code == 200, resp.text


def test_group_crud_roundtrip(client):
    resp = client.post("/api/staff/groups/add", json={"name": "PYTEST_GROUP", "days": "0,1"})
    assert resp.status_code == 200, resp.text
    group_id = resp.json()["group_id"]
    try:
        resp = client.put(f"/api/staff/groups/modify/{group_id}",
                           json={"name": "PYTEST_GROUP_RENAMED", "days": "2,3"})
        assert resp.status_code == 200, resp.text
    finally:
        resp = client.delete(f"/api/staff/groups/delete/{group_id}")
        assert resp.status_code == 200, resp.text


def test_ward_crud_roundtrip(client):
    resp = client.post("/api/data/wards/add", json={"ward_name": "PYTEST_WARD", "department_id": 1})
    assert resp.status_code == 200, resp.text
    ward_id = resp.json()["ward"]["ward_id"]
    try:
        resp = client.put(f"/api/data/wards/modify/{ward_id}",
                           json={"ward_name": "PYTEST_WARD_RENAMED", "department_id": 1})
        assert resp.status_code == 200, resp.text
    finally:
        resp = client.delete(f"/api/data/wards/delete/{ward_id}")
        assert resp.status_code == 200, resp.text


def test_doctor_crud_roundtrip(client):
    resp = client.post("/api/staff/doctors/add",
                        json={"intern_or_not": "doctor", "shift": "morning", "work_days": "Group 1",
                              "name": "PYTEST_DOCTOR"})
    assert resp.status_code == 200, resp.text
    doctor_id = resp.json()["doctor"]["id"]
    try:
        resp = client.put(f"/api/staff/doctors/toggle-absent/{doctor_id}")
        assert resp.status_code == 200, resp.text
        resp = client.put(f"/api/staff/doctors/modify/{doctor_id}",
                           json={"intern_or_not": "intern", "shift": "night", "work_days": "Group 2",
                                 "name": "PYTEST_DOCTOR_RENAMED"})
        assert resp.status_code == 200, resp.text
    finally:
        resp = client.delete(f"/api/staff/doctors/delete/{doctor_id}")
        assert resp.status_code == 200, resp.text


def test_nurse_crud_roundtrip(client):
    resp = client.post("/api/staff/nurses/add",
                        json={"role": "RN", "shift": "morning", "group": "Group 1", "name": "PYTEST_NURSE"})
    assert resp.status_code == 200, resp.text
    nurse_id = resp.json()["nurse"]["id"]
    try:
        resp = client.put(f"/api/staff/nurses/toggle-absent/{nurse_id}")
        assert resp.status_code == 200, resp.text
    finally:
        resp = client.delete(f"/api/staff/nurses/delete/{nurse_id}")
        assert resp.status_code == 200, resp.text


def test_bed_crud_roundtrip(client):
    resp = client.post("/api/beds/add", json={"bed_number": "PYTEST-BED-1", "bed_type": "normal"})
    assert resp.status_code == 200, resp.text
    bed_id = resp.json()["bed"]["bed_id"]
    try:
        resp = client.put(f"/api/beds/modify/{bed_id}",
                           json={"bed_number": "PYTEST-BED-1-RENAMED", "bed_type": "monitor"})
        assert resp.status_code == 200, resp.text
        resp = client.put(f"/api/beds/condition/{bed_id}", json={"condition": "Under Repair"})
        assert resp.status_code == 200, resp.text
    finally:
        resp = client.delete(f"/api/beds/delete/{bed_id}")
        assert resp.status_code == 200, resp.text


def test_ward_doctor_relation_roundtrip(client, existing_doctor_id):
    # ward_doctor.csv is empty in the current dataset, so this table is safe
    # to exercise without touching any real assignment.
    resp = client.get("/api/data/wards/list")
    wards = resp.json()["wards"]
    if not wards:
        pytest.skip("No wards in the current dataset")
    ward_id = wards[0]["ward_id"]

    resp = client.post("/api/relations/ward_doctor", json={"col_a": ward_id, "col_b": existing_doctor_id})
    assert resp.status_code == 200, resp.text
    try:
        resp = client.get("/api/relations/ward_doctor")
        rows = resp.json()["rows"]
        assert any(r["ward_id"] == ward_id and r["doctor_id"] == existing_doctor_id for r in rows)
    finally:
        resp = client.delete(f"/api/relations/ward_doctor/{ward_id}/{existing_doctor_id}")
        assert resp.status_code == 200, resp.text


def test_patient_and_scheduling_roundtrip(client):
    # Full lifecycle on ephemeral data: create a bed, create a patient stay,
    # assign, discharge, then clean up the bed.
    resp = client.get("/api/patients/next-ids")
    ids = resp.json()
    subject_id, stay_id = ids["next_patient_id"], ids["next_stay_id"]

    resp = client.post("/api/beds/add", json={"bed_number": "PYTEST-BED-SCHED", "bed_type": "normal"})
    assert resp.status_code == 200, resp.text
    bed_id = resp.json()["bed"]["bed_id"]

    try:
        resp = client.post("/api/patients/add", json={
            "patient_id": subject_id, "stay_id": stay_id,
            "name": "PYTEST_PATIENT", "gender": "M", "age": 30,
            "acuity": 3, "chiefcomplaint": "PYTEST",
            "arrival_time": "2026-01-01T00:00",
            "temperature": 37.0, "heartrate": 80.0, "resprate": 16.0,
            "o2sat": 98.0, "sbp": 120.0, "dbp": 80.0, "pain": "3",
        })
        assert resp.status_code == 200, resp.text

        resp = client.post(f"/api/scheduling/assign", json={
            "patient_id": subject_id, "bed_id": bed_id,
        })
        assert resp.status_code == 200, resp.text

        resp = client.post(f"/api/scheduling/discharge/{subject_id}/{bed_id}",
                            json={"departure_time": "2026-01-01T05:00"})
        assert resp.status_code == 200, resp.text

        resp = client.delete(f"/api/data/log-patients/delete/{stay_id}")
        assert resp.status_code == 200, resp.text
    finally:
        resp = client.get("/api/beds/list")
        beds = {b["bed_id"]: b for b in resp.json()["beds"]}
        if bed_id in beds and beds[bed_id]["patient_id"] is not None:
            client.post(f"/api/beds/release/{bed_id}")
        client.delete(f"/api/beds/delete/{bed_id}")
        client.delete(f"/api/patients/delete/{stay_id}")


def test_beds_display_assign_and_discharge_roundtrip(client):
    # Exercises beds_display's OWN assign/discharge endpoints (independent
    # code path from scheduling/api.py — see bed_manager.py module docstring).
    resp = client.get("/api/patients/next-ids")
    ids = resp.json()
    subject_id, stay_id = ids["next_patient_id"], ids["next_stay_id"]

    resp = client.post("/api/beds/add", json={"bed_number": "PYTEST-BED-DISCHARGE", "bed_type": "normal"})
    assert resp.status_code == 200, resp.text
    bed_id = resp.json()["bed"]["bed_id"]

    try:
        resp = client.post("/api/patients/add", json={
            "patient_id": subject_id, "stay_id": stay_id,
            "name": "PYTEST_PATIENT_2", "gender": "F", "age": 40,
            "acuity": 4, "chiefcomplaint": "PYTEST",
            "arrival_time": "2026-01-01T00:00",
            "temperature": 37.0, "heartrate": 80.0, "resprate": 16.0,
            "o2sat": 98.0, "sbp": 120.0, "dbp": 80.0, "pain": "3",
        })
        assert resp.status_code == 200, resp.text

        resp = client.post(f"/api/beds/assign/{bed_id}", json={"patient_id": subject_id})
        assert resp.status_code == 200, resp.text

        resp = client.get("/api/beds/list")
        bed = next(b for b in resp.json()["beds"] if b["bed_id"] == bed_id)
        assert bed["patient_id"] == subject_id
        assert bed["bed_status"] == "Occupied"

        resp = client.post(f"/api/beds/discharge/{bed_id}", json={"departure_time": "2026-01-01T05:00"})
        assert resp.status_code == 200, resp.text

        resp = client.get("/api/beds/list")
        bed = next(b for b in resp.json()["beds"] if b["bed_id"] == bed_id)
        assert bed["patient_id"] is None
        assert bed["bed_status"] == "Available"

        resp = client.delete(f"/api/data/log-patients/delete/{stay_id}")
        assert resp.status_code == 200, resp.text
    finally:
        resp = client.get("/api/beds/list")
        beds = {b["bed_id"]: b for b in resp.json()["beds"]}
        if bed_id in beds and beds[bed_id]["patient_id"] is not None:
            client.post(f"/api/beds/release/{bed_id}")
        client.delete(f"/api/beds/delete/{bed_id}")
        client.delete(f"/api/patients/delete/{stay_id}")


def test_unurgent_discharge_roundtrip(client):
    # No dedicated "mark unurgent" endpoint exists outside the OR-confirm flow,
    # so use the manager directly for setup (mirrors what or-confirm does).
    resp = client.get("/api/patients/next-ids")
    ids = resp.json()
    subject_id, stay_id = ids["next_patient_id"], ids["next_stay_id"]

    resp = client.post("/api/patients/add", json={
        "patient_id": subject_id, "stay_id": stay_id,
        "name": "PYTEST_UNURGENT", "gender": "F", "age": 22,
        "acuity": 5, "chiefcomplaint": "PYTEST",
        "arrival_time": "2026-01-01T00:00",
        "temperature": 37.0, "heartrate": 80.0, "resprate": 16.0,
        "o2sat": 98.0, "sbp": 120.0, "dbp": 80.0, "pain": "3",
    })
    assert resp.status_code == 200, resp.text

    try:
        DailyPatientsManager().mark_unurgent(stay_id)

        resp = client.get("/api/unurgent/list")
        assert resp.status_code == 200, resp.text
        assert any(p["subject_id"] == subject_id for p in resp.json()["patients"])

        resp = client.post(f"/api/unurgent/discharge/{subject_id}",
                            json={"departure_time": "2026-01-01T02:00"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["stay_id"] == stay_id

        resp = client.get("/api/unurgent/list")
        assert not any(p["subject_id"] == subject_id for p in resp.json()["patients"])

        resp = client.delete(f"/api/data/log-patients/delete/{stay_id}")
        assert resp.status_code == 200, resp.text
    finally:
        client.delete(f"/api/patients/delete/{stay_id}")


def test_ward_census_snapshot_and_history_roundtrip(client):
    # PR #1 feature: WardCensusManager / /api/ward-census/*.
    resp = client.get("/api/ward-census/today")
    assert resp.status_code == 200, resp.text
    today = resp.json()
    assert "date" in today and "wards" in today
    for w in today["wards"]:
        assert {"ward_name", "active_patients", "discharged_patients", "total_patients"} <= w.keys()
        assert w["total_patients"] == w["active_patients"] + w["discharged_patients"]

    resp = client.post("/api/ward-census/snapshot")
    assert resp.status_code == 200, resp.text
    saved = resp.json()
    assert saved["date"] == today["date"]

    resp = client.get("/api/ward-census/history", params={"start": saved["date"], "end": saved["date"]})
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    assert all(r["date"] == saved["date"] for r in rows)
    if today["wards"]:
        saved_names = {r["ward_name"] for r in rows}
        assert any(w["ward_name"] in saved_names for w in today["wards"])


def test_daily_analysis_report_shape(client):
    # PR #1 feature: DailyAnalysisManager / /api/daily-analysis/report.
    resp = client.get("/api/daily-analysis/report")
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert {"date", "patients", "comparison", "wards", "doctors", "nurses"} <= report.keys()
    patients = report["patients"]
    assert {"arrived", "discharged", "net_change", "gender_breakdown", "acuity_breakdown",
            "top_complaints", "destination_breakdown"} <= patients.keys()
    assert patients["net_change"] == patients["arrived"] - patients["discharged"]
    assert report["comparison"]["arrived_delta"] == (
        patients["arrived"] - client.get(
            "/api/daily-analysis/report", params={"date": report["comparison"]["prev_date"]}
        ).json()["patients"]["arrived"]
    )


def test_patient_add_rejects_missing_required_fields(client):
    # PR #1 tightened validation: name/gender/arrival_time/pain/chiefcomplaint are
    # now required (previously Optional[..] = None) and age must be >= 0.
    resp = client.get("/api/patients/next-ids")
    ids = resp.json()
    base = {
        "patient_id": ids["next_patient_id"], "stay_id": ids["next_stay_id"],
        "name": "PYTEST_VALIDATION", "gender": "M", "age": 30,
        "arrival_time": "2026-01-01T00:00", "temperature": 37.0, "heartrate": 80.0,
        "resprate": 16.0, "o2sat": 98.0, "sbp": 120.0, "dbp": 80.0,
        "pain": "3", "acuity": 3, "chiefcomplaint": "PYTEST",
    }

    for missing_field in ("name", "gender", "arrival_time", "pain", "chiefcomplaint"):
        payload = dict(base)
        payload[missing_field] = ""
        resp = client.post("/api/patients/add", json=payload)
        assert resp.status_code == 422, f"expected 422 for blank {missing_field}, got {resp.status_code}: {resp.text}"

    payload = dict(base)
    payload["age"] = -1
    resp = client.post("/api/patients/add", json=payload)
    assert resp.status_code == 422, resp.text


def test_discharge_destination_and_staff_log_archiving(client):
    # PR #1 features: destination field on discharge (validated by
    # timestamp_utils.validate_destination), bed_history/admission_ward stamped
    # by BedManager.add_bed_to_history, and patient<->doctor/nurse links
    # archived into PatientDoctorLog/PatientNurseLog (surfaced as "ended_patients"
    # in the daily-analysis report) rather than just deleted.
    resp = client.post("/api/scheduling/discharge/1/1", json={"destination": "not a valid destination"})
    assert resp.status_code == 422, resp.text

    resp = client.get("/api/patients/next-ids")
    ids = resp.json()
    subject_id, stay_id = ids["next_patient_id"], ids["next_stay_id"]

    resp = client.post("/api/beds/add", json={"bed_number": "PYTEST-BED-DEST", "bed_type": "normal"})
    assert resp.status_code == 200, resp.text
    bed_id = resp.json()["bed"]["bed_id"]

    resp = client.get("/api/staff/doctors/list")
    doctors = resp.json()["doctors"]
    resp = client.get("/api/staff/nurses/list")
    nurses = resp.json()["nurses"]
    if not doctors or not nurses:
        pytest.skip("No doctors/nurses in the current dataset")
    doctor_id, nurse_id = doctors[0]["id"], nurses[0]["id"]

    # PatientDoctorLog/PatientNurseLog stamp archived_at with the real wall-clock
    # time of the API call (see link_archiver.py), not the user-supplied
    # departure_time — so departure_time must also be "today" for the
    # doctor/nurse "ended_patients" assertions below to line up with the
    # destination/patient-count assertions on the same report date.
    departure_date = date.today().isoformat()
    try:
        resp = client.post("/api/patients/add", json={
            "patient_id": subject_id, "stay_id": stay_id,
            "name": "PYTEST_DEST_PATIENT", "gender": "F", "age": 45,
            "acuity": 3, "chiefcomplaint": "PYTEST",
            "arrival_time": "2026-01-01T00:00",
            "temperature": 37.0, "heartrate": 80.0, "resprate": 16.0,
            "o2sat": 98.0, "sbp": 120.0, "dbp": 80.0, "pain": "3",
        })
        assert resp.status_code == 200, resp.text

        resp = client.post("/api/scheduling/assign", json={
            "patient_id": subject_id, "bed_id": bed_id,
            "doctor_id": doctor_id, "nurse1_id": nurse_id,
        })
        assert resp.status_code == 200, resp.text

        resp = client.post(f"/api/scheduling/discharge/{subject_id}/{bed_id}", json={
            "departure_time": f"{departure_date}T05:00",
            "destination": "Hospital Department: Cardiology",
        })
        assert resp.status_code == 200, resp.text

        resp = client.get("/api/data/log-patients/list")
        log_row = next(p for p in resp.json()["patients"] if p["stay_id"] == stay_id)
        assert log_row["destination"] == "Hospital Department: Cardiology"
        assert log_row["bed_history"] == "PYTEST-BED-DEST"

        resp = client.get("/api/daily-analysis/report", params={"date": departure_date})
        assert resp.status_code == 200, resp.text
        report = resp.json()
        # analysis_manager.py collapses any "Hospital Department: <detail>" value
        # into the bare "Hospital Department" bucket for the breakdown.
        assert report["patients"]["destination_breakdown"].get("Hospital Department", 0) >= 1
        doctor_row = next((d for d in report["doctors"] if d["id"] == doctor_id), None)
        nurse_row = next((n for n in report["nurses"] if n["id"] == nurse_id), None)
        assert doctor_row is not None and doctor_row["ended_patients"] >= 1
        assert nurse_row is not None and nurse_row["ended_patients"] >= 1

        resp = client.delete(f"/api/data/log-patients/delete/{stay_id}")
        assert resp.status_code == 200, resp.text
    finally:
        resp = client.get("/api/beds/list")
        beds = {b["bed_id"]: b for b in resp.json()["beds"]}
        if bed_id in beds and beds[bed_id]["patient_id"] is not None:
            client.post(f"/api/beds/release/{bed_id}")
        client.delete(f"/api/beds/delete/{bed_id}")
        client.delete(f"/api/patients/delete/{stay_id}")


def test_or_suggest_and_confirm_roundtrip(client):
    # Exercises the OR scheduler's data-loading rewrite end-to-end: a free ICU
    # bed in the critical ward (ward_id=1) should be suggested for a new
    # acuity-1 patient, and or-confirm should create the same patient_bed link
    # and stamp bed_occupation_time as the CSV-era code did.
    resp = client.get("/api/data/wards/list")
    wards = resp.json()["wards"]
    ward1 = next((w for w in wards if w["ward_id"] == 1), None)
    if ward1 is None:
        pytest.skip("Ward 1 (critical ward) not present in this dataset")

    resp = client.post("/api/beds/add", json={"bed_number": "PYTEST-ICU-1", "ward_id": 1, "bed_type": "ICU"})
    assert resp.status_code == 200, resp.text
    bed_id = resp.json()["bed"]["bed_id"]

    resp = client.get("/api/patients/next-ids")
    ids = resp.json()
    subject_id, stay_id = ids["next_patient_id"], ids["next_stay_id"]

    resp = client.post("/api/patients/add", json={
        "patient_id": subject_id, "stay_id": stay_id,
        "name": "PYTEST_OR_PATIENT", "gender": "M", "age": 50,
        "acuity": 1, "chiefcomplaint": "PYTEST",
        "arrival_time": "2026-01-01T00:00",
        "temperature": 37.0, "heartrate": 80.0, "resprate": 16.0,
        "o2sat": 98.0, "sbp": 120.0, "dbp": 80.0, "pain": "3",
    })
    assert resp.status_code == 200, resp.text

    try:
        resp = client.post("/api/simulation/or-suggest", json={"strict_nurses": False})
        assert resp.status_code == 200, resp.text
        suggestions = resp.json()["suggestions"]
        suggestion = next(s for s in suggestions if s["patient_id"] == subject_id)
        assert suggestion["acuity_lane"] == "1-2"
        assert suggestion["bed_id"] == bed_id

        resp = client.post("/api/simulation/or-confirm", json={
            "patient_id": subject_id, "stay_id": stay_id, "bed_id": bed_id,
        })
        assert resp.status_code == 200, resp.text

        resp = client.get("/api/beds/list")
        bed = next(b for b in resp.json()["beds"] if b["bed_id"] == bed_id)
        assert bed["patient_id"] == subject_id

        resp = client.get("/api/data/daily-patients/list")
        patient = next(p for p in resp.json()["patients"] if p["subject_id"] == subject_id)
        assert patient["bed_occupation_time"]
    finally:
        resp = client.get("/api/beds/list")
        beds = {b["bed_id"]: b for b in resp.json()["beds"]}
        if bed_id in beds and beds[bed_id]["patient_id"] is not None:
            client.post(f"/api/beds/release/{bed_id}")
        client.delete(f"/api/beds/delete/{bed_id}")
        client.delete(f"/api/patients/delete/{stay_id}")

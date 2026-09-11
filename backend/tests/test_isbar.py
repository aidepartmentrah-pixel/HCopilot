# ISBAR nursing-handover field tests — PatientISBARDetails table + the
# isbar field on PatientCreate/PatientModify + the 5 new statistics
# endpoints. Follows the existing test_endpoints.py conventions exactly:
# ephemeral PYTEST_* rows, cleanup unconditionally in `finally`, no isolated
# test database (this client hits whatever DB `app` is configured for).

import pytest


def _next_ids(client):
    resp = client.get("/api/patients/next-ids")
    ids = resp.json()
    return ids["next_patient_id"], ids["next_stay_id"]


def _base_payload(patient_id, stay_id, name="PYTEST_ISBAR"):
    return {
        "patient_id": patient_id, "stay_id": stay_id,
        "name": name, "gender": "F", "age": 45,
        "acuity": 2, "chiefcomplaint": "PYTEST",
        "arrival_time": "2026-01-01T00:00",
        "temperature": 37.0, "heartrate": 80.0, "resprate": 16.0,
        "o2sat": 98.0, "sbp": 120.0, "dbp": 80.0, "pain": "3",
    }


def test_patient_add_without_isbar_still_works(client):
    patient_id, stay_id = _next_ids(client)
    try:
        resp = client.post("/api/patients/add", json=_base_payload(patient_id, stay_id))
        assert resp.status_code == 200, resp.text

        resp = client.get(f"/api/patients/{stay_id}/details")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["isbar"] is None
    finally:
        client.delete(f"/api/patients/delete/{stay_id}")


def test_patient_add_with_full_isbar_fields_roundtrip(client):
    patient_id, stay_id = _next_ids(client)
    isbar = {
        "blood_glucose": 105, "o2_support": "nasal_cannula", "o2_flow_rate": 2,
        "vitals_measured_at": "2026-01-01T00:05", "vitals_recorded_by": "PYTEST_NURSE",
        "reason_for_admission": "Chest pain", "current_diagnosis": "Rule out ACS",
        "clinical_status": "Close monitoring",
        "immediate_concerns": "chest_pain,other", "immediate_concerns_other": "Palpitations",
        "past_medical_history": "hypertension,diabetes", "surgical_history_flag": "No",
        "allergies_status": "Yes", "allergy_substance": "Penicillin", "allergy_reaction": "Rash",
        "isolation_precautions": "Contact",
        "high_alert_meds": "insulin",
        "neuro_status": "Alert", "telemetry": "Yes", "edema": "No", "peripheral_pulses": "Yes",
        "diet": "Regular", "npo": "No", "swallow_assessment": "Passed",
        "voiding": "Independent", "urinary_catheter": "No", "wounds": "No",
        "fall_risk": "Yes", "pressure_injury_risk": "No", "mobility_aids": "No",
        "lines_tubes_drains": "peripheral_iv",
        "intake_ml": 500, "output_ml": 300,
        "nursing_priorities": "frequent_vitals,pain_reassessment",
        "meds_due_next_shift": "Aspirin 81mg",
        "discharge_transfer_plan": "icu_hdu",
        "outstanding_tasks": "blood_sampling",
        "outgoing_nurse": "PYTEST_OUT", "incoming_nurse": "PYTEST_IN",
        "handover_datetime": "2026-01-01T07:00", "receiver_ack": True,
    }
    try:
        payload = _base_payload(patient_id, stay_id)
        payload["isbar"] = isbar
        resp = client.post("/api/patients/add", json=payload)
        assert resp.status_code == 200, resp.text

        resp = client.get(f"/api/patients/{stay_id}/details")
        assert resp.status_code == 200, resp.text
        saved = resp.json()["isbar"]
        assert saved is not None
        for k, v in isbar.items():
            if v == "" or v is None:
                continue
            assert saved[k] == v, f"{k}: expected {v!r}, got {saved.get(k)!r}"
    finally:
        client.delete(f"/api/patients/delete/{stay_id}")


def test_isbar_edit_roundtrip(client):
    patient_id, stay_id = _next_ids(client)
    try:
        resp = client.post("/api/patients/add", json=_base_payload(patient_id, stay_id))
        assert resp.status_code == 200, resp.text

        modify_payload = _base_payload(patient_id, stay_id)
        del modify_payload["stay_id"]
        modify_payload["isbar"] = {"clinical_status": "Stable", "fall_risk": "No"}
        resp = client.put(f"/api/patients/modify/{stay_id}", json=modify_payload)
        assert resp.status_code == 200, resp.text

        resp = client.get(f"/api/patients/{stay_id}/details")
        assert resp.json()["isbar"]["clinical_status"] == "Stable"

        modify_payload["isbar"] = {"clinical_status": "Critical", "fall_risk": "Yes"}
        resp = client.put(f"/api/patients/modify/{stay_id}", json=modify_payload)
        assert resp.status_code == 200, resp.text

        resp = client.get(f"/api/patients/{stay_id}/details")
        body = resp.json()["isbar"]
        assert body["clinical_status"] == "Critical"
        assert body["fall_risk"] == "Yes"
    finally:
        client.delete(f"/api/patients/delete/{stay_id}")


def test_isbar_optional_fields_can_be_omitted(client):
    patient_id, stay_id = _next_ids(client)
    try:
        payload = _base_payload(patient_id, stay_id)
        payload["isbar"] = {"clinical_status": "Stable"}
        resp = client.post("/api/patients/add", json=payload)
        assert resp.status_code == 200, resp.text

        resp = client.get(f"/api/patients/{stay_id}/details")
        isbar = resp.json()["isbar"]
        assert isbar["clinical_status"] == "Stable"
        assert isbar["allergy_substance"] is None
        assert isbar["o2_flow_rate"] is None
    finally:
        client.delete(f"/api/patients/delete/{stay_id}")


@pytest.mark.parametrize("bad_isbar", [
    {"allergies_status": "Yes"},                              # missing substance/reaction
    {"allergies_status": "Yes", "allergy_substance": "Nuts"},  # missing reaction only
    {"surgical_history_flag": "Yes"},                          # missing surgical_history_text
    {"o2_support": "simple_mask"},                             # missing o2_flow_rate
    {"o2_support": "nasal_cannula", "o2_flow_rate": None},     # same, explicit None
    {"immediate_concerns": "other"},                           # missing immediate_concerns_other
    {"discharge_transfer_plan": "other"},                      # missing discharge_transfer_plan_other
    {"clinical_status": "Not A Real Status"},                  # unknown enum token
    {"o2_support": "not_a_real_support_type"},                 # unknown enum token
    {"immediate_concerns": "not_a_real_concern"},              # unknown multi-select token
])
def test_isbar_conditional_and_allowlist_validation_rejects(client, bad_isbar):
    patient_id, stay_id = _next_ids(client)
    payload = _base_payload(patient_id, stay_id)
    payload["isbar"] = bad_isbar
    resp = client.post("/api/patients/add", json=payload)
    assert resp.status_code == 422, resp.text
    # Nothing should have been persisted — confirm the stay was never created.
    resp2 = client.get(f"/api/patients/{stay_id}/details")
    assert resp2.status_code == 404


def test_isbar_invalid_numeric_rejected(client):
    patient_id, stay_id = _next_ids(client)
    payload = _base_payload(patient_id, stay_id)
    payload["isbar"] = {"blood_glucose": "not-a-number"}
    resp = client.post("/api/patients/add", json=payload)
    assert resp.status_code == 422, resp.text


def test_isbar_survives_discharge(client):
    # This is the test that validates the core design decision: ISBAR data
    # lives in a side table keyed by stay_id, so it must still be readable
    # after the stay moves from DailyPatients to LogPatients on discharge.
    patient_id, stay_id = _next_ids(client)

    resp = client.post("/api/beds/add", json={"bed_number": "PYTEST-BED-ISBAR", "bed_type": "normal"})
    assert resp.status_code == 200, resp.text
    bed_id = resp.json()["bed"]["bed_id"]

    try:
        payload = _base_payload(patient_id, stay_id)
        payload["isbar"] = {"clinical_status": "Deteriorating", "fall_risk": "Yes",
                             "discharge_transfer_plan": "ward"}
        resp = client.post("/api/patients/add", json=payload)
        assert resp.status_code == 200, resp.text

        resp = client.post("/api/scheduling/assign", json={"patient_id": patient_id, "bed_id": bed_id})
        assert resp.status_code == 200, resp.text

        resp = client.post(f"/api/scheduling/discharge/{patient_id}/{bed_id}",
                            json={"departure_time": "2026-01-01T05:00"})
        assert resp.status_code == 200, resp.text

        resp = client.get(f"/api/patients/{stay_id}/details")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["source"] == "log"
        assert body["isbar"] is not None
        assert body["isbar"]["clinical_status"] == "Deteriorating"
        assert body["isbar"]["fall_risk"] == "Yes"

        resp = client.delete(f"/api/data/log-patients/delete/{stay_id}")
        assert resp.status_code == 200, resp.text
    finally:
        resp = client.get("/api/beds/list")
        beds = {b["bed_id"]: b for b in resp.json()["beds"]}
        if bed_id in beds and beds[bed_id]["patient_id"] is not None:
            client.post(f"/api/beds/release/{bed_id}")
        client.delete(f"/api/beds/delete/{bed_id}")
        client.delete(f"/api/patients/delete/{stay_id}")


def test_existing_rows_with_null_isbar_still_readable(client):
    patient_id, stay_id = _next_ids(client)
    try:
        resp = client.post("/api/patients/add", json=_base_payload(patient_id, stay_id))
        assert resp.status_code == 200, resp.text

        resp = client.get("/api/patients/list")
        assert resp.status_code == 200, resp.text
        row = next(p for p in resp.json()["patients"] if p["stay_id"] == stay_id)
        assert row["isbar"] is None

        resp = client.get(f"/api/patients/{stay_id}/details")
        assert resp.status_code == 200, resp.text
        assert resp.json()["isbar"] is None
    finally:
        client.delete(f"/api/patients/delete/{stay_id}")


def test_patient_details_404_for_unknown_stay(client):
    resp = client.get("/api/patients/999999999/details")
    assert resp.status_code == 404


@pytest.mark.parametrize("path", [
    "/api/statistics/clinical-status",
    "/api/statistics/immediate-concerns",
    "/api/statistics/safety-risks",
    "/api/statistics/o2-support",
    "/api/statistics/discharge-transfer",
])
def test_new_statistics_endpoints_return_200(client, path):
    resp = client.get(path)
    assert resp.status_code == 200, f"{path} -> {resp.status_code}: {resp.text}"


def test_new_statistics_endpoints_shape(client):
    resp = client.get("/api/statistics/clinical-status")
    body = resp.json()
    assert {"labels", "counts", "total"} <= body.keys()
    assert len(body["labels"]) == len(body["counts"])

    resp = client.get("/api/statistics/safety-risks")
    body = resp.json()
    assert "documented_total" in body and "risks" in body
    for key in ("fall_risk", "pressure_injury_risk", "allergies", "isolation_precautions"):
        assert key in body["risks"]
        assert {"count", "pct"} <= body["risks"][key].keys()


def test_statistics_empty_dataset_shapes_are_well_formed():
    # Unit-tests the new StatsManager methods directly against an empty
    # DataFrame, bypassing the DB layer — there is no isolated test DB here
    # to guarantee zero live ISBAR rows, so this is the only reliable way to
    # exercise the true empty-dataset path (mirrors vitals_summary's own
    # len(daily) == 0 guard, which is untestable live for the same reason).
    import pandas as pd
    from features.statistics import stats_manager as sm

    empty_isbar = pd.DataFrame(columns=sm._ISBAR_COLS)

    original_read_isbar = sm._read_isbar
    sm._read_isbar = lambda: empty_isbar
    try:
        mgr = sm.StatsManager()
        assert mgr.clinical_status_distribution() == {"labels": [], "counts": [], "total": 0}
        assert mgr.top_immediate_concerns() == {"labels": [], "counts": [], "total": 0}
        assert mgr.o2_support_distribution() == {"labels": [], "counts": [], "total": 0}
        assert mgr.discharge_transfer_distribution() == {"labels": [], "counts": [], "total": 0}
        risks = mgr.safety_risk_summary()
        assert risks["documented_total"] == 0
        for v in risks["risks"].values():
            assert v == {"count": 0, "pct": 0}
    finally:
        sm._read_isbar = original_read_isbar

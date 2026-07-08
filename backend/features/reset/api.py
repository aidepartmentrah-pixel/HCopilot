# =============================================================================
# reset/api.py — Destructive Data-Clear Endpoints
# =============================================================================
#
# Provides POST endpoints that wipe one or more CSV data stores back to an
# empty state (header row only).  These are used from the Settings → Reset tab
# when the operator wants to clear test data or start fresh.
#
# ENDPOINTS (all are POST — a GET would be dangerous if cached by a browser):
#   POST /api/reset/patients  — clear DailyPatients, LogPatients, and all patient
#                               relation rows; also resets staff patient counts
#   POST /api/reset/beds      — clear EDbeds and bed relation rows
#   POST /api/reset/doctors   — clear Doctors and doctor relation rows
#   POST /api/reset/nurses    — clear Nurses and nurse relation rows
#   POST /api/reset/wards     — clear Wards and ward relation rows
#   POST /api/reset/relations — clear all six relation tables (no entity rows deleted)
#   POST /api/reset/all       — wipe every table in SCHEMAS
#
# SAFETY:
#   There is deliberately NO authentication or confirmation step in this module —
#   that responsibility lives in the frontend (confirmation modal).  These endpoints
#   should not be exposed publicly in a production deployment.
# =============================================================================

import os
import pandas as pd
from fastapi import APIRouter, HTTPException

router = APIRouter()

DS = os.path.join(os.path.dirname(__file__), "..", "..", "datasets")


def _zero_staff_counts():
    """Clear patientNb/patientNB and availabilityTimeStart for all doctors and nurses."""
    for fname, nb_col in [("Doctors", "patientNb"), ("Nurses", "patientNB")]:
        path = os.path.join(DS, fname + ".csv")
        if not os.path.exists(path):
            continue
        df = pd.read_csv(path, dtype=object)
        if nb_col in df.columns:
            df[nb_col] = ""
        if "availabilityTimeStart" in df.columns:
            df["availabilityTimeStart"] = ""
        df.to_csv(path, index=False)

SCHEMAS = {
    "DailyPatients":  ["subject_id","stay_id","name","gender","age","temperature","heartrate","resprate","o2sat","sbp","dbp","pain","acuity","chiefcomplaint","arrival_time","departure_time","bed_occupation_time"],
    "LogPatients":    ["subject_id","stay_id","name","gender","age","temperature","heartrate","resprate","o2sat","sbp","dbp","pain","acuity","chiefcomplaint","arrival_time","departure_time","bed_occupation_time"],
    "EDbeds":         ["bed_id","bed_number","bed_status","type"],
    "Doctors":        ["id","intern_or_not","shift","work_days","patientNb","availabilityTimeStart"],
    "Nurses":         ["id","role","shift","group","patientNB","availabilityTimeStart"],
    "Wards":          ["ward_id","ward_name","department_id"],
    "patient_bed":    ["patient_id","bed_id"],
    "patient_doctor": ["patient_id","doctor_id"],
    "patient_nurse":  ["patient_id","nurse_id"],
    "ward_bed":       ["ward_id","bed_id"],
    "ward_doctor":    ["ward_id","doctor_id"],
    "ward_nurse":     ["ward_id","nurse_id"],
}


def _clear(name: str):
    path = os.path.join(DS, name + ".csv")
    pd.DataFrame(columns=SCHEMAS[name]).to_csv(path, index=False)


@router.post("/patients")
async def reset_patients():
    """Wipe all patient stay data and patient relation rows; reset staff patient counts."""
    try:
        for f in ["DailyPatients", "LogPatients", "patient_doctor", "patient_nurse", "patient_bed"]:
            _clear(f)
        _zero_staff_counts()
        return {"ok": True, "message": "All patient data and patient relations cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/beds")
async def reset_beds():
    """Wipe EDbeds.csv and all bed-relation rows (patient_bed, ward_bed)."""
    try:
        for f in ["EDbeds", "patient_bed", "ward_bed"]:
            _clear(f)
        return {"ok": True, "message": "All bed data and bed relations cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/doctors")
async def reset_doctors():
    """Wipe Doctors.csv and all doctor-relation rows (patient_doctor, ward_doctor)."""
    try:
        for f in ["Doctors", "patient_doctor", "ward_doctor"]:
            _clear(f)
        return {"ok": True, "message": "All doctor data and doctor relations cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nurses")
async def reset_nurses():
    """Wipe Nurses.csv and all nurse-relation rows (patient_nurse, ward_nurse)."""
    try:
        for f in ["Nurses", "patient_nurse", "ward_nurse"]:
            _clear(f)
        return {"ok": True, "message": "All nurse data and nurse relations cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/wards")
async def reset_wards():
    """Wipe Wards.csv and all ward-relation rows (ward_bed, ward_doctor, ward_nurse)."""
    try:
        for f in ["Wards", "ward_bed", "ward_doctor", "ward_nurse"]:
            _clear(f)
        return {"ok": True, "message": "All ward data and ward relations cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/relations")
async def reset_relations():
    """Wipe all six relation tables without touching entity rows; resets staff patient counts."""
    try:
        for f in ["patient_bed", "patient_doctor", "patient_nurse", "ward_bed", "ward_doctor", "ward_nurse"]:
            _clear(f)
        _zero_staff_counts()
        return {"ok": True, "message": "All relation tables cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/all")
async def reset_all():
    """Wipe every table in SCHEMAS — full system reset to a blank initial state."""
    try:
        for name in SCHEMAS:
            _clear(name)
        return {"ok": True, "message": "System fully reset — all data cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

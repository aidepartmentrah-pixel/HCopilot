# =============================================================================
# reset/api.py — Destructive Data-Clear Endpoints
# =============================================================================
#
# Provides POST endpoints that wipe one or more SQL Server tables back to an
# empty state.  These are used from the Settings -> Reset tab when the
# operator wants to clear test data or start fresh.
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

from fastapi import APIRouter, HTTPException

from db.session import SessionLocal
from db.models import (
    DailyPatient, LogPatient, EDBed, Doctor, Nurse, Ward,
    PatientBed, PatientDoctor, PatientNurse, WardBed, WardDoctor, WardNurse,
)

router = APIRouter()

SCHEMAS = {
    "DailyPatients":  DailyPatient,
    "LogPatients":    LogPatient,
    "EDbeds":         EDBed,
    "Doctors":        Doctor,
    "Nurses":         Nurse,
    "Wards":          Ward,
    "patient_bed":    PatientBed,
    "patient_doctor": PatientDoctor,
    "patient_nurse":  PatientNurse,
    "ward_bed":       WardBed,
    "ward_doctor":    WardDoctor,
    "ward_nurse":     WardNurse,
}


def _zero_staff_counts(session):
    """Clear patientNb/patientNB and availabilityTimeStart for all doctors and nurses."""
    for doctor in session.query(Doctor).all():
        doctor.patientNb = ""
        doctor.availabilityTimeStart = ""
    for nurse in session.query(Nurse).all():
        nurse.patientNB = ""
        nurse.availabilityTimeStart = ""


def _clear(session, name: str):
    session.query(SCHEMAS[name]).delete(synchronize_session=False)


@router.post("/patients")
async def reset_patients():
    """Wipe all patient stay data and patient relation rows; reset staff patient counts."""
    try:
        with SessionLocal() as session:
            for f in ["DailyPatients", "LogPatients", "patient_doctor", "patient_nurse", "patient_bed"]:
                _clear(session, f)
            _zero_staff_counts(session)
            session.commit()
        return {"ok": True, "message": "All patient data and patient relations cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/beds")
async def reset_beds():
    """Wipe EDbeds and all bed-relation rows (patient_bed, ward_bed)."""
    try:
        with SessionLocal() as session:
            for f in ["EDbeds", "patient_bed", "ward_bed"]:
                _clear(session, f)
            session.commit()
        return {"ok": True, "message": "All bed data and bed relations cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/doctors")
async def reset_doctors():
    """Wipe Doctors and all doctor-relation rows (patient_doctor, ward_doctor)."""
    try:
        with SessionLocal() as session:
            for f in ["Doctors", "patient_doctor", "ward_doctor"]:
                _clear(session, f)
            session.commit()
        return {"ok": True, "message": "All doctor data and doctor relations cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nurses")
async def reset_nurses():
    """Wipe Nurses and all nurse-relation rows (patient_nurse, ward_nurse)."""
    try:
        with SessionLocal() as session:
            for f in ["Nurses", "patient_nurse", "ward_nurse"]:
                _clear(session, f)
            session.commit()
        return {"ok": True, "message": "All nurse data and nurse relations cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/wards")
async def reset_wards():
    """Wipe Wards and all ward-relation rows (ward_bed, ward_doctor, ward_nurse)."""
    try:
        with SessionLocal() as session:
            for f in ["Wards", "ward_bed", "ward_doctor", "ward_nurse"]:
                _clear(session, f)
            session.commit()
        return {"ok": True, "message": "All ward data and ward relations cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/relations")
async def reset_relations():
    """Wipe all six relation tables without touching entity rows; resets staff patient counts."""
    try:
        with SessionLocal() as session:
            for f in ["patient_bed", "patient_doctor", "patient_nurse", "ward_bed", "ward_doctor", "ward_nurse"]:
                _clear(session, f)
            _zero_staff_counts(session)
            session.commit()
        return {"ok": True, "message": "All relation tables cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/all")
async def reset_all():
    """Wipe every table in SCHEMAS — full system reset to a blank initial state."""
    try:
        with SessionLocal() as session:
            # Relation/child tables first so FK constraints (Doctors/Nurses <-
            # Shifts/Groups is the only cross-table FK, unaffected here; the
            # patient_*/ward_* tables FK to EDbeds/Doctors/Nurses/Wards) don't
            # block deletion of their referenced parent rows.
            for name in ["patient_bed", "patient_doctor", "patient_nurse",
                         "ward_bed", "ward_doctor", "ward_nurse",
                         "DailyPatients", "LogPatients", "EDbeds", "Doctors", "Nurses", "Wards"]:
                _clear(session, name)
            session.commit()
        return {"ok": True, "message": "System fully reset — all data cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# staff_logs/link_archiver.py — Archive patient<->doctor / patient<->nurse
# links before they are removed from the live relation tables.
# =============================================================================
#
# patient_doctor / patient_nurse (see db/models.py) only ever reflect the
# CURRENT link — a row is deleted the moment a patient is discharged,
# reassigned, or manually unassigned, and also when the doctor/nurse
# themselves is deleted. That makes "which doctor/nurse treated which
# patient" impossible to reconstruct historically.
#
# Each function here copies the relevant live row(s) into PatientDoctorLog /
# PatientNurseLog — denormalizing the doctor/nurse name so the archive never
# depends on the Doctors/Nurses row (or even DoctorLog/NurseLog) still
# existing — and must be called BEFORE the corresponding
# RelationsManager.delete_by_left/delete_by_right call removes the live row.
#
# archived_at is the one timestamp guaranteed accurate here (the moment the
# link was severed); daily statistics filter on it directly rather than
# trying to reconstruct when the link began.
# =============================================================================

from datetime import datetime

from db.session import SessionLocal
from db.models import (
    Doctor, Nurse, DailyPatient,
    PatientDoctor, PatientNurse,
    PatientDoctorLog, PatientNurseLog,
)


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def archive_patient_doctor_links(patient_id: int, stay_id: int = None):
    """Archive every current patient_doctor row for this patient (discharge,
    unassignment, or reassignment). Call before rel.delete_by_left('patient_doctor', patient_id)."""
    with SessionLocal() as session:
        links = session.query(PatientDoctor).filter(PatientDoctor.patient_id == patient_id).all()
        if not links:
            return
        doctors = {d.id: d.name for d in session.query(Doctor).all()}
        now = _now()
        for link in links:
            session.add(PatientDoctorLog(
                patient_id=patient_id, stay_id=stay_id, doctor_id=link.doctor_id,
                doctor_name=doctors.get(link.doctor_id), archived_at=now,
            ))
        session.commit()


def archive_patient_nurse_links(patient_id: int, stay_id: int = None):
    """Nurse equivalent of archive_patient_doctor_links()."""
    with SessionLocal() as session:
        links = session.query(PatientNurse).filter(PatientNurse.patient_id == patient_id).all()
        if not links:
            return
        nurses = {n.id: n.name for n in session.query(Nurse).all()}
        now = _now()
        for link in links:
            session.add(PatientNurseLog(
                patient_id=patient_id, stay_id=stay_id, nurse_id=link.nurse_id,
                nurse_name=nurses.get(link.nurse_id), archived_at=now,
            ))
        session.commit()


def archive_doctor_links(doctor_id: int):
    """Archive every current patient_doctor row referencing this doctor, before
    the doctor (DoctorsManager.delete()) removes them via delete_by_right()."""
    with SessionLocal() as session:
        links = session.query(PatientDoctor).filter(PatientDoctor.doctor_id == doctor_id).all()
        if not links:
            return
        doctor = session.query(Doctor).filter(Doctor.id == doctor_id).first()
        doctor_name = doctor.name if doctor else None
        stay_by_patient = {p.subject_id: p.stay_id for p in session.query(DailyPatient).all()}
        now = _now()
        for link in links:
            session.add(PatientDoctorLog(
                patient_id=link.patient_id, stay_id=stay_by_patient.get(link.patient_id),
                doctor_id=doctor_id, doctor_name=doctor_name, archived_at=now,
            ))
        session.commit()


def archive_nurse_links(nurse_id: int):
    """Nurse equivalent of archive_doctor_links()."""
    with SessionLocal() as session:
        links = session.query(PatientNurse).filter(PatientNurse.nurse_id == nurse_id).all()
        if not links:
            return
        nurse = session.query(Nurse).filter(Nurse.id == nurse_id).first()
        nurse_name = nurse.name if nurse else None
        stay_by_patient = {p.subject_id: p.stay_id for p in session.query(DailyPatient).all()}
        now = _now()
        for link in links:
            session.add(PatientNurseLog(
                patient_id=link.patient_id, stay_id=stay_by_patient.get(link.patient_id),
                nurse_id=nurse_id, nurse_name=nurse_name, archived_at=now,
            ))
        session.commit()

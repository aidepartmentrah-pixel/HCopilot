# =============================================================================
# staff_management/doctors_manager.py — Doctors / Interns SQL Server Manager
# =============================================================================
#
# Handles all CRUD operations for doctor and intern records stored in the
# Doctors table.
#
# KEY BEHAVIOURS (unchanged from the CSV-era implementation):
#   update_patient_count — increments or decrements the patientNb counter for a
#                           specific doctor. When the count drops to 0, the field
#                           availabilityTimeStart is stamped with the current time
#                           so the scheduler can give priority to the doctor who
#                           has been idle the longest (fairness-based scheduling).
#   patientNb / availabilityTimeStart stay text columns (not INTEGER/DATETIME):
#                           the existing convention writes "" (not NULL) for a
#                           zero count / cleared timestamp — preserved exactly.
#   Relations cleanup     — delete() removes the doctor row and also removes all
#                           rows from patient_doctor and ward_doctor via
#                           RelationsManager so no orphaned references remain.
#
# shift / work_days now carry a real FK to Shifts.name / Groups.name (see
# db/models.py) — an invalid shift or group name is rejected with a clean 400
# instead of being silently stored, which the CSV version allowed.
# =============================================================================

from datetime import datetime
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from db.session import SessionLocal
from db.models import Doctor, DoctorLog
from features.relations.relations_manager import RelationsManager
from features.staff_logs.link_archiver import archive_doctor_links

VALID_TYPES = ["doctor", "intern"]


class DoctorsManager:
    def _row(self, doctor: Doctor) -> dict:
        absent = str(doctor.absent or "False").strip().lower() in ("true", "1", "yes")
        return {
            "id":                    doctor.id,
            "name":                  doctor.name,
            "intern_or_not":         doctor.intern_or_not,
            "shift":                 doctor.shift,
            "work_days":             doctor.work_days.strip() if doctor.work_days is not None else None,
            "absent":                absent,
            "patientNb":             doctor.patientNb,
            "availabilityTimeStart": doctor.availabilityTimeStart,
        }

    def get_all(self):
        with SessionLocal() as session:
            doctors = session.query(Doctor).all()
            return {"doctors": [self._row(d) for d in doctors], "total": len(doctors)}

    def get_stats(self):
        with SessionLocal() as session:
            doctors = session.query(Doctor).all()
            return {
                "total":   len(doctors),
                "doctors": sum(1 for d in doctors if d.intern_or_not == "doctor"),
                "interns": sum(1 for d in doctors if d.intern_or_not == "intern"),
                "morning": sum(1 for d in doctors if d.shift == "morning"),
                "night":   sum(1 for d in doctors if d.shift == "night"),
                "group1":  sum(1 for d in doctors if (d.work_days or "").strip() == "Group 1"),
                "group2":  sum(1 for d in doctors if (d.work_days or "").strip() == "Group 2"),
            }

    def add(self, intern_or_not, shift, work_days, patientNb=None, availabilityTimeStart=None, name=None):
        if intern_or_not not in VALID_TYPES:
            raise HTTPException(status_code=400, detail=f"Type must be one of {VALID_TYPES}")
        with SessionLocal() as session:
            max_id = session.query(Doctor.id).order_by(Doctor.id.desc()).first()
            new_id = (max_id[0] + 1) if max_id else 1
            doctor = Doctor(
                id=new_id, name=name, intern_or_not=intern_or_not,
                shift=shift, work_days=work_days, absent="False",
                patientNb=patientNb, availabilityTimeStart=availabilityTimeStart,
            )
            session.add(doctor)
            try:
                session.commit()
            except IntegrityError as e:
                session.rollback()
                raise HTTPException(status_code=400, detail=f"Invalid shift or work_days: {e.orig}")

            return {
                "success": True, "message": "Doctor/Intern added successfully",
                "doctor": {"id": new_id, "name": name, "intern_or_not": intern_or_not,
                           "shift": shift, "work_days": work_days, "absent": False,
                           "patientNb": patientNb, "availabilityTimeStart": availabilityTimeStart},
            }

    def modify(self, id_, intern_or_not, shift, work_days, patientNb=None, availabilityTimeStart=None, name=None):
        if intern_or_not not in VALID_TYPES:
            raise HTTPException(status_code=400, detail=f"Type must be one of {VALID_TYPES}")
        with SessionLocal() as session:
            doctor = session.query(Doctor).filter(Doctor.id == id_).first()
            if doctor is None:
                raise HTTPException(status_code=404, detail=f"Doctor ID {id_} not found")
            doctor.name = name
            doctor.intern_or_not = intern_or_not
            doctor.shift = shift
            doctor.work_days = work_days
            doctor.patientNb = patientNb
            doctor.availabilityTimeStart = availabilityTimeStart
            try:
                session.commit()
            except IntegrityError as e:
                session.rollback()
                raise HTTPException(status_code=400, detail=f"Invalid shift or work_days: {e.orig}")

            return {"success": True, "message": f"Doctor {id_} modified successfully",
                    "doctor": {"id": id_, "name": name, "intern_or_not": intern_or_not,
                               "work_days": work_days, "shift": shift,
                               "patientNb": patientNb, "availabilityTimeStart": availabilityTimeStart}}

    def toggle_absent(self, id_: int):
        with SessionLocal() as session:
            doctor = session.query(Doctor).filter(Doctor.id == id_).first()
            if doctor is None:
                raise HTTPException(status_code=404, detail=f"Doctor ID {id_} not found")
            current = str(doctor.absent or "False").strip().lower() in ("true", "1", "yes")
            doctor.absent = str(not current)
            session.commit()
            return {"success": True, "id": id_, "absent": not current}

    def update_patient_count(self, doctor_id: int, delta: int):
        with SessionLocal() as session:
            doctor = session.query(Doctor).filter(Doctor.id == doctor_id).first()
            if doctor is None:
                return
            raw = doctor.patientNb
            try:
                current = int(float(raw)) if raw is not None and str(raw).strip() not in ("", "nan", "None") else 0
            except (ValueError, TypeError):
                current = 0
            new_count = max(0, current + delta)
            doctor.patientNb = str(new_count) if new_count > 0 else ""
            doctor.availabilityTimeStart = (
                datetime.now().strftime("%Y-%m-%dT%H:%M") if new_count == 0 else ""
            )
            session.commit()

    def delete(self, id_):
        with SessionLocal() as session:
            doctor = session.query(Doctor).filter(Doctor.id == id_).first()
            if doctor is None:
                raise HTTPException(status_code=404, detail=f"Doctor ID {id_} not found")
            # Archive the doctor's identity permanently before removing anything,
            # so historical statistics keep working after this delete.
            session.add(DoctorLog(
                doctor_id=doctor.id, name=doctor.name, intern_or_not=doctor.intern_or_not,
                shift=doctor.shift, work_days=doctor.work_days, patientNb=doctor.patientNb,
                availabilityTimeStart=doctor.availabilityTimeStart, absent=doctor.absent,
                archived_at=datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            ))
            session.commit()

        # Archive every patient<->doctor link this doctor still has, THEN clear
        # patient_doctor/ward_doctor — both FK-reference Doctors.id, so they must
        # be cleared before the Doctors row itself is deleted below, or SQL
        # Server rejects the delete with a FK constraint violation.
        archive_doctor_links(id_)
        rel = RelationsManager()
        rel.delete_by_right("patient_doctor", id_)
        rel.delete_by_right("ward_doctor",    id_)

        with SessionLocal() as session:
            doctor = session.query(Doctor).filter(Doctor.id == id_).first()
            session.delete(doctor)
            session.commit()
        return {"success": True, "message": f"Doctor {id_} deleted successfully"}

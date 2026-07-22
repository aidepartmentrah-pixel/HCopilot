# =============================================================================
# staff_management/nurses_manager.py — Nurses SQL Server Manager
# =============================================================================
#
# Handles all CRUD operations for nurse records stored in the Nurses table.
# Mirrors DoctorsManager but uses role/group fields instead of intern_or_not/work_days.
#
# KEY BEHAVIOURS (unchanged from the CSV-era implementation):
#   update_patient_count — increments or decrements the patientNB counter for a
#                          specific nurse. When the count drops to 0, the field
#                          availabilityTimeStart is stamped with the current time
#                          so the scheduler can give priority to the nurse who
#                          has been idle the longest (fairness-based scheduling).
#   Relations cleanup    — delete() removes the nurse row and also removes all
#                          rows from patient_nurse and ward_nurse via
#                          RelationsManager so no orphaned references remain.
#
# shift / group now carry a real FK to Shifts.name / Groups.name (see
# db/models.py) — an invalid shift or group name is rejected with a clean 400
# instead of being silently stored, which the CSV version allowed.
# =============================================================================

from datetime import datetime
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from db.session import SessionLocal
from db.models import Nurse, NurseLog
from features.relations.relations_manager import RelationsManager
from features.staff_logs.link_archiver import archive_nurse_links

VALID_ROLES = ["PN", "RN", "Bed_Admission"]


class NursesManager:
    def _row(self, nurse: Nurse) -> dict:
        absent = str(nurse.absent or "False").strip().lower() in ("true", "1", "yes")
        return {
            "id":                    nurse.id,
            "name":                  nurse.name,
            "role":                  nurse.role,
            "shift":                 nurse.shift,
            "group":                 nurse.group.strip() if nurse.group is not None else None,
            "absent":                absent,
            "patientNB":             nurse.patientNB,
            "availabilityTimeStart": nurse.availabilityTimeStart,
        }

    def get_all(self):
        with SessionLocal() as session:
            nurses = session.query(Nurse).all()
            return {"nurses": [self._row(n) for n in nurses], "total": len(nurses)}

    def get_stats(self):
        with SessionLocal() as session:
            nurses = session.query(Nurse).all()
            return {
                "total":         len(nurses),
                "pn":            sum(1 for n in nurses if n.role == "PN"),
                "rn":            sum(1 for n in nurses if n.role == "RN"),
                "bed_admission": sum(1 for n in nurses if n.role == "Bed_Admission"),
                "morning":       sum(1 for n in nurses if n.shift == "morning"),
                "night":         sum(1 for n in nurses if n.shift == "night"),
                "group1":        sum(1 for n in nurses if (n.group or "").strip() == "Group 1"),
                "group2":        sum(1 for n in nurses if (n.group or "").strip() == "Group 2"),
            }

    def add(self, role, shift, group, patientNB=None, availabilityTimeStart=None, name=None):
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role must be one of {VALID_ROLES}")
        with SessionLocal() as session:
            max_id = session.query(Nurse.id).order_by(Nurse.id.desc()).first()
            new_id = (max_id[0] + 1) if max_id else 1
            nurse = Nurse(
                id=new_id, name=name, role=role, shift=shift, group=group,
                absent="False", patientNB=patientNB, availabilityTimeStart=availabilityTimeStart,
            )
            session.add(nurse)
            try:
                session.commit()
            except IntegrityError as e:
                session.rollback()
                raise HTTPException(status_code=400, detail=f"Invalid shift or group: {e.orig}")

            return {"success": True, "message": "Nurse added successfully",
                    "nurse": {"id": new_id, "name": name, "role": role, "shift": shift,
                              "group": group, "absent": False,
                              "patientNB": patientNB, "availabilityTimeStart": availabilityTimeStart}}

    def modify(self, id_, role, shift, group, patientNB=None, availabilityTimeStart=None, name=None):
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role must be one of {VALID_ROLES}")
        with SessionLocal() as session:
            nurse = session.query(Nurse).filter(Nurse.id == id_).first()
            if nurse is None:
                raise HTTPException(status_code=404, detail=f"Nurse ID {id_} not found")
            nurse.name = name
            nurse.role = role
            nurse.shift = shift
            nurse.group = group
            nurse.patientNB = patientNB
            nurse.availabilityTimeStart = availabilityTimeStart
            try:
                session.commit()
            except IntegrityError as e:
                session.rollback()
                raise HTTPException(status_code=400, detail=f"Invalid shift or group: {e.orig}")

            return {"success": True, "message": f"Nurse {id_} modified successfully",
                    "nurse": {"id": id_, "name": name, "role": role, "shift": shift,
                              "group": group, "patientNB": patientNB,
                              "availabilityTimeStart": availabilityTimeStart}}

    def toggle_absent(self, id_: int):
        with SessionLocal() as session:
            nurse = session.query(Nurse).filter(Nurse.id == id_).first()
            if nurse is None:
                raise HTTPException(status_code=404, detail=f"Nurse ID {id_} not found")
            current = str(nurse.absent or "False").strip().lower() in ("true", "1", "yes")
            nurse.absent = str(not current)
            session.commit()
            return {"success": True, "id": id_, "absent": not current}

    def update_patient_count(self, nurse_id: int, delta: int):
        with SessionLocal() as session:
            nurse = session.query(Nurse).filter(Nurse.id == nurse_id).first()
            if nurse is None:
                return
            raw = nurse.patientNB
            try:
                current = int(float(raw)) if raw is not None and str(raw).strip() not in ("", "nan", "None") else 0
            except (ValueError, TypeError):
                current = 0
            new_count = max(0, current + delta)
            nurse.patientNB = str(new_count) if new_count > 0 else ""
            nurse.availabilityTimeStart = (
                datetime.now().strftime("%Y-%m-%dT%H:%M") if new_count == 0 else ""
            )
            session.commit()

    def delete(self, id_):
        with SessionLocal() as session:
            nurse = session.query(Nurse).filter(Nurse.id == id_).first()
            if nurse is None:
                raise HTTPException(status_code=404, detail=f"Nurse ID {id_} not found")
            # Archive the nurse's identity permanently before removing anything,
            # so historical statistics keep working after this delete.
            session.add(NurseLog(
                nurse_id=nurse.id, name=nurse.name, role=nurse.role,
                shift=nurse.shift, group=nurse.group, patientNB=nurse.patientNB,
                availabilityTimeStart=nurse.availabilityTimeStart, absent=nurse.absent,
                archived_at=datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            ))
            session.commit()

        # Archive every patient<->nurse link this nurse still has, THEN clear
        # patient_nurse/ward_nurse — both FK-reference Nurses.id, so they must
        # be cleared before the Nurses row itself is deleted below, or SQL
        # Server rejects the delete with a FK constraint violation.
        archive_nurse_links(id_)
        rel = RelationsManager()
        rel.delete_by_right("patient_nurse", id_)
        rel.delete_by_right("ward_nurse",    id_)

        with SessionLocal() as session:
            nurse = session.query(Nurse).filter(Nurse.id == id_).first()
            session.delete(nurse)
            session.commit()
        return {"success": True, "message": f"Nurse {id_} deleted successfully"}

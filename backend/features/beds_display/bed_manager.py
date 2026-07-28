# =============================================================================
# beds_display/bed_manager.py — Bed State SQL Server Manager
# =============================================================================
#
# Manages the full lifecycle of hospital beds across three SQL Server tables:
#
#   EDbeds     — master bed registry (bed_id, bed_number, bed_status, type)
#   ward_bed   — many-to-one relation: each bed_id maps to a ward_id
#   patient_bed — runtime occupancy: which patient currently occupies which bed
#
# Additional read-only source:
#   DailyPatients (ORM) — patient demographics/acuity for display and the
#                         chariot cleanup heuristic. patient_bed.patient_id
#                         still has no FK to it (see db/models.py), but both
#                         tables are ORM-backed now so reads stay consistent.
#
# KEY DESIGN DECISION — "Occupied" is computed, never stored:
#   The on-disk bed_status column only ever holds "Available" or
#   "Under Repair" (also enforced by a CHECK constraint now). Whether a bed is
#   currently occupied is derived at read-time by checking patient_bed for a
#   matching bed_id row.
#
# CHARIOT BED LIFECYCLE:
#   "chariot" is a temporary overflow bed type auto-created by the OR scheduler
#   when a critical (acuity 1/2) patient needs an ICU-equivalent bed but every
#   real ICU bed is already occupied. Chariot beds exist only as long as they
#   are needed; the manager auto-deletes them once the need is resolved.
#   See create_chariot_bed() and cleanup_chariot_if_unneeded() below.
# =============================================================================

from fastapi import HTTPException

from db.session import SessionLocal
from db.models import EDBed, WardBed, PatientBed, Ward, DailyPatient

_VALID_CONDITIONS = ("Available", "Under Repair")
_VALID_TYPES  = ("normal", "monitor", "ICU", "chariot")
_DEFAULT_TYPE = "normal"


def _bed_type(raw) -> str:
    v = str(raw).strip()
    return v if v in _VALID_TYPES else _DEFAULT_TYPE


def _condition(raw) -> str:
    return "Under Repair" if str(raw).strip() == "Under Repair" else "Available"


def _display_status(condition: str, patient_id) -> str:
    if condition == "Under Repair":
        return "Under Repair"
    return "Occupied" if patient_id is not None else "Available"


class BedManager:
    """
    Manages all bed-related SQL Server operations for the HCopilot application.

    Key invariants:
      - EDbeds never contains "Occupied" in bed_status; that value is derived
        at read-time from patient_bed.
      - A patient may occupy at most one bed at a time (enforced by
        check_patient_has_no_bed before every assignment).
      - A bed may hold at most one patient at a time (enforced by
        check_bed_available before every assignment).
      - chariot-type beds are auto-created and auto-deleted by the OR scheduler;
        they should not be created manually through the regular add_bed endpoint.
    """

    def _require_bed(self, session, bed_id):
        bed = session.query(EDBed).filter(EDBed.bed_id == bed_id).first()
        if bed is None:
            raise HTTPException(status_code=404, detail=f"Bed {bed_id} not found")
        return bed

    def _ward_name_lookup(self, session) -> dict:
        return {w.ward_id: w.ward_name for w in session.query(Ward).all()}

    def _patient_info_lookup(self, session) -> dict:
        # Build a dict {subject_id: {name, gender, age}} from DailyPatients for display
        return {
            p.subject_id: {"name": p.name, "gender": p.gender, "age": p.age}
            for p in session.query(DailyPatient).all()
        }

    # ── Public API ─────────────────────────────────────────────────────────────

    def get_all_beds(self):
        with SessionLocal() as session:
            beds_rows = session.query(EDBed).all()
            ward_by_bed = {wb.bed_id: wb.ward_id for wb in session.query(WardBed).all()}
            patient_by_bed = {pb.bed_id: pb.patient_id for pb in session.query(PatientBed).all()}
            ward_names = self._ward_name_lookup(session)
            pat_info = self._patient_info_lookup(session)

            beds = []
            for bed in beds_rows:
                cond = _condition(bed.bed_status)
                patient_id = patient_by_bed.get(bed.bed_id)
                info = pat_info.get(patient_id, {}) if patient_id is not None else {}
                ward_id = ward_by_bed.get(bed.bed_id)
                beds.append({
                    "bed_id":          bed.bed_id,
                    "bed_number":      str(bed.bed_number),
                    "bed_condition":   cond,
                    "bed_status":      _display_status(cond, patient_id),
                    "bed_type":        _bed_type(bed.type),
                    "ward_id":         ward_id,
                    "ward_name":       ward_names.get(ward_id) if ward_id is not None else None,
                    "patient_id":      patient_id,
                    "patient_name":    info.get("name"),
                    "patient_gender":  info.get("gender"),
                    "patient_age":     info.get("age"),
                })

            occupied     = sum(1 for b in beds if b["bed_status"] == "Occupied")
            available    = sum(1 for b in beds if b["bed_status"] == "Available")
            under_repair = sum(1 for b in beds if b["bed_status"] == "Under Repair")
            ward_counts, type_counts = {}, {}
            for b in beds:
                if b["ward_id"] is not None:
                    ward_counts[b["ward_id"]] = ward_counts.get(b["ward_id"], 0) + 1
                type_counts[b["bed_type"]] = type_counts.get(b["bed_type"], 0) + 1

            return {
                "beds":           beds,
                "total_beds":     len(beds),
                "status_summary": {"Occupied": occupied, "Available": available, "Under Repair": under_repair},
                "ward_summary":   ward_counts,
                "type_summary":   type_counts,
            }

    def get_stats(self):
        with SessionLocal() as session:
            beds_rows = session.query(EDBed).all()
            total_beds = len(beds_rows)
            under_repair = sum(1 for b in beds_rows if _condition(b.bed_status) == "Under Repair")
            usable = total_beds - under_repair
            occupied_bed_ids = {pb.bed_id for pb in session.query(PatientBed).all()}
            occupied = min(len(occupied_bed_ids), usable)
            available = usable - occupied
            type_summary = {}
            for b in beds_rows:
                t = _bed_type(b.type)
                type_summary[t] = type_summary.get(t, 0) + 1
            total_wards = session.query(WardBed.ward_id).distinct().count()

            return {
                "total_beds":     total_beds,
                "occupied":       occupied,
                "available":      available,
                "under_repair":   under_repair,
                "occupancy_rate": round(occupied / usable * 100, 1) if usable else 0,
                "total_wards":    total_wards,
                "type_summary":   type_summary,
            }

    def update_condition(self, bed_id, new_condition):
        if new_condition not in _VALID_CONDITIONS:
            raise HTTPException(status_code=400, detail=f"Condition must be one of {_VALID_CONDITIONS}")
        with SessionLocal() as session:
            bed = self._require_bed(session, bed_id)
            bed.bed_status = new_condition
            session.commit()
            return {"success": True, "message": f"Bed {bed_id} marked as '{new_condition}'"}

    def check_patient_has_no_bed(self, patient_id):
        with SessionLocal() as session:
            existing = session.query(PatientBed).filter(PatientBed.patient_id == patient_id).first()
            if existing is not None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Patient {patient_id} is already assigned to bed {existing.bed_id}"
                )

    def check_bed_available(self, bed_id):
        with SessionLocal() as session:
            bed = self._require_bed(session, bed_id)
            if _condition(bed.bed_status) == "Under Repair":
                raise HTTPException(status_code=400, detail=f"Bed {bed_id} is under repair and cannot be assigned")
            occupant = session.query(PatientBed).filter(PatientBed.bed_id == bed_id).first()
            if occupant is not None:
                raise HTTPException(status_code=400, detail=f"Bed {bed_id} is already occupied by another patient")

    def move_patient(self, patient_id, new_bed_id):
        with SessionLocal() as session:
            link = session.query(PatientBed).filter(PatientBed.patient_id == patient_id).first()
            if link is None:
                raise HTTPException(status_code=400, detail=f"Patient {patient_id} is not currently assigned to any bed")
            old_bed_id = link.bed_id
            if old_bed_id == new_bed_id:
                raise HTTPException(status_code=400, detail=f"Patient {patient_id} is already in bed {new_bed_id}")

        self.check_bed_available(new_bed_id)

        with SessionLocal() as session:
            session.query(PatientBed).filter(PatientBed.patient_id == patient_id).delete(synchronize_session=False)
            session.add(PatientBed(patient_id=patient_id, bed_id=new_bed_id))
            session.commit()
        self.add_bed_to_history(patient_id, new_bed_id)
        self.cleanup_chariot_if_unneeded(old_bed_id)
        return {
            "success": True,
            "message": f"Patient {patient_id} moved from bed {old_bed_id} to bed {new_bed_id}",
            "old_bed_id": old_bed_id,
            "new_bed_id": new_bed_id,
        }

    def add_bed_to_history(self, patient_id, bed_id):
        """
        Append a bed's display number to the patient's bed_history trail, and
        — the first time this is called for a stay — record the ward of that
        first bed as the stay's admission_ward (used to attribute a same-day
        discharge to a ward for the daily census; see features/ward_census).

        Called on every assignment and move (from this class and from
        scheduling/api.py and simulation/api.py, which link patient_bed
        directly rather than through assign_patient/move_patient) so
        bed_history accumulates a chronological, comma-separated record of
        every bed_number occupied during the current stay. Carried into
        LogPatients verbatim when the stay is archived on discharge.
        """
        with SessionLocal() as session:
            bed = session.query(EDBed).filter(EDBed.bed_id == bed_id).first()
            if bed is None:
                return
            patient = session.query(DailyPatient).filter(DailyPatient.subject_id == patient_id).first()
            if patient is None:
                return
            existing = (patient.bed_history or "").strip()
            first_bed = not existing
            patient.bed_history = f"{existing}, {bed.bed_number}" if existing else str(bed.bed_number)
            if first_bed:
                ward_bed = session.query(WardBed).filter(WardBed.bed_id == bed_id).first()
                ward = session.query(Ward).filter(Ward.ward_id == ward_bed.ward_id).first() if ward_bed else None
                if ward is not None:
                    patient.admission_ward_id = ward.ward_id
                    patient.admission_ward_name = ward.ward_name
            session.commit()

    def release_bed(self, bed_id):
        with SessionLocal() as session:
            link = session.query(PatientBed).filter(PatientBed.bed_id == bed_id).first()
            if link is None:
                raise HTTPException(status_code=400, detail=f"Bed {bed_id} has no assigned patient")
            session.delete(link)
            session.commit()
        self.cleanup_chariot_if_unneeded(bed_id)
        return {"success": True, "message": f"Patient released from bed {bed_id}"}

    def create_chariot_bed(self, ward_id=None):
        with SessionLocal() as session:
            max_id = session.query(EDBed.bed_id).order_by(EDBed.bed_id.desc()).first()
            new_id = (max_id[0] + 1) if max_id else 1
            bed_number = f"CHARIOT-{new_id}"
            session.add(EDBed(bed_id=new_id, bed_number=bed_number, bed_status="Available", type="chariot"))
            if ward_id is not None:
                session.add(WardBed(ward_id=ward_id, bed_id=new_id))
            session.commit()
            return {
                "bed_id": new_id, "bed_number": bed_number, "bed_type": "chariot",
                "bed_status": "Available", "ward_id": ward_id, "patient_id": None,
            }

    def cleanup_chariot_if_unneeded(self, bed_id):
        # Called after a patient is discharged/released from a bed. If the freed bed
        # is a temporary "chariot" bed, delete it UNLESS at least one critical
        # (acuity 1/2, or null) patient is currently waiting AND there isn't already
        # enough ICU/chariot capacity (excluding this bed) to cover all of them.
        # A free "normal" or "monitor" bed does NOT count.
        with SessionLocal() as session:
            bed = session.query(EDBed).filter(EDBed.bed_id == bed_id).first()
            if bed is None or _bed_type(bed.type) != "chariot":
                return

            occupied_bed_ids = {pb.bed_id for pb in session.query(PatientBed).all()}
            if bed_id in occupied_bed_ids:
                return  # still occupied somehow — leave it alone

            all_patients = session.query(DailyPatient).all()
            if not all_patients:
                self.delete_bed(bed_id)
                return
            assigned_patient_ids = {pb.patient_id for pb in session.query(PatientBed).all()}
            waiting = [p for p in all_patients if p.subject_id not in assigned_patient_ids]

            def _is_lane12(v):
                if v is None:
                    return True
                try:
                    return int(float(v)) in (1, 2)
                except (TypeError, ValueError):
                    return False

            n_waiting_critical = sum(1 for p in waiting if _is_lane12(p.acuity))

            if n_waiting_critical == 0:
                self.delete_bed(bed_id)
                return

            others = session.query(EDBed).filter(
                EDBed.bed_id != bed_id, EDBed.bed_status != "Under Repair",
            ).all()
            others_free = [b for b in others if b.bed_id not in occupied_bed_ids]
            coverage = [b for b in others_free if _bed_type(b.type) in ("ICU", "chariot")]

            if n_waiting_critical > len(coverage):
                return  # still needed

            self.delete_bed(bed_id)

    def assign_patient(self, bed_id, patient_id, bed_occupation_time=None):
        with SessionLocal() as session:
            bed = self._require_bed(session, bed_id)
            if _condition(bed.bed_status) == "Under Repair":
                raise HTTPException(status_code=400, detail=f"Bed {bed_id} is under repair and cannot be assigned")

        self.check_patient_has_no_bed(patient_id)

        with SessionLocal() as session:
            patient = session.query(DailyPatient).filter(DailyPatient.subject_id == patient_id).first()
            if patient is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Patient {patient_id} does not exist in the daily patient database"
                )

            session.query(PatientBed).filter(PatientBed.bed_id == bed_id).delete(synchronize_session=False)
            session.add(PatientBed(patient_id=patient_id, bed_id=bed_id))

            if bed_occupation_time:
                patient.bed_occupation_time = bed_occupation_time

            session.commit()

        self.add_bed_to_history(patient_id, bed_id)
        return {"success": True, "message": f"Patient {patient_id} assigned to bed {bed_id}"}

    def add_bed(self, bed_number, ward_id=None, bed_type=None):
        with SessionLocal() as session:
            existing = session.query(EDBed).filter(EDBed.bed_number == bed_number).first()
            if existing is not None:
                raise HTTPException(status_code=400, detail=f"Bed number '{bed_number}' already exists")
            max_id = session.query(EDBed.bed_id).order_by(EDBed.bed_id.desc()).first()
            new_id = (max_id[0] + 1) if max_id else 1
            btype = _bed_type(bed_type) if bed_type else _DEFAULT_TYPE
            session.add(EDBed(bed_id=new_id, bed_number=bed_number, bed_status="Available", type=btype))
            if ward_id is not None:
                session.add(WardBed(ward_id=ward_id, bed_id=new_id))
            session.commit()
            return {
                "success": True,
                "message": f"Bed '{bed_number}' added successfully",
                "bed": {"bed_id": new_id, "bed_number": bed_number, "bed_condition": "Available",
                        "bed_status": "Available", "bed_type": btype, "ward_id": ward_id, "patient_id": None},
            }

    def modify_bed(self, bed_id, bed_number, ward_id=None, bed_type=None):
        with SessionLocal() as session:
            bed = self._require_bed(session, bed_id)
            conflict = session.query(EDBed).filter(
                EDBed.bed_number == bed_number, EDBed.bed_id != bed_id,
            ).first()
            if conflict is not None:
                raise HTTPException(status_code=400, detail=f"Bed number '{bed_number}' already exists")
            bed.bed_number = bed_number
            if bed_type is not None:
                bed.type = _bed_type(bed_type)
            session.query(WardBed).filter(WardBed.bed_id == bed_id).delete(synchronize_session=False)
            if ward_id is not None:
                session.add(WardBed(ward_id=ward_id, bed_id=bed_id))
            session.commit()

            link = session.query(PatientBed).filter(PatientBed.bed_id == bed_id).first()
            patient_id = link.patient_id if link is not None else None
            cond = _condition(bed.bed_status)
            return {
                "success": True,
                "message": f"Bed {bed_id} modified successfully",
                "bed": {
                    "bed_id": bed_id, "bed_number": bed_number,
                    "bed_condition": cond, "bed_status": _display_status(cond, patient_id),
                    "bed_type": _bed_type(bed.type),
                    "ward_id": ward_id, "patient_id": patient_id,
                },
            }

    def delete_bed(self, bed_id):
        with SessionLocal() as session:
            bed = self._require_bed(session, bed_id)
            bed_number = str(bed.bed_number)
            session.delete(bed)
            session.query(WardBed).filter(WardBed.bed_id == bed_id).delete(synchronize_session=False)
            session.query(PatientBed).filter(PatientBed.bed_id == bed_id).delete(synchronize_session=False)
            session.commit()
            return {"success": True, "message": f"Bed '{bed_number}' deleted successfully"}

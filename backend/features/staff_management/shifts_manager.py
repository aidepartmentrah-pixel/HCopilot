# =============================================================================
# staff_management/shifts_manager.py — Shift Definitions SQL Server Manager
# =============================================================================
#
# Manages named shift windows stored in the Shifts table. A shift is a named
# time window (e.g. "morning": 07:00-19:00, "night": 19:00-07:00) that
# controls which doctors and nurses are on duty at any given hour.
#
# If the table is empty on first run, two default shifts are created:
#   - morning : 07:00 -> 19:00
#   - night   : 19:00 -> 07:00
#
# Midnight-crossing shifts (end_hour < start_hour) are handled correctly in
# active_shift_name() by checking (h >= start OR h < end) instead of the usual
# range comparison — this is the key edge case in the scheduling logic.
#
# Renaming a shift (modify()) no longer needs to manually update Doctors.shift
# / Nurses.shift — the FK constraint on those columns is declared with
# onupdate=CASCADE (see db/models.py), so SQL Server propagates the rename
# automatically in the same statement.
# =============================================================================

from datetime import datetime
from fastapi import HTTPException

from db.session import SessionLocal
from db.models import Shift

DEFAULT_SHIFTS = [
    {"shift_id": 1, "name": "morning", "start_hour": 7, "end_hour": 19},
    {"shift_id": 2, "name": "night", "start_hour": 19, "end_hour": 7},
]


class ShiftsManager:
    """
    Manages shift-definition records for HCopilot's scheduling system.

    Key invariants:
      - Default shifts (morning / night) are auto-created if the table is empty.
      - A shift whose end_hour < start_hour crosses midnight; the active-shift
        logic handles this with an OR condition (h >= start OR h < end).
      - The OR scheduler reads the current shift via active_shift_name() to filter
        which doctors and nurses are considered on duty.
    """

    def __init__(self):
        with SessionLocal() as session:
            if session.query(Shift).first() is None:
                for s in DEFAULT_SHIFTS:
                    session.add(Shift(**s))
                session.commit()

    def _row(self, shift: Shift) -> dict:
        return {
            "shift_id":   shift.shift_id,
            "name":       (shift.name or "").strip(),
            "start_hour": shift.start_hour,
            "end_hour":   shift.end_hour,
        }

    def get_all(self):
        with SessionLocal() as session:
            shifts = session.query(Shift).all()
            return {"shifts": [self._row(s) for s in shifts]}

    def add(self, name: str, start_hour: int, end_hour: int):
        name = name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        with SessionLocal() as session:
            if session.query(Shift).filter(Shift.name.ilike(name)).first() is not None:
                raise HTTPException(status_code=409, detail=f"A shift named '{name}' already exists")
            max_id = session.query(Shift.shift_id).order_by(Shift.shift_id.desc()).first()
            new_id = (max_id[0] + 1) if max_id else 1
            session.add(Shift(shift_id=new_id, name=name, start_hour=start_hour, end_hour=end_hour))
            session.commit()
            return {"success": True, "message": f"Shift '{name}' added", "shift_id": new_id}

    def modify(self, shift_id: int, name: str, start_hour: int, end_hour: int, new_shift_id: int = None):
        name = name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        with SessionLocal() as session:
            shift = session.query(Shift).filter(Shift.shift_id == shift_id).first()
            if shift is None:
                raise HTTPException(status_code=404, detail=f"Shift {shift_id} not found")
            current_name = (shift.name or "").strip()

            if new_shift_id is not None and new_shift_id != shift_id:
                if session.query(Shift).filter(Shift.shift_id == new_shift_id).first() is not None:
                    raise HTTPException(status_code=409, detail=f"Shift ID {new_shift_id} is already in use")
                shift.shift_id = new_shift_id
                shift_id = new_shift_id

            if name.lower() != current_name.lower():
                conflict = session.query(Shift).filter(
                    Shift.shift_id != shift_id, Shift.name.ilike(name),
                ).first()
                if conflict is not None:
                    raise HTTPException(status_code=409, detail=f"A shift named '{name}' already exists")

            shift.name = name
            shift.start_hour = start_hour
            shift.end_hour = end_hour
            session.commit()
            return {"success": True, "message": f"Shift '{name}' updated"}

    def delete(self, shift_id: int):
        with SessionLocal() as session:
            shift = session.query(Shift).filter(Shift.shift_id == shift_id).first()
            if shift is None:
                raise HTTPException(status_code=404, detail=f"Shift {shift_id} not found")
            session.delete(shift)
            session.commit()
            return {"success": True, "message": f"Shift {shift_id} deleted"}

    @staticmethod
    def active_shift_name() -> str:
        """Return the name of whichever shift covers the current hour (first match wins)."""
        with SessionLocal() as session:
            shifts = session.query(Shift).all()
            if not shifts:
                return "morning"
            h = datetime.now().hour
            for shift in shifts:
                s, e = shift.start_hour, shift.end_hour
                if s <= e:
                    if s <= h < e:
                        return (shift.name or "").strip()
                else:
                    if h >= s or h < e:
                        return (shift.name or "").strip()
            return (shifts[0].name or "").strip()

# =============================================================================
# staff_management/groups_manager.py — Rotation Group Definitions SQL Server Manager
# =============================================================================
#
# Manages staff rotation group records stored in the Groups table. A rotation
# group defines which weekdays a set of doctors/nurses are on duty (e.g.
# Group 1 works Mon-Thu, Group 2 works Fri-Sun).
#
# days is a comma-separated string of weekday integers (0=Monday ... 6=Sunday).
#
# If the table is empty on first run, two default groups are created:
#   - Group 1 : days "0,1,2,3" (Monday-Thursday)
#   - Group 2 : days "4,5,6"   (Friday-Sunday)
#
# Renaming a group (modify()) no longer needs to manually update
# Doctors.work_days / Nurses.group — the FK constraint on those columns is
# declared with onupdate=CASCADE (see db/models.py), so SQL Server propagates
# the rename automatically in the same statement.
# =============================================================================

from datetime import datetime
from fastapi import HTTPException

from db.session import SessionLocal
from db.models import Group

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

DEFAULT_GROUPS = [
    {"group_id": 1, "name": "Group 1", "days": "0,1,2,3"},
    {"group_id": 2, "name": "Group 2", "days": "4,5,6"},
]


class GroupsManager:
    """
    Manages rotation group records for HCopilot's scheduling system.

    Key invariants:
      - Default groups (Group 1 Mon-Thu / Group 2 Fri-Sun) are auto-created if the
        table is empty, matching the default staff assignments.
      - days is stored as a comma-separated string so that groups can cover any
        combination of weekdays without a fixed-width integer encoding.
      - _row() expands days to human-readable day names (day_names list)
        for display in the settings panel.
    """

    def __init__(self):
        with SessionLocal() as session:
            if session.query(Group).first() is None:
                for g in DEFAULT_GROUPS:
                    session.add(Group(**g))
                session.commit()

    def _parse_days(self, days_str: str) -> "list[int]":
        return [int(d.strip()) for d in str(days_str).split(",") if d.strip().isdigit()]

    def _row(self, group: Group) -> dict:
        day_nums = self._parse_days(group.days or "")
        return {
            "group_id":  group.group_id,
            "name":      (group.name or "").strip(),
            "days":      (group.days or "").strip(),
            "day_names": [DAY_NAMES[d] for d in day_nums if 0 <= d <= 6],
        }

    def get_all(self):
        with SessionLocal() as session:
            groups = session.query(Group).all()
            return {"groups": [self._row(g) for g in groups], "day_names": DAY_NAMES}

    def add(self, name: str, days: str):
        name = name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        with SessionLocal() as session:
            if session.query(Group).filter(Group.name.ilike(name)).first() is not None:
                raise HTTPException(status_code=409, detail=f"A group named '{name}' already exists")
            max_id = session.query(Group.group_id).order_by(Group.group_id.desc()).first()
            new_id = (max_id[0] + 1) if max_id else 1
            session.add(Group(group_id=new_id, name=name, days=days))
            session.commit()
            return {"success": True, "message": f"Group '{name}' added", "group_id": new_id}

    def modify(self, group_id: int, name: str, days: str, new_group_id: int = None):
        name = name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        with SessionLocal() as session:
            group = session.query(Group).filter(Group.group_id == group_id).first()
            if group is None:
                raise HTTPException(status_code=404, detail=f"Group {group_id} not found")
            current_name = (group.name or "").strip()

            if new_group_id is not None and new_group_id != group_id:
                if session.query(Group).filter(Group.group_id == new_group_id).first() is not None:
                    raise HTTPException(status_code=409, detail=f"Group ID {new_group_id} is already in use")
                group.group_id = new_group_id
                group_id = new_group_id

            if name.lower() != current_name.lower():
                conflict = session.query(Group).filter(
                    Group.group_id != group_id, Group.name.ilike(name),
                ).first()
                if conflict is not None:
                    raise HTTPException(status_code=409, detail=f"A group named '{name}' already exists")

            group.name = name
            group.days = days
            session.commit()
            return {"success": True, "message": f"Group '{name}' updated"}

    def delete(self, group_id: int):
        with SessionLocal() as session:
            group = session.query(Group).filter(Group.group_id == group_id).first()
            if group is None:
                raise HTTPException(status_code=404, detail=f"Group {group_id} not found")
            session.delete(group)
            session.commit()
            return {"success": True, "message": f"Group {group_id} deleted"}

    @staticmethod
    def active_group_id() -> int:
        """Return the group_id whose days include today's weekday (first match wins)."""
        with SessionLocal() as session:
            groups = session.query(Group).all()
            if not groups:
                return 1
            dow = datetime.now().weekday()
            for group in groups:
                day_nums = [int(d.strip()) for d in str(group.days).split(",") if d.strip().isdigit()]
                if dow in day_nums:
                    return group.group_id
            return groups[0].group_id

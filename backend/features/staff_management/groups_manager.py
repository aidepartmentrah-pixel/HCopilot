# =============================================================================
# staff_management/groups_manager.py — Rotation Group Definitions CSV Manager
# =============================================================================
#
# Manages staff rotation group records stored in Groups.csv.  A rotation group
# defines which weekdays a set of doctors/nurses are on duty (e.g. Group 1 works
# Mon–Thu, Group 2 works Fri–Sun).
#
# CSV file managed:
#   Groups.csv — columns: group_id, name, days
#     days is a comma-separated string of weekday integers (0=Monday … 6=Sunday).
#
# If the CSV does not exist on first run, two default groups are created:
#   - Group 1 : days "0,1,2,3" (Monday–Thursday)
#   - Group 2 : days "4,5,6"   (Friday–Sunday)
#
# The active_group_id() static method returns the group whose days include
# today's weekday.  It is called by the OR scheduler to determine which staff
# members are currently on rotation.
# =============================================================================

import pandas as pd
import os
from fastapi import HTTPException
from datetime import datetime

GROUPS_FILE   = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "Groups.csv")
_DOCTORS_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "Doctors.csv")
_NURSES_FILE  = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "Nurses.csv")

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Group 1 → Mon-Thu (0-3), Group 2 → Fri-Sun (4-6)
DEFAULT_GROUPS = [
    {"group_id": 1, "name": "Group 1", "days": "0,1,2,3"},
    {"group_id": 2, "name": "Group 2", "days": "4,5,6"},
]


class GroupsManager:
    """
    Manages rotation group records for HCopilot's scheduling system.

    CSV file managed:
      - Groups.csv : one row per rotation group, identified by an integer group_id

    Key invariants:
      - Default groups (Group 1 Mon-Thu / Group 2 Fri-Sun) are auto-created if the
        CSV is absent, matching the default staff assignments.
      - days is stored as a comma-separated string so that groups can cover any
        combination of weekdays without a fixed-width integer encoding.
      - _row_to_dict() expands days to human-readable day names (day_names list)
        for display in the settings panel.
    """

    def __init__(self):
        self.file = GROUPS_FILE
        self._ensure_defaults()

    def _ensure_defaults(self):
        # Create default Group 1 / Group 2 on first run if the CSV is absent
        if not os.path.exists(self.file):
            pd.DataFrame(DEFAULT_GROUPS).to_csv(self.file, index=False)

    def _read_df(self):
        if not os.path.exists(self.file):
            return pd.DataFrame(columns=["group_id", "name", "days"])
        return pd.read_csv(self.file, dtype={"days": str})

    def _write_df(self, df):
        df.to_csv(self.file, index=False)

    def _parse_days(self, days_str: str) -> "list[int]":
        return [int(d.strip()) for d in str(days_str).split(",") if d.strip().isdigit()]

    def _row_to_dict(self, row):
        day_nums = self._parse_days(str(row["days"]))
        return {
            "group_id":  int(row["group_id"]),
            "name":      str(row["name"]).strip(),
            "days":      str(row["days"]).strip(),
            "day_names": [DAY_NAMES[d] for d in day_nums if 0 <= d <= 6],
        }

    def get_all(self):
        df = self._read_df()
        groups = [self._row_to_dict(row) for _, row in df.iterrows()]
        return {"groups": groups, "day_names": DAY_NAMES}

    def add(self, name: str, days: str):
        name = name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        df = self._read_df()
        if df["name"].astype(str).str.strip().str.lower().eq(name.lower()).any():
            raise HTTPException(status_code=409, detail=f"A group named '{name}' already exists")
        new_id = int(df["group_id"].max()) + 1 if len(df) > 0 else 1
        new_row = pd.DataFrame([{"group_id": new_id, "name": name, "days": days}])
        df = pd.concat([df, new_row], ignore_index=True)
        self._write_df(df)
        return {"success": True, "message": f"Group '{name}' added", "group_id": new_id}

    def modify(self, group_id: int, name: str, days: str, new_group_id: int = None):
        name = name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        df = self._read_df()
        if group_id not in df["group_id"].values:
            raise HTTPException(status_code=404, detail=f"Group {group_id} not found")
        # Capture the current name before any change (staff reference groups by name)
        current_name = str(df.loc[df["group_id"] == group_id, "name"].iloc[0]).strip()
        if new_group_id is not None and new_group_id != group_id:
            if new_group_id in df["group_id"].values:
                raise HTTPException(status_code=409, detail=f"Group ID {new_group_id} is already in use")
            df.loc[df["group_id"] == group_id, "group_id"] = new_group_id
            group_id = new_group_id
        if name.lower() != current_name.lower():
            others = df[df["group_id"] != group_id]
            if others["name"].astype(str).str.strip().str.lower().eq(name.lower()).any():
                raise HTTPException(status_code=409, detail=f"A group named '{name}' already exists")
        df.loc[df["group_id"] == group_id, "name"] = name
        df.loc[df["group_id"] == group_id, "days"] = days
        self._write_df(df)
        # Cascade name change to staff records (staff store the group name, not the ID)
        if name != current_name:
            if os.path.exists(_DOCTORS_FILE):
                ddf = pd.read_csv(_DOCTORS_FILE, dtype=object)
                if "work_days" in ddf.columns:
                    ddf.loc[ddf["work_days"].astype(str).str.strip() == current_name, "work_days"] = name
                    ddf.to_csv(_DOCTORS_FILE, index=False)
            if os.path.exists(_NURSES_FILE):
                ndf = pd.read_csv(_NURSES_FILE, dtype=object)
                if "group" in ndf.columns:
                    ndf.loc[ndf["group"].astype(str).str.strip() == current_name, "group"] = name
                    ndf.to_csv(_NURSES_FILE, index=False)
        return {"success": True, "message": f"Group '{name}' updated"}

    def delete(self, group_id: int):
        df = self._read_df()
        if group_id not in df["group_id"].values:
            raise HTTPException(status_code=404, detail=f"Group {group_id} not found")
        df = df[df["group_id"] != group_id]
        self._write_df(df)
        return {"success": True, "message": f"Group {group_id} deleted"}

    @staticmethod
    def active_group_id() -> int:
        """Return the group_id whose days include today's weekday (first match wins)."""
        if not os.path.exists(GROUPS_FILE):
            return 1
        try:
            df = pd.read_csv(GROUPS_FILE, dtype={"days": str})
        except Exception:
            return 1
        dow = datetime.now().weekday()   # 0=Monday, 6=Sunday
        for _, row in df.iterrows():
            day_nums = [int(d.strip()) for d in str(row["days"]).split(",") if d.strip().isdigit()]
            if dow in day_nums:
                return int(row["group_id"])
        return int(df.iloc[0]["group_id"]) if len(df) > 0 else 1

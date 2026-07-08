# =============================================================================
# staff_management/shifts_manager.py — Shift Definitions CSV Manager
# =============================================================================
#
# Manages named shift windows stored in Shifts.csv.  A shift is a named time
# window (e.g. "morning": 07:00–19:00, "night": 19:00–07:00) that controls
# which doctors and nurses are on duty at any given hour.
#
# CSV file managed:
#   Shifts.csv — columns: shift_id, name, start_hour, end_hour
#
# If the CSV does not exist on first run, two default shifts are created:
#   - morning : 07:00 → 19:00
#   - night   : 19:00 → 07:00
#
# Midnight-crossing shifts (end_hour < start_hour) are handled correctly in
# active_shift_name() by checking (h >= start OR h < end) instead of the usual
# range comparison — this is the key edge case in the scheduling logic.
# =============================================================================

import pandas as pd
import os
from fastapi import HTTPException

_DOCTORS_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "Doctors.csv")
_NURSES_FILE  = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "Nurses.csv")

SHIFTS_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "datasets", "Shifts.csv")

DEFAULT_SHIFTS = [
    {"shift_id": 1, "name": "morning", "start_hour": 7,  "end_hour": 19},
    {"shift_id": 2, "name": "night",   "start_hour": 19, "end_hour": 7},
]


class ShiftsManager:
    """
    Manages shift-definition records for HCopilot's scheduling system.

    CSV file managed:
      - Shifts.csv : one row per named shift, identified by an integer shift_id

    Key invariants:
      - Default shifts (morning / night) are auto-created if the CSV is absent.
      - A shift whose end_hour < start_hour crosses midnight; the active-shift
        logic handles this with an OR condition (h >= start OR h < end).
      - The OR scheduler reads the current shift via active_shift_name() to filter
        which doctors and nurses are considered on duty.
    """

    def __init__(self):
        self.file = SHIFTS_FILE
        self._ensure_defaults()

    def _ensure_defaults(self):
        # Create the default morning/night shifts on first run if the CSV is absent
        if not os.path.exists(self.file):
            pd.DataFrame(DEFAULT_SHIFTS).to_csv(self.file, index=False)

    def _read_df(self):
        if not os.path.exists(self.file):
            return pd.DataFrame(columns=["shift_id", "name", "start_hour", "end_hour"])
        return pd.read_csv(self.file)

    def _write_df(self, df):
        df.to_csv(self.file, index=False)

    def _row_to_dict(self, row):
        return {
            "shift_id":   int(row["shift_id"]),
            "name":       str(row["name"]).strip(),
            "start_hour": int(row["start_hour"]),
            "end_hour":   int(row["end_hour"]),
        }

    def get_all(self):
        df = self._read_df()
        shifts = [self._row_to_dict(row) for _, row in df.iterrows()]
        return {"shifts": shifts}

    def add(self, name: str, start_hour: int, end_hour: int):
        name = name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        df = self._read_df()
        if df["name"].astype(str).str.strip().str.lower().eq(name.lower()).any():
            raise HTTPException(status_code=409, detail=f"A shift named '{name}' already exists")
        new_id = int(df["shift_id"].max()) + 1 if len(df) > 0 else 1
        new_row = pd.DataFrame([{"shift_id": new_id, "name": name,
                                  "start_hour": start_hour, "end_hour": end_hour}])
        df = pd.concat([df, new_row], ignore_index=True)
        self._write_df(df)
        return {"success": True, "message": f"Shift '{name}' added", "shift_id": new_id}

    def modify(self, shift_id: int, name: str, start_hour: int, end_hour: int, new_shift_id: int = None):
        name = name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        df = self._read_df()
        if shift_id not in df["shift_id"].values:
            raise HTTPException(status_code=404, detail=f"Shift {shift_id} not found")
        # Capture the current name before any change (staff reference shifts by name)
        current_name = str(df.loc[df["shift_id"] == shift_id, "name"].iloc[0]).strip()
        if new_shift_id is not None and new_shift_id != shift_id:
            if new_shift_id in df["shift_id"].values:
                raise HTTPException(status_code=409, detail=f"Shift ID {new_shift_id} is already in use")
            df.loc[df["shift_id"] == shift_id, "shift_id"] = new_shift_id
            shift_id = new_shift_id
        if name.lower() != current_name.lower():
            others = df[df["shift_id"] != shift_id]
            if others["name"].astype(str).str.strip().str.lower().eq(name.lower()).any():
                raise HTTPException(status_code=409, detail=f"A shift named '{name}' already exists")
        df.loc[df["shift_id"] == shift_id, "name"]       = name
        df.loc[df["shift_id"] == shift_id, "start_hour"] = start_hour
        df.loc[df["shift_id"] == shift_id, "end_hour"]   = end_hour
        self._write_df(df)
        # Cascade name change to staff records (staff store the shift name directly)
        if name != current_name:
            for staff_file in (_DOCTORS_FILE, _NURSES_FILE):
                if os.path.exists(staff_file):
                    sdf = pd.read_csv(staff_file, dtype=object)
                    if "shift" in sdf.columns:
                        sdf.loc[sdf["shift"].astype(str).str.strip() == current_name, "shift"] = name
                        sdf.to_csv(staff_file, index=False)
        return {"success": True, "message": f"Shift '{name}' updated"}

    def delete(self, shift_id: int):
        df = self._read_df()
        if shift_id not in df["shift_id"].values:
            raise HTTPException(status_code=404, detail=f"Shift {shift_id} not found")
        df = df[df["shift_id"] != shift_id]
        self._write_df(df)
        return {"success": True, "message": f"Shift {shift_id} deleted"}

    @staticmethod
    def active_shift_name() -> str:
        """Return the name of whichever shift covers the current hour (first match wins)."""
        if not os.path.exists(SHIFTS_FILE):
            return "morning"
        try:
            df = pd.read_csv(SHIFTS_FILE)
        except Exception:
            return "morning"
        h = __import__("datetime").datetime.now().hour
        for _, row in df.iterrows():
            s, e = int(row["start_hour"]), int(row["end_hour"])
            if s <= e:
                if s <= h < e:
                    return str(row["name"]).strip()
            else:
                if h >= s or h < e:
                    return str(row["name"]).strip()
        return str(df.iloc[0]["name"]).strip() if len(df) > 0 else "morning"

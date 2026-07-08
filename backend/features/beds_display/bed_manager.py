# =============================================================================
# beds_display/bed_manager.py — Bed State Manager
# =============================================================================
#
# Manages the full lifecycle of hospital beds across three CSV data files:
#
#   EDbeds.csv        — master bed registry (bed_id, bed_number, bed_status, type)
#   ward_bed.csv      — many-to-one relation: each bed_id maps to a ward_id
#   patient_bed.csv   — runtime occupancy: which patient currently occupies which bed
#
# Additional read-only sources (never written by this manager):
#   DailyPatients.csv — patient demographics and acuity, used for display and
#                       for the chariot cleanup heuristic
#   Wards.csv         — maps ward_id → ward_name for display purposes
#
# KEY DESIGN DECISION — "Occupied" is computed, never stored:
#   The on-disk bed_status column in EDbeds.csv only ever holds "Available"
#   or "Under Repair".  Whether a bed is currently occupied is derived at
#   read-time by checking patient_bed.csv for a matching bed_id row.  This
#   avoids the consistency problem of keeping two separate representations of
#   occupancy in sync every time a patient is admitted or discharged.
#
# CHARIOT BED LIFECYCLE:
#   "chariot" is a temporary overflow bed type auto-created by the OR scheduler
#   when a critical (acuity 1/2) patient needs an ICU-equivalent bed but every
#   real ICU bed is already occupied.  Chariot beds exist only as long as they
#   are needed; the manager auto-deletes them once the need is resolved.
#   See create_chariot_bed() and cleanup_chariot_if_unneeded() below.
# =============================================================================

import pandas as pd
import os
import math
from fastapi import HTTPException
from features.timestamp_utils import safe_read_csv


def _safe_val(v):
    # Convert NaN to None for JSON-safe output
    if v is None:
        return None
    try:
        if math.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        pass
    return v

_DS               = os.path.join(os.path.dirname(__file__), "..", "..", "datasets")
BEDS_FILE         = os.path.join(_DS, "EDbeds.csv")
WARD_BED_FILE     = os.path.join(_DS, "ward_bed.csv")
PATIENT_BED_FILE  = os.path.join(_DS, "patient_bed.csv")
DAILY_PATIENTS_FILE = os.path.join(_DS, "DailyPatients.csv")
WARDS_FILE        = os.path.join(_DS, "Wards.csv")

# Only these two values may be written to disk; "Occupied" is computed, not stored
_VALID_CONDITIONS = ("Available", "Under Repair")

# Bed equipment type — independent of ward/condition; defaults to "normal" when unset.
# "chariot" is a temporary overflow bed auto-created by the OR scheduler when a
# critical (acuity 1/2) patient needs a bed but no ICU bed is free; see
# create_chariot_bed() / cleanup_chariot_if_unneeded() below.
_VALID_TYPES  = ("normal", "monitor", "ICU", "chariot")
_DEFAULT_TYPE = "normal"


def _bed_type(raw) -> str:
    # Normalise the raw CSV value; anything unrecognised falls back to "normal"
    v = str(raw).strip()
    return v if v in _VALID_TYPES else _DEFAULT_TYPE


def _condition(raw) -> str:
    # Normalise the raw CSV value to the physical condition of the bed
    return "Under Repair" if str(raw).strip() == "Under Repair" else "Available"


def _display_status(condition: str, patient_id) -> str:
    # Compute the displayed status: Under Repair trumps everything;
    # otherwise Available unless a patient is assigned
    if condition == "Under Repair":
        return "Under Repair"
    return "Occupied" if patient_id is not None else "Available"


class BedManager:
    """
    Manages all bed-related CSV operations for the HCopilot application.

    CSV files managed:
      - EDbeds.csv       : physical bed records (bed_id, bed_number, bed_status, type)
      - ward_bed.csv     : bed-to-ward assignment relation (ward_id, bed_id)
      - patient_bed.csv  : current bed occupancy (patient_id, bed_id)

    Key invariants:
      - EDbeds.csv never contains "Occupied" in bed_status; that value is derived
        at read-time from patient_bed.csv.
      - A patient may occupy at most one bed at a time (enforced by
        check_patient_has_no_bed before every assignment).
      - A bed may hold at most one patient at a time (enforced by
        check_bed_available before every assignment).
      - chariot-type beds are auto-created and auto-deleted by the OR scheduler;
        they should not be created manually through the regular add_bed endpoint.
    """

    def __init__(self):
        self.beds_file           = BEDS_FILE
        self.ward_bed_file       = WARD_BED_FILE
        self.patient_bed_file    = PATIENT_BED_FILE
        self.daily_patients_file = DAILY_PATIENTS_FILE

    def _require_file(self):
        if not os.path.exists(self.beds_file):
            raise HTTPException(status_code=404, detail="Beds data file not found")

    def _read_df(self):
        self._require_file()
        df = safe_read_csv(self.beds_file, ["bed_id", "bed_number", "bed_status", "type"])
        if not df.empty:
            df["bed_number"] = df["bed_number"].map(str)
        if "type" not in df.columns:
            df["type"] = _DEFAULT_TYPE
        return df

    def _write_df(self, df):
        df.to_csv(self.beds_file, index=False)

    def _read_ward_bed(self):
        if not os.path.exists(self.ward_bed_file):
            return pd.DataFrame(columns=["ward_id", "bed_id"])
        return safe_read_csv(self.ward_bed_file, ["ward_id", "bed_id"])

    def _write_ward_bed(self, df):
        df.to_csv(self.ward_bed_file, index=False)

    def _read_patient_bed(self):
        if not os.path.exists(self.patient_bed_file):
            return pd.DataFrame(columns=["patient_id", "bed_id"])
        df = safe_read_csv(self.patient_bed_file, ["patient_id", "bed_id"])
        for col in ["patient_id", "bed_id"]:
            if col in df.columns:
                # Coerce to int so equality comparisons work consistently —
                # pandas reads mixed or float-encoded IDs as float64 by default,
                # which would cause "1.0 != 1" mismatches downstream.
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)
        return df

    def _write_patient_bed(self, df):
        df.to_csv(self.patient_bed_file, index=False)

    def _ward_name_lookup(self) -> dict:
        # Returns {ward_id: ward_name} from Wards.csv; empty dict if file absent
        if not os.path.exists(WARDS_FILE):
            return {}
        df = pd.read_csv(WARDS_FILE)
        if "ward_id" not in df.columns or "ward_name" not in df.columns:
            return {}
        return {int(r["ward_id"]): str(r["ward_name"]) for _, r in df.iterrows()}

    def _ward_for_bed(self, wb, bed_id):
        # Look up which ward a bed belongs to (None if unassigned)
        rows = wb[wb["bed_id"] == bed_id]
        return int(rows.iloc[0]["ward_id"]) if len(rows) else None

    def _patient_for_bed(self, pb, bed_id):
        # Look up which patient is currently on a bed (None if empty)
        rows = pb[pb["bed_id"] == bed_id]
        return int(rows.iloc[0]["patient_id"]) if len(rows) else None

    # ── Public API ─────────────────────────────────────────────────────────────

    def _patient_info_lookup(self):
        # Build a dict {subject_id: {name, gender, age}} from DailyPatients for display
        if not os.path.exists(self.daily_patients_file):
            return {}
        try:
            dp = pd.read_csv(self.daily_patients_file)
        except Exception:
            return {}
        lookup = {}
        for _, row in dp.iterrows():
            pid = row.get("subject_id")
            try:
                pid = int(pid)
            except (TypeError, ValueError):
                continue
            lookup[pid] = {
                "name":   _safe_val(row.get("name")),
                "gender": _safe_val(row.get("gender")),
                "age":    _safe_val(row.get("age")),
            }
        return lookup

    def get_all_beds(self):
        """
        Return a complete snapshot of all beds including derived occupancy state.

        Each bed entry in the result includes:
          - bed_id, bed_number, bed_condition  (from EDbeds.csv)
          - bed_status    : computed — "Occupied", "Available", or "Under Repair"
          - bed_type      : normalised equipment type (normal / monitor / ICU / chariot)
          - ward_id, ward_name  : from ward_bed.csv + Wards.csv; None if unassigned
          - patient_id, patient_name, patient_gender, patient_age : from patient_bed.csv
                           + DailyPatients.csv; None if the bed is empty

        Also includes aggregate counters (status_summary, ward_summary, type_summary)
        for the stats bar displayed in the frontend dashboard.

        Returns:
            dict with keys: beds (list), total_beds, status_summary, ward_summary,
                            type_summary
        """
        # Return all beds with their computed display status, ward, and occupying patient
        df        = self._read_df()
        wb        = self._read_ward_bed()
        pb        = self._read_patient_bed()
        pat_info  = self._patient_info_lookup()
        ward_names = self._ward_name_lookup()

        beds = []
        for _, row in df.iterrows():
            bed_id     = int(row["bed_id"])
            cond       = _condition(row["bed_status"])
            patient_id = self._patient_for_bed(pb, bed_id)
            info       = pat_info.get(patient_id, {}) if patient_id is not None else {}
            ward_id    = self._ward_for_bed(wb, bed_id)
            beds.append({
                "bed_id":          bed_id,
                "bed_number":      str(row["bed_number"]),
                "bed_condition":   cond,
                "bed_status":      _display_status(cond, patient_id),
                "bed_type":        _bed_type(row["type"]),
                "ward_id":         ward_id,
                "ward_name":       ward_names.get(ward_id) if ward_id is not None else None,
                "patient_id":      patient_id,
                "patient_name":    info.get("name"),
                "patient_gender":  info.get("gender"),
                "patient_age":     info.get("age"),
            })

        # Summary counters for the stats bar
        occupied     = sum(1 for b in beds if b["bed_status"] == "Occupied")
        available    = sum(1 for b in beds if b["bed_status"] == "Available")
        under_repair = sum(1 for b in beds if b["bed_status"] == "Under Repair")
        ward_counts  = {}
        type_counts  = {}
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
        """
        Return lightweight aggregate bed statistics without building the full bed list.

        Preferred over get_all_beds() when only the counters are needed (e.g. for a
        stats API call that does not need per-bed detail), as it avoids the
        patient-info and ward-name lookups.

        Returns:
            dict with keys: total_beds, occupied, available, under_repair,
                            occupancy_rate (%), total_wards, type_summary
        """
        # Lightweight stats without building the full bed list
        df = self._read_df()
        wb = self._read_ward_bed()
        pb = self._read_patient_bed()

        total_beds   = len(df)
        under_repair = int((df["bed_status"] == "Under Repair").sum())
        usable       = total_beds - under_repair
        occupied     = min(pb["bed_id"].nunique() if len(pb) > 0 else 0, usable)
        available    = usable - occupied
        type_summary = df["type"].map(_bed_type).value_counts().to_dict()

        return {
            "total_beds":     total_beds,
            "occupied":       occupied,
            "available":      available,
            "under_repair":   under_repair,
            "occupancy_rate": round(occupied / usable * 100, 1) if usable else 0,
            "total_wards":    int(wb["ward_id"].nunique()) if len(wb) > 0 else 0,
            "type_summary":   type_summary,
        }

    def update_condition(self, bed_id, new_condition):
        """
        Toggle the physical condition of a bed between "Available" and "Under Repair".

        Note: this updates only EDbeds.csv and does not affect patient_bed.csv.
        A bed can technically be marked Under Repair while still having a patient
        assigned; the display layer shows "Under Repair" in that case because
        condition trumps occupancy in _display_status.

        Args:
            bed_id        : int — the bed to update
            new_condition : str — must be one of _VALID_CONDITIONS

        Returns:
            dict with success and message keys

        Raises:
            HTTPException(400) : if new_condition is not in _VALID_CONDITIONS
            HTTPException(404) : if bed_id does not exist in EDbeds.csv
        """
        # Toggle a bed between Available and Under Repair
        if new_condition not in _VALID_CONDITIONS:
            raise HTTPException(status_code=400, detail=f"Condition must be one of {_VALID_CONDITIONS}")
        df = self._read_df()
        if bed_id not in df["bed_id"].values:
            raise HTTPException(status_code=404, detail=f"Bed {bed_id} not found")
        df.loc[df["bed_id"] == bed_id, "bed_status"] = new_condition
        self._write_df(df)
        return {"success": True, "message": f"Bed {bed_id} marked as '{new_condition}'"}

    def check_patient_has_no_bed(self, patient_id):
        """
        Guard against double-assignment: raise 400 if the patient already occupies a bed.

        Called before every assign_patient() to enforce the one-bed-per-patient
        invariant.  Not called for move_patient() because that operation explicitly
        changes an existing assignment rather than creating a new one.

        Args:
            patient_id : int — the patient to check

        Raises:
            HTTPException(400) : if patient_id already has a row in patient_bed.csv,
                                 including the ID of the bed they are currently in
        """
        # Raise 400 if the patient is already assigned to a bed — prevents double-assignment
        pb = self._read_patient_bed()
        if len(pb) > 0 and patient_id in pb["patient_id"].values:
            existing = int(pb[pb["patient_id"] == patient_id].iloc[0]["bed_id"])
            raise HTTPException(
                status_code=400,
                detail=f"Patient {patient_id} is already assigned to bed {existing}"
            )

    def check_bed_available(self, bed_id):
        """
        Guard against placing a patient in an unavailable bed.

        Raises if the bed does not exist, is Under Repair, or is already occupied
        by another patient.

        Args:
            bed_id : int — the bed to check

        Raises:
            HTTPException(404) : if bed_id does not exist in EDbeds.csv
            HTTPException(400) : if the bed's condition is "Under Repair"
            HTTPException(400) : if another patient already occupies the bed
        """
        # Raise 400 if the bed is under repair or already has a patient
        df = self._read_df()
        if bed_id not in df["bed_id"].values:
            raise HTTPException(status_code=404, detail=f"Bed {bed_id} not found")
        bed_row = df[df["bed_id"] == bed_id].iloc[0]
        if _condition(bed_row["bed_status"]) == "Under Repair":
            raise HTTPException(status_code=400, detail=f"Bed {bed_id} is under repair and cannot be assigned")
        pb = self._read_patient_bed()
        if len(pb) > 0 and bed_id in pb["bed_id"].values:
            raise HTTPException(status_code=400, detail=f"Bed {bed_id} is already occupied by another patient")

    def move_patient(self, patient_id, new_bed_id):
        """
        Relocate a patient from their current bed to a different available bed.

        After the move, if the vacated bed was a chariot-type, cleanup_chariot_if_unneeded
        is called to delete it if no critical patient is still waiting for ICU capacity.
        Doctor/nurse relationships are NOT affected — only the bed link changes.

        Args:
            patient_id : int — the patient to move (must currently have a bed)
            new_bed_id : int — the destination bed (must exist and be available)

        Returns:
            dict with success, message, old_bed_id, new_bed_id

        Raises:
            HTTPException(400) : if the patient has no current bed assignment
            HTTPException(400) : if the patient is already in the target bed
            HTTPException(404/400) : forwarded from check_bed_available
        """
        # Move a patient already on a bed to a different bed.
        # Doctor/nurse links are untouched — only the bed assignment changes.
        pb = self._read_patient_bed()
        if len(pb) == 0 or patient_id not in pb["patient_id"].values:
            raise HTTPException(status_code=400, detail=f"Patient {patient_id} is not currently assigned to any bed")
        old_bed_id = int(pb[pb["patient_id"] == patient_id].iloc[0]["bed_id"])
        if old_bed_id == new_bed_id:
            raise HTTPException(status_code=400, detail=f"Patient {patient_id} is already in bed {new_bed_id}")

        self.check_bed_available(new_bed_id)

        pb = pb[pb["patient_id"] != patient_id]
        pb = pd.concat([pb, pd.DataFrame([{"patient_id": patient_id, "bed_id": new_bed_id}])], ignore_index=True)
        self._write_patient_bed(pb)
        self.cleanup_chariot_if_unneeded(old_bed_id)
        return {
            "success": True,
            "message": f"Patient {patient_id} moved from bed {old_bed_id} to bed {new_bed_id}",
            "old_bed_id": old_bed_id,
            "new_bed_id": new_bed_id,
        }

    def release_bed(self, bed_id):
        """
        Remove the patient-bed link for a given bed without touching DailyPatients.

        Used for a simple "unoccupy bed" operation, as opposed to a full patient
        discharge (which also updates timestamps and doctor/nurse patient counts).
        After unlinking, cleanup_chariot_if_unneeded is called in case the freed
        bed was a temporary chariot that is no longer required.

        Args:
            bed_id : int — the bed to release

        Returns:
            dict with success and message keys

        Raises:
            HTTPException(400) : if the bed has no patient assigned in patient_bed.csv
        """
        # Remove the patient↔bed link without touching DailyPatients — used for simple unlink
        pb = self._read_patient_bed()
        if len(pb) == 0 or bed_id not in pb["bed_id"].values:
            raise HTTPException(status_code=400, detail=f"Bed {bed_id} has no assigned patient")
        pb = pb[pb["bed_id"] != bed_id]
        self._write_patient_bed(pb)
        self.cleanup_chariot_if_unneeded(bed_id)
        return {"success": True, "message": f"Patient released from bed {bed_id}"}

    def create_chariot_bed(self, ward_id=None):
        """
        Dynamically create a temporary overflow bed of type "chariot".

        Called by the OR scheduler when a critical patient (acuity 1 or 2) needs
        an ICU-equivalent bed but every ICU bed is currently occupied and the user
        has chosen not to manually reassign an existing ICU occupant.

        The new bed is appended to EDbeds.csv with a CHARIOT-{id} number so it is
        visually distinguishable from permanent beds in the bed grid.  If a ward_id
        is supplied, a row is also added to ward_bed.csv so the chariot appears
        within that ward on the frontend.

        Args:
            ward_id : int or None — ward to associate the chariot bed with

        Returns:
            dict with bed_id, bed_number, bed_type, bed_status, ward_id, patient_id
        """
        # Create a temporary overflow bed of type "chariot" on the fly. Used by the
        # OR scheduler when a critical patient needs a bed but no ICU bed is free
        # and the user opted not to manually reassign an ICU occupant.
        df = self._read_df()
        new_id  = int(df["bed_id"].max()) + 1 if len(df) > 0 else 1
        bed_number = f"CHARIOT-{new_id}"
        new_row = pd.DataFrame([{
            "bed_id": new_id, "bed_number": bed_number, "bed_status": "Available", "type": "chariot"
        }])
        df = pd.concat([df, new_row], ignore_index=True)
        self._write_df(df)
        if ward_id is not None:
            wb = self._read_ward_bed()
            wb = pd.concat([wb, pd.DataFrame([{"ward_id": ward_id, "bed_id": new_id}])], ignore_index=True)
            self._write_ward_bed(wb)
        return {
            "bed_id": new_id, "bed_number": bed_number, "bed_type": "chariot",
            "bed_status": "Available", "ward_id": ward_id, "patient_id": None,
        }

    def cleanup_chariot_if_unneeded(self, bed_id):
        """
        Conditionally delete a chariot bed after it has been vacated.

        Called automatically after release_bed() and move_patient() to keep the
        bed list clean.  The decision logic is:

          1. If bed_id is not a chariot type, do nothing and return immediately.
          2. If the chariot is somehow still occupied, do nothing (safety guard).
          3. Count how many critical patients (acuity 1/2, or null) are still
             waiting — i.e. exist in DailyPatients but have no patient_bed row.
          4. Count how many ICU/chariot beds (excluding this one) are currently
             free and not Under Repair.
          5. Delete this chariot only if the remaining free ICU/chariot capacity
             can already cover all waiting critical patients; otherwise keep it.

        A free "normal" or "monitor" bed is deliberately excluded from the
        coverage count because critical patients only ever receive ICU-grade or
        chariot beds — a spare normal bed cannot substitute for this chariot.

        Args:
            bed_id : int — the bed to evaluate for deletion
        """
        # Called after a patient is discharged/released from a bed. If the freed bed
        # is a temporary "chariot" bed, delete it UNLESS at least one critical
        # (acuity 1/2, or null) patient is currently waiting AND there isn't already
        # enough ICU/chariot capacity (excluding this bed) to cover all of them.
        # A free "normal" or "monitor" bed does NOT count — critical patients only
        # ever get an ICU or chariot bed, so it doesn't relieve the need for this one.
        df = self._read_df()
        if bed_id not in df["bed_id"].values:
            return
        row = df[df["bed_id"] == bed_id].iloc[0]
        if _bed_type(row["type"]) != "chariot":
            return

        pb = self._read_patient_bed()
        occupied_bed_ids = set(pb["bed_id"].dropna().astype(int).tolist()) if len(pb) > 0 else set()
        if bed_id in occupied_bed_ids:
            return  # still occupied somehow — leave it alone

        # How many critical (lane 1-2) patients are currently waiting for a bed?
        if not os.path.exists(self.daily_patients_file):
            self.delete_bed(bed_id)
            return
        dp = pd.read_csv(self.daily_patients_file)
        if dp.empty:
            self.delete_bed(bed_id)
            return
        dp["subject_id"] = pd.to_numeric(dp["subject_id"], errors="coerce").fillna(0).astype(int)
        assigned_patient_ids = set(pb["patient_id"].dropna().astype(int).tolist()) if len(pb) > 0 else set()
        waiting = dp[~dp["subject_id"].isin(assigned_patient_ids)]

        def _is_lane12(v):
            if pd.isna(v):
                return True
            try:
                return int(float(v)) in (1, 2)
            except (TypeError, ValueError):
                return False

        n_waiting_critical = (
            int(waiting["acuity"].apply(_is_lane12).sum())
            if "acuity" in waiting.columns and len(waiting) else 0
        )

        if n_waiting_critical == 0:
            self.delete_bed(bed_id)
            return

        # Free ICU/chariot capacity that could cover those patients WITHOUT this bed
        others = df[df["bed_id"] != bed_id]
        others = others[others["bed_status"].astype(str).str.strip() != "Under Repair"]
        others_free = others[~others["bed_id"].isin(occupied_bed_ids)]
        coverage = others_free[others_free["type"].map(_bed_type).isin(["ICU", "chariot"])]

        if n_waiting_critical > len(coverage):
            return  # still needed — not enough ICU/chariot beds for the waiting critical patients

        self.delete_bed(bed_id)

    def assign_patient(self, bed_id, patient_id, bed_occupation_time=None):
        """
        Assign a patient to a specific bed and optionally record the occupation timestamp.

        Validates:
          - the bed exists and is not Under Repair
          - the patient is not already assigned to another bed
          - the patient exists in DailyPatients.csv

        If bed_occupation_time is provided, it is written to the
        bed_occupation_time column in DailyPatients.csv for that patient.
        Any stale link for the target bed is cleared before writing the new link,
        guarding against leftover rows from a previous unclean state.

        Args:
            bed_id              : int — target bed
            patient_id          : int — patient to assign
            bed_occupation_time : str or None — ISO datetime string (optional)

        Returns:
            dict with success and message keys

        Raises:
            HTTPException(404) : if the bed or DailyPatients.csv does not exist
            HTTPException(400) : if bed is Under Repair, patient already has a bed,
                                 or patient is not in DailyPatients
        """
        # Assign a patient to a bed: validates bed and patient, writes patient_bed.csv,
        # and optionally stamps the bed_occupation_time in DailyPatients
        df = self._read_df()
        if bed_id not in df["bed_id"].values:
            raise HTTPException(status_code=404, detail=f"Bed {bed_id} not found")
        bed_row = df[df["bed_id"] == bed_id].iloc[0]
        if _condition(bed_row["bed_status"]) == "Under Repair":
            raise HTTPException(status_code=400, detail=f"Bed {bed_id} is under repair and cannot be assigned")

        self.check_patient_has_no_bed(patient_id)

        if not os.path.exists(self.daily_patients_file):
            raise HTTPException(status_code=404, detail="DailyPatients database not found")

        dp = pd.read_csv(self.daily_patients_file)
        dp["subject_id"] = pd.to_numeric(dp["subject_id"], errors="coerce").fillna(0).astype(int)
        if patient_id not in dp["subject_id"].values:
            raise HTTPException(
                status_code=400,
                detail=f"Patient {patient_id} does not exist in the daily patient database"
            )

        pb = self._read_patient_bed()
        pb = pb[pb["bed_id"] != bed_id]   # clear any stale link for this bed first
        pb = pd.concat([pb, pd.DataFrame([{"patient_id": patient_id, "bed_id": bed_id}])], ignore_index=True)
        self._write_patient_bed(pb)

        # Write the bed occupation timestamp back to DailyPatients if supplied
        if bed_occupation_time:
            if "bed_occupation_time" not in dp.columns:
                dp["bed_occupation_time"] = None
            dp.loc[dp["subject_id"] == patient_id, "bed_occupation_time"] = bed_occupation_time
            dp.to_csv(self.daily_patients_file, index=False)

        return {"success": True, "message": f"Patient {patient_id} assigned to bed {bed_id}"}

    def add_bed(self, bed_number, ward_id=None, bed_type=None):
        """
        Create a new permanent bed entry in EDbeds.csv with status "Available".

        Optionally links the new bed to a ward by adding a row to ward_bed.csv.
        The bed_type defaults to "normal" if not supplied or if an unrecognised
        value is provided (via _bed_type normalisation).

        Args:
            bed_number : str — unique human-readable label (e.g. "A-12")
            ward_id    : int or None — ward to assign the bed to
            bed_type   : str or None — one of _VALID_TYPES; defaults to "normal"

        Returns:
            dict with success, message, and the full bed record

        Raises:
            HTTPException(400) : if bed_number already exists in EDbeds.csv
        """
        # Create a new bed entry; optionally link it to a ward via ward_bed.csv
        df = self._read_df()
        if bed_number in df["bed_number"].values:
            raise HTTPException(status_code=400, detail=f"Bed number '{bed_number}' already exists")
        new_id   = int(df["bed_id"].max()) + 1 if len(df) > 0 else 1
        btype    = _bed_type(bed_type) if bed_type else _DEFAULT_TYPE
        new_row  = pd.DataFrame([{"bed_id": new_id, "bed_number": bed_number, "bed_status": "Available", "type": btype}])
        df = pd.concat([df, new_row], ignore_index=True)
        self._write_df(df)
        if ward_id is not None:
            wb = self._read_ward_bed()
            wb = pd.concat([wb, pd.DataFrame([{"ward_id": ward_id, "bed_id": new_id}])], ignore_index=True)
            self._write_ward_bed(wb)
        return {
            "success": True,
            "message": f"Bed '{bed_number}' added successfully",
            "bed": {"bed_id": new_id, "bed_number": bed_number, "bed_condition": "Available",
                    "bed_status": "Available", "bed_type": btype, "ward_id": ward_id, "patient_id": None},
        }

    def modify_bed(self, bed_id, bed_number, ward_id=None, bed_type=None):
        """
        Update the label, ward assignment, and/or type of an existing bed.

        The ward link in ward_bed.csv is fully replaced: any previous ward
        assignment for this bed is removed and the new ward_id is written
        (or no row is written if ward_id is None, leaving the bed unassigned).

        Args:
            bed_id     : int — the bed to modify
            bed_number : str — new human-readable label (must be unique across all beds)
            ward_id    : int or None — new ward assignment (None to unassign)
            bed_type   : str or None — new equipment type; None leaves existing type unchanged

        Returns:
            dict with success, message, and the updated bed record

        Raises:
            HTTPException(404) : if bed_id does not exist in EDbeds.csv
            HTTPException(400) : if the new bed_number is already used by a different bed
        """
        # Rename a bed, reassign it to a different ward, and/or change its type
        df = self._read_df()
        if bed_id not in df["bed_id"].values:
            raise HTTPException(status_code=404, detail=f"Bed {bed_id} not found")
        if len(df[(df["bed_number"] == bed_number) & (df["bed_id"] != bed_id)]) > 0:
            raise HTTPException(status_code=400, detail=f"Bed number '{bed_number}' already exists")
        df.loc[df["bed_id"] == bed_id, "bed_number"] = bed_number
        if bed_type is not None:
            df.loc[df["bed_id"] == bed_id, "type"] = _bed_type(bed_type)
        self._write_df(df)
        # Replace any existing ward link for this bed
        wb = self._read_ward_bed()
        wb = wb[wb["bed_id"] != bed_id]
        if ward_id is not None:
            wb = pd.concat([wb, pd.DataFrame([{"ward_id": ward_id, "bed_id": bed_id}])], ignore_index=True)
        self._write_ward_bed(wb)
        pb         = self._read_patient_bed()
        patient_id = self._patient_for_bed(pb, bed_id)
        row        = df[df["bed_id"] == bed_id].iloc[0]
        cond       = _condition(row["bed_status"])
        return {
            "success": True,
            "message": f"Bed {bed_id} modified successfully",
            "bed": {
                "bed_id": bed_id, "bed_number": bed_number,
                "bed_condition": cond, "bed_status": _display_status(cond, patient_id),
                "bed_type": _bed_type(row["type"]),
                "ward_id": ward_id, "patient_id": patient_id,
            },
        }

    def delete_bed(self, bed_id):
        """
        Permanently remove a bed and cascade-delete its ward and patient links.

        Removes the bed row from EDbeds.csv, the corresponding row(s) from
        ward_bed.csv, and the corresponding row(s) from patient_bed.csv.
        This method is also called internally by cleanup_chariot_if_unneeded
        when a chariot bed is no longer needed.

        Args:
            bed_id : int — the bed to delete

        Returns:
            dict with success and message keys

        Raises:
            HTTPException(404) : if bed_id does not exist in EDbeds.csv
        """
        # Remove a bed and all its ward/patient links across all three CSVs
        df = self._read_df()
        if bed_id not in df["bed_id"].values:
            raise HTTPException(status_code=404, detail=f"Bed {bed_id} not found")
        bed_number = str(df[df["bed_id"] == bed_id].iloc[0]["bed_number"])
        self._write_df(df[df["bed_id"] != bed_id])
        wb = self._read_ward_bed()
        self._write_ward_bed(wb[wb["bed_id"] != bed_id])
        pb = self._read_patient_bed()
        self._write_patient_bed(pb[pb["bed_id"] != bed_id])
        return {"success": True, "message": f"Bed '{bed_number}' deleted successfully"}

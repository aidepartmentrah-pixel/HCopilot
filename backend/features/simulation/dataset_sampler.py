# =============================================================================
# simulation/dataset_sampler.py — Historical Patient Intake Sampler
# =============================================================================
#
# Draws random patient records from the historical Patients.csv dataset and
# maps them to the DailyPatients schema so the user can review and confirm
# each one before it enters the active patient list.
#
# DEDUPLICATION:
#   The sampler filters out any subject_id that already appears in
#   DailyPatients.csv to prevent double-admitting the same patient.
#   Filtered records are not permanently excluded — they re-enter the pool
#   on the next sample call once the active stay is discharged.
#
# FIELD MAPPING:
#   Source columns from Patients.csv are renamed/formatted to match the
#   DailyPatients schema (e.g. subject_id, name, gender, age, acuity,
#   chiefcomplaint, and vital signs).  stay_id is auto-assigned.
# =============================================================================

import os
import math
import pandas as pd
from fastapi import HTTPException

# ── File paths ────────────────────────────────────────────────────────────────
_DS             = os.path.join(os.path.dirname(__file__), "..", "..", "datasets")
PATIENTS_FILE   = os.path.join(_DS, "Patients.csv")
DAILY_FILE      = os.path.join(_DS, "DailyPatients.csv")


def _safe(v):
    """Convert NaN/None to Python None for JSON-safe output."""
    if v is None:
        return None
    try:
        if math.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        pass
    return v


class DatasetSampler:
    """Reads Patients.csv and returns one random row per call."""

    # ── Private helpers ───────────────────────────────────────────────────────

    def _active_subject_ids(self) -> set:
        """Return the set of subject_ids currently in DailyPatients."""
        if not os.path.exists(DAILY_FILE):
            return set()
        df = pd.read_csv(DAILY_FILE, usecols=["subject_id"])
        return set(df["subject_id"].dropna().astype(int).tolist())

    def _next_ids(self) -> tuple[int, int]:
        """
        Compute the next available patient_id and stay_id.
        Seeds at 10 000 001 / 30 000 001 to avoid collisions with historic data
        (mirrors the logic in PatientManager.get_next_ids).
        """
        if not os.path.exists(DAILY_FILE):
            return 10_000_001, 30_000_001
        df = pd.read_csv(DAILY_FILE)
        if df.empty:
            return 10_000_001, 30_000_001
        next_patient = int(df["subject_id"].max()) + 1
        next_stay    = int(df["stay_id"].max())    + 1
        return next_patient, next_stay

    # ── Public API ────────────────────────────────────────────────────────────

    def sample(self) -> dict:
        """
        Draw one random row from Patients.csv, skipping subjects already active
        in DailyPatients.  Returns a dict ready for the frontend confirmation modal,
        pre-loaded with new patient_id / stay_id from the next-ID sequence.
        """
        if not os.path.exists(PATIENTS_FILE):
            raise HTTPException(status_code=404, detail="Patients.csv not found in datasets folder")

        active_ids = self._active_subject_ids()

        # Load the full dataset — ~38 MB fits comfortably in memory
        df = pd.read_csv(PATIENTS_FILE)

        # Filter out already-active subjects
        available = df[~df["subject_id"].isin(active_ids)]
        if available.empty:
            raise HTTPException(
                status_code=409,
                detail="No more patients available — all dataset subjects are currently active"
            )

        row = available.sample(1).iloc[0]

        # Resolve new IDs for the confirmed patient
        new_patient_id, new_stay_id = self._next_ids()

        raw_acuity      = _safe(row.get("acuity"))
        acuity_was_null = raw_acuity is None

        return {
            "source_subject_id": int(row["subject_id"]),
            "source_stay_id":    int(row["stay_id"]),
            "new_patient_id":    new_patient_id,
            "new_stay_id":       new_stay_id,
            "temperature":       _safe(row.get("temperature")),
            "heartrate":         _safe(row.get("heartrate")),
            "resprate":          _safe(row.get("resprate")),
            "o2sat":             _safe(row.get("o2sat")),
            "sbp":               _safe(row.get("sbp")),
            "dbp":               _safe(row.get("dbp")),
            "pain":              _safe(row.get("pain")),
            "acuity":            raw_acuity,       # raw — null displayed as-is in modal
            "acuity_was_null":   acuity_was_null,  # OR treats null as acuity 1
            "chiefcomplaint":    _safe(row.get("chiefcomplaint")),
        }

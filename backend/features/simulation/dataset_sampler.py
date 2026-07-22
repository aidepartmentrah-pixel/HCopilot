# =============================================================================
# simulation/dataset_sampler.py — Historical Patient Intake Sampler
# =============================================================================
#
# Draws random patient records from the historical Patients.csv dataset and
# maps them to the DailyPatients schema so the user can review and confirm
# each one before it enters the active patient list.
#
# NO SQL SERVER ROUND TRIP: sampling is a testing/demo helper, so it reads
# only Patients.csv and never touches the database. Two consequences of that:
#   - It can no longer filter out subjects who are already active in
#     DailyPatients (that would require a live query), so it may occasionally
#     resurface a patient who's already admitted.
#   - new_patient_id/new_stay_id are a best-effort suggestion from an
#     in-process counter, not a guaranteed-unique value from the database.
# Neither is a correctness problem: PatientManager.add() (called by
# POST /confirm-patient) is what actually enforces uniqueness against the
# live DailyPatients table. A stale/colliding suggestion here just surfaces
# as a clear "already exists" error at confirm time — the user samples again.
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
# Patients.csv (~38MB historical MIMIC-like sampler source) intentionally stays
# a flat file — it is explicitly out of scope for the SQL Server migration
# (see Stage 1 plan). DailyPatients is ORM-backed (see db/models.py).
_DS             = os.path.join(os.path.dirname(__file__), "..", "..", "datasets")
PATIENTS_FILE   = os.path.join(_DS, "Patients.csv")


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
    """Reads Patients.csv and returns one random row per call. No SQL Server access."""

    def __init__(self):
        # In-process only — resets on backend restart. See module docstring:
        # this is a best-effort suggestion, not a uniqueness guarantee.
        self._next_seq = 0

    # ── Private helpers ───────────────────────────────────────────────────────

    def _next_ids(self) -> tuple[int, int]:
        """
        Suggest the next patient_id / stay_id from an in-process counter,
        seeded at 10 000 001 / 30 000 001 to avoid colliding with historic
        Patients.csv data (mirrors the seeding scheme in PatientManager.get_next_ids,
        but without querying DailyPatients).
        """
        self._next_seq += 1
        return 10_000_000 + self._next_seq, 30_000_000 + self._next_seq

    # ── Public API ────────────────────────────────────────────────────────────

    def sample(self) -> dict:
        """
        Draw one random row from Patients.csv. Returns a dict ready for the
        frontend confirmation modal, pre-loaded with a suggested new
        patient_id / stay_id.
        """
        if not os.path.exists(PATIENTS_FILE):
            raise HTTPException(status_code=404, detail="Patients.csv not found in datasets folder")

        # Load the full dataset — ~38 MB fits comfortably in memory
        df = pd.read_csv(PATIENTS_FILE)
        if df.empty:
            raise HTTPException(status_code=409, detail="Patients.csv has no rows to sample")

        row = df.sample(1).iloc[0]

        # Suggest new IDs for the confirmed patient (not guaranteed-unique — see module docstring)
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

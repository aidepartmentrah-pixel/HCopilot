# =============================================================================
# db/models.py — SQLAlchemy ORM schema for HCopilot
# =============================================================================
#
# One model per former CSV file. Column names/shapes match the CSVs exactly
# so manager rewrites are a storage-layer swap, not a data-model redesign.
#
# NOTES ON DELIBERATE DESIGN CHOICES (see Stage 1 plan for full rationale):
#   - Doctors.shift / Doctors.work_days / Nurses.shift / Nurses.group store the
#     Shift/Group NAME as text (not an integer FK id) with a real FK constraint
#     against Shifts.name / Groups.name (both UNIQUE) — this preserves the
#     existing cascade-rename-on-modify application logic unchanged.
#   - DailyPatients.subject_id is intentionally NOT unique at the DB level:
#     the base DailyPatientsManager never enforced it (only the PatientManager
#     subclass does, in Python). Because of this, the relation tables'
#     patient_id column (patient_bed/patient_doctor/patient_nurse) cannot carry
#     a real FK to DailyPatients.subject_id (SQL Server requires the
#     referenced column to be unique) and is therefore a plain, unconstrained
#     INT column — exactly matching today's zero-enforcement CSV behavior.
#   - patientNb/patientNB/availabilityTimeStart/absent stay text columns
#     (not INTEGER/BIT) because existing manager code writes "" (not NULL) for
#     a zero count and capitalized "True"/"False" strings for absent; changing
#     these types would be a silent behavior change.
#   - HistoricalEdStays/DailyWeather are provisional: edstays_with_synth.csv
#     and meteo.csv were not available in this environment, so only the
#     columns actually referenced by flow_prediction/data_processor.py are
#     modeled. Extend via a follow-up migration once the real files are
#     available.
# =============================================================================

from sqlalchemy import (
    Column, Integer, BigInteger, String, ForeignKey, ForeignKeyConstraint,
    CheckConstraint, UniqueConstraint, Float, DateTime,
)

from db.session import Base


class User(Base):
    __tablename__ = "Users"

    user_id         = Column(Integer, primary_key=True, autoincrement=False)
    username        = Column(String(100), nullable=False, unique=True)
    password_hash   = Column(String(64), nullable=False)
    name            = Column(String(200), nullable=True)
    role            = Column(String(20), nullable=False)
    sections        = Column(String(1000), nullable=True)
    settings_tabs   = Column(String(1000), nullable=True)
    statistics_tabs = Column(String(1000), nullable=True)


class Shift(Base):
    __tablename__ = "Shifts"

    shift_id   = Column(Integer, primary_key=True, autoincrement=False)
    name       = Column(String(50), nullable=False, unique=True)
    start_hour = Column(Integer, nullable=False)
    end_hour   = Column(Integer, nullable=False)


class Group(Base):
    __tablename__ = "Groups"

    group_id = Column(Integer, primary_key=True, autoincrement=False)
    name     = Column(String(50), nullable=False, unique=True)
    days     = Column(String(50), nullable=False)


class Doctor(Base):
    __tablename__ = "Doctors"
    __table_args__ = (
        # onupdate=CASCADE is required, not optional: SQL Server checks FKs
        # immediately, so renaming Shifts.name/Groups.name (which the app does
        # routinely — see ShiftsManager/GroupsManager.modify()) is only
        # possible at all if the DB propagates the rename to referencing rows
        # in the same statement. ondelete=SET NULL keeps delete-a-shift-still-
        # in-use working (as it always has); a doctor whose shift text is
        # nulled out is functionally identical to one whose shift text used to
        # reference a deleted shift, since active_shift_name() can never match
        # a deleted shift either way — the only difference is cosmetic display.
        ForeignKeyConstraint(["shift"], ["Shifts.name"], onupdate="CASCADE", ondelete="SET NULL"),
        ForeignKeyConstraint(["work_days"], ["Groups.name"], onupdate="CASCADE", ondelete="SET NULL"),
        CheckConstraint("intern_or_not IN ('doctor', 'intern')"),
    )

    id                    = Column(Integer, primary_key=True, autoincrement=False)
    intern_or_not         = Column(String(20), nullable=False)
    shift                 = Column(String(50), nullable=True)
    work_days             = Column(String(50), nullable=True)
    patientNb             = Column(String(20), nullable=True)
    availabilityTimeStart = Column(String(30), nullable=True)
    name                  = Column(String(200), nullable=True)
    absent                = Column(String(10), nullable=False, server_default="False")


class Nurse(Base):
    __tablename__ = "Nurses"
    __table_args__ = (
        ForeignKeyConstraint(["shift"], ["Shifts.name"], onupdate="CASCADE", ondelete="SET NULL"),
        ForeignKeyConstraint(["group"], ["Groups.name"], onupdate="CASCADE", ondelete="SET NULL"),
        CheckConstraint("role IN ('PN', 'RN', 'Bed_Admission')"),
    )

    id                    = Column(Integer, primary_key=True, autoincrement=False)
    role                  = Column(String(20), nullable=False)
    shift                 = Column(String(50), nullable=True)
    group                 = Column(String(50), nullable=True)
    patientNB             = Column(String(20), nullable=True)
    availabilityTimeStart = Column(String(30), nullable=True)
    absent                = Column(String(10), nullable=False, server_default="False")
    name                  = Column(String(200), nullable=True)


class EDBed(Base):
    __tablename__ = "EDbeds"
    __table_args__ = (
        CheckConstraint("bed_status IN ('Available', 'Under Repair')"),
        CheckConstraint("type IN ('normal', 'monitor', 'ICU', 'chariot')"),
    )

    bed_id     = Column(Integer, primary_key=True, autoincrement=False)
    bed_number = Column(String(50), nullable=False, unique=True)
    bed_status = Column(String(20), nullable=False, server_default="Available")
    type       = Column(String(20), nullable=False, server_default="normal")


class Ward(Base):
    __tablename__ = "Wards"

    ward_id       = Column(Integer, primary_key=True, autoincrement=False)
    ward_name     = Column(String(200), nullable=False)
    department_id = Column(Integer, nullable=True)


class DailyPatient(Base):
    __tablename__ = "DailyPatients"

    stay_id             = Column(Integer, primary_key=True, autoincrement=False)
    subject_id          = Column(Integer, nullable=False, index=True)
    name                = Column(String(200), nullable=True)
    gender              = Column(String(20), nullable=True)
    age                 = Column(Float, nullable=True)
    temperature         = Column(Float, nullable=True)
    heartrate           = Column(Float, nullable=True)
    resprate            = Column(Float, nullable=True)
    o2sat               = Column(Float, nullable=True)
    sbp                 = Column(Float, nullable=True)
    dbp                 = Column(Float, nullable=True)
    # String, not Float: the real data contains non-numeric values (e.g. "7-8",
    # "pain") that the app has always treated as opaque/display-only text —
    # nothing aggregates this field numerically, so preserving it exactly as
    # text avoids silent data loss during migration.
    pain                = Column(String(20), nullable=True)
    acuity              = Column(Float, nullable=True)
    chiefcomplaint      = Column(String(500), nullable=True)
    arrival_time        = Column(String(30), nullable=True)
    departure_time      = Column(String(30), nullable=True)
    bed_occupation_time = Column(String(30), nullable=True)
    unurgent            = Column(String(10), nullable=True)
    # Where the patient went on discharge: "Home" or "Hospital Department".
    # Set by the discharge endpoints right before the row is archived to
    # LogPatients and removed from here.
    destination         = Column(String(50), nullable=True)
    # Comma-separated trail of every bed_number this stay has occupied, in
    # order (e.g. "12, 5, 8"). Appended to by BedManager on every assign/move;
    # copied verbatim into LogPatients.bed_history on discharge.
    bed_history         = Column(String(500), nullable=True)
    # Ward of the FIRST bed assigned this stay (admission ward), captured once
    # by BedManager.add_bed_to_history() and never overwritten by later moves.
    # Used to attribute a same-day discharge to a ward for the daily census —
    # see features/ward_census. ward_name is denormalized (like destination/
    # bed_history) so census rows stay accurate even if the Ward row is later
    # renamed or deleted.
    admission_ward_id   = Column(Integer, nullable=True)
    admission_ward_name = Column(String(200), nullable=True)


class LogPatient(Base):
    __tablename__ = "LogPatients"

    log_id              = Column(BigInteger, primary_key=True, autoincrement=True)
    subject_id          = Column(Integer, nullable=False, index=True)
    stay_id             = Column(Integer, nullable=False, index=True)
    name                = Column(String(200), nullable=True)
    gender              = Column(String(20), nullable=True)
    age                 = Column(Float, nullable=True)
    temperature         = Column(Float, nullable=True)
    heartrate           = Column(Float, nullable=True)
    resprate            = Column(Float, nullable=True)
    o2sat               = Column(Float, nullable=True)
    sbp                 = Column(Float, nullable=True)
    dbp                 = Column(Float, nullable=True)
    # String, not Float: the real data contains non-numeric values (e.g. "7-8",
    # "pain") that the app has always treated as opaque/display-only text —
    # nothing aggregates this field numerically, so preserving it exactly as
    # text avoids silent data loss during migration.
    pain                = Column(String(20), nullable=True)
    acuity              = Column(Float, nullable=True)
    chiefcomplaint      = Column(String(500), nullable=True)
    arrival_time        = Column(String(30), nullable=True)
    departure_time      = Column(String(30), nullable=True)
    bed_occupation_time = Column(String(30), nullable=True)
    destination         = Column(String(50), nullable=True)
    bed_history         = Column(String(500), nullable=True)
    admission_ward_id   = Column(Integer, nullable=True)
    admission_ward_name = Column(String(200), nullable=True)


class WardDailyCensus(Base):
    """
    One row per (census_date, ward) — a permanent daily snapshot of how many
    patients were associated with each ward that day, so historical ward
    census survives even though DailyPatients only reflects live/current state.

    active_patients     — patients currently occupying a bed in this ward at
                           the moment this row was (re)computed (from patient_bed
                           + ward_bed; always "live" for today, frozen for past
                           dates once no longer recomputed).
    discharged_patients — patients discharged (moved to LogPatients) on
                           census_date whose admission_ward_name matches.
    total_patients       — active_patients + discharged_patients.

    ward_name is denormalized (not just ward_id) so a later ward rename/delete
    doesn't corrupt historical rows — see DailyPatient.admission_ward_name.
    A ward_name of "Unassigned" buckets patients with no resolvable ward
    (e.g. a bed with no ward_bed link, or unurgent patients who never had a bed).
    """
    __tablename__ = "WardDailyCensus"
    __table_args__ = (
        CheckConstraint(
            "active_patients >= 0 AND discharged_patients >= 0 AND total_patients >= 0",
            name="ck_ward_census_nonnegative",
        ),
        UniqueConstraint("census_date", "ward_name", name="uq_ward_census_date_ward"),
    )

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    census_date         = Column(String(10), nullable=False, index=True)   # "YYYY-MM-DD"
    ward_id             = Column(Integer, nullable=True)
    ward_name           = Column(String(200), nullable=False)
    active_patients     = Column(Integer, nullable=False, default=0)
    discharged_patients = Column(Integer, nullable=False, default=0)
    total_patients      = Column(Integer, nullable=False, default=0)
    computed_at         = Column(String(30), nullable=False)   # ISO datetime string of last (re)computation


class DoctorLog(Base):
    """
    Permanent archive of Doctor rows. A copy is inserted here right before a
    doctor is deleted from Doctors (DoctorsManager.delete()) — the live row is
    still removed as before, but the doctor's identity/attributes survive here
    forever, so historical statistics (e.g. "who treated patients on day X")
    keep working even after that doctor is later removed from the roster.
    Plain denormalized text columns, no FK/CHECK constraints — this is a frozen
    snapshot of what was true at deletion time, not a live-editable record.
    """
    __tablename__ = "DoctorLog"

    log_id                = Column(BigInteger, primary_key=True, autoincrement=True)
    doctor_id             = Column(Integer, nullable=False, index=True)
    name                  = Column(String(200), nullable=True)
    intern_or_not         = Column(String(20), nullable=True)
    shift                 = Column(String(50), nullable=True)
    work_days             = Column(String(50), nullable=True)
    patientNb             = Column(String(20), nullable=True)
    availabilityTimeStart = Column(String(30), nullable=True)
    absent                = Column(String(10), nullable=True)
    archived_at           = Column(String(30), nullable=False)   # when this doctor was deleted


class NurseLog(Base):
    """Permanent archive of Nurse rows — see DoctorLog docstring; same pattern."""
    __tablename__ = "NurseLog"

    log_id                = Column(BigInteger, primary_key=True, autoincrement=True)
    nurse_id              = Column(Integer, nullable=False, index=True)
    name                  = Column(String(200), nullable=True)
    role                  = Column(String(20), nullable=True)
    shift                 = Column(String(50), nullable=True)
    group                 = Column(String(50), nullable=True)
    patientNB             = Column(String(20), nullable=True)
    availabilityTimeStart = Column(String(30), nullable=True)
    absent                = Column(String(10), nullable=True)
    archived_at           = Column(String(30), nullable=False)   # when this nurse was deleted


class PatientDoctorLog(Base):
    """
    Permanent archive of every patient<->doctor link that has ever existed.
    A row is inserted here whenever a live patient_doctor row is about to be
    removed — on discharge, manual unassignment, reassignment to a different
    doctor, or the doctor being deleted — so "which doctor treated which
    patient" survives independently of both the patient's DailyPatients row
    and the doctor's own Doctors row being deleted later.

    doctor_name is denormalized (captured at archive time) so this table
    never depends on Doctors/DoctorLog still containing a matching row.
    stay_id is best-effort — the active stay's ID at archive time, letting
    statistics join back to DailyPatients/LogPatients for arrival/departure
    dates; it can be null if no active stay could be resolved.
    archived_at is the one timestamp always guaranteed to be accurate: the
    moment the link was severed, which is what daily statistics filter on.
    """
    __tablename__ = "PatientDoctorLog"

    log_id      = Column(BigInteger, primary_key=True, autoincrement=True)
    patient_id  = Column(Integer, nullable=False, index=True)
    stay_id     = Column(Integer, nullable=True, index=True)
    doctor_id   = Column(Integer, nullable=False, index=True)
    doctor_name = Column(String(200), nullable=True)
    archived_at = Column(String(30), nullable=False, index=True)


class PatientNurseLog(Base):
    """Permanent archive of every patient<->nurse link — see PatientDoctorLog docstring; same pattern."""
    __tablename__ = "PatientNurseLog"

    log_id      = Column(BigInteger, primary_key=True, autoincrement=True)
    patient_id  = Column(Integer, nullable=False, index=True)
    stay_id     = Column(Integer, nullable=True, index=True)
    nurse_id    = Column(Integer, nullable=False, index=True)
    nurse_name  = Column(String(200), nullable=True)
    archived_at = Column(String(30), nullable=False, index=True)


# ── Relation ("link") tables ────────────────────────────────────────────────
# patient_id columns are intentionally NOT foreign keys — see module docstring.

class PatientBed(Base):
    __tablename__ = "patient_bed"

    patient_id = Column(Integer, primary_key=True, autoincrement=False)
    bed_id     = Column(Integer, ForeignKey("EDbeds.bed_id"), primary_key=True)


class PatientDoctor(Base):
    __tablename__ = "patient_doctor"

    patient_id = Column(Integer, primary_key=True, autoincrement=False)
    doctor_id  = Column(Integer, ForeignKey("Doctors.id"), primary_key=True)


class PatientNurse(Base):
    __tablename__ = "patient_nurse"

    patient_id = Column(Integer, primary_key=True, autoincrement=False)
    nurse_id   = Column(Integer, ForeignKey("Nurses.id"), primary_key=True)


class WardBed(Base):
    __tablename__ = "ward_bed"

    ward_id = Column(Integer, ForeignKey("Wards.ward_id"), primary_key=True)
    bed_id  = Column(Integer, ForeignKey("EDbeds.bed_id"), primary_key=True)


class WardDoctor(Base):
    __tablename__ = "ward_doctor"

    ward_id   = Column(Integer, ForeignKey("Wards.ward_id"), primary_key=True)
    doctor_id = Column(Integer, ForeignKey("Doctors.id"), primary_key=True)


class WardNurse(Base):
    __tablename__ = "ward_nurse"

    ward_id  = Column(Integer, ForeignKey("Wards.ward_id"), primary_key=True)
    nurse_id = Column(Integer, ForeignKey("Nurses.id"), primary_key=True)


# ── ML historical training data (Stage 2 consumer) ─────────────────────────
# Sourced from edstays_with_synth.csv / meteo.csv (MIMIC-IV-ED-derived, dates
# obfuscated per MIMIC de-identification + a "_synth" re-dated column used for
# actual modeling). Full column set preserved even though
# flow_prediction/data_processor.py currently only reads intime_synth/
# outtime_synth and temperature_2m_mean — the rest (race, disposition,
# min/max temps, precipitation) are kept for future feature engineering.

class HistoricalEdStay(Base):
    __tablename__ = "HistoricalEdStays"

    id                = Column(BigInteger, primary_key=True, autoincrement=True)
    subject_id        = Column(Integer, nullable=True, index=True)
    hadm_id           = Column(BigInteger, nullable=True)
    stay_id           = Column(BigInteger, nullable=True, index=True)
    intime            = Column(DateTime, nullable=True)
    outtime           = Column(DateTime, nullable=True)
    gender            = Column(String(10), nullable=True)
    race              = Column(String(100), nullable=True)
    arrival_transport = Column(String(50), nullable=True)
    disposition       = Column(String(50), nullable=True)
    los_seconds       = Column(Float, nullable=True)
    intime_synth      = Column(DateTime, nullable=False, index=True)
    outtime_synth     = Column(DateTime, nullable=True)
    season_synth      = Column(String(20), nullable=True)


class DailyWeather(Base):
    __tablename__ = "DailyWeather"

    id                   = Column(BigInteger, primary_key=True, autoincrement=True)
    time                 = Column(DateTime, nullable=False, index=True)
    temperature_2m_mean  = Column(Float, nullable=True)
    temperature_2m_min   = Column(Float, nullable=True)
    temperature_2m_max   = Column(Float, nullable=True)
    precipitation_sum_mm = Column(Float, nullable=True)

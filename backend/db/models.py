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
    CheckConstraint, Float, DateTime,
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

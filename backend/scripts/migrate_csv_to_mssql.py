# =============================================================================
# scripts/migrate_csv_to_mssql.py — One-time CSV -> SQL Server data import
# =============================================================================
#
# Loads every operational CSV under backend/datasets/ into the SQL Server
# tables created by `alembic upgrade head`, preserving IDs exactly (plain INT
# columns, no IDENTITY_INSERT dance needed).
#
# Idempotent: each entity group is skipped if its target table already has
# rows, so this script can be re-run safely during Stage 1 iteration.
#
# Row-count parity (verify_row_counts) only checks tables that were actually
# empty — and therefore freshly seeded — on THIS run. It deliberately does
# NOT check tables that were already populated and skipped: those (DailyPatients,
# LogPatients, EDbeds, patient_bed/doctor/nurse, ward_bed, ...) are live
# operational data that the app is expected to keep changing after go-live
# (admissions, discharges, bed assignments), so their row counts will
# legitimately diverge from the build-time CSV snapshot. Treating that
# divergence as a failure would make db-init fail on every restart once the
# app has seen real use — this file exists to prevent that.
#
# Run from backend/:  .venv\Scripts\python.exe scripts\migrate_csv_to_mssql.py
# =============================================================================

import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.session import SessionLocal
from db.models import (
    User, Shift, Group, Doctor, Nurse, EDBed, Ward,
    DailyPatient, LogPatient,
    PatientBed, PatientDoctor, PatientNurse, WardBed, WardDoctor, WardNurse,
)

DATASETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "datasets")


def _read_rows(filename):
    path = os.path.join(DATASETS, filename)
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _int(v, default=None):
    if v is None or str(v).strip() in ("", "nan", "None"):
        return default
    return int(float(v))


def _float(v, default=None):
    if v is None or str(v).strip() in ("", "nan", "None"):
        return default
    return float(v)


def _str_or_none(v):
    if v is None or str(v).strip() == "":
        return None
    return str(v)


def _raw_str(v, default=""):
    # Preserve the exact text (including "") for legacy string-typed columns
    # like patientNb/availabilityTimeStart — see db/models.py module docstring.
    if v is None:
        return default
    return str(v)


def _import(session, model, rows_exist_check, build_fn, rows):
    """Returns True if the table was empty and got freshly seeded this run,
    False if it already had data and was skipped."""
    existing = session.query(rows_exist_check).first()
    if existing is not None:
        print(f"  {model.__tablename__}: already populated, skipping")
        return False
    objects = [build_fn(r) for r in rows]
    if objects:
        session.bulk_save_objects(objects)
        session.commit()
    print(f"  {model.__tablename__}: inserted {len(objects)} rows (CSV had {len(rows)})")
    return True


def migrate():
    """Returns {csv_filename: freshly_seeded} — see _import()'s docstring.
    Consumed by verify_row_counts() to know which tables it may legitimately
    compare against their CSV, and which are live operational data it must
    leave alone."""
    seeded = {}
    session = SessionLocal()
    try:
        print("Users:")
        seeded["Users.csv"] = _import(session, User, User, lambda r: User(
            user_id=_int(r["user_id"]),
            username=r["username"],
            password_hash=r["password_hash"],
            name=_str_or_none(r.get("name")),
            role=r["role"],
            sections=_str_or_none(r.get("sections")),
            settings_tabs=_str_or_none(r.get("settings_tabs")),
            statistics_tabs=_str_or_none(r.get("statistics_tabs")),
        ), _read_rows("Users.csv"))

        print("Shifts:")
        seeded["Shifts.csv"] = _import(session, Shift, Shift, lambda r: Shift(
            shift_id=_int(r["shift_id"]),
            name=r["name"],
            start_hour=_int(r["start_hour"]),
            end_hour=_int(r["end_hour"]),
        ), _read_rows("Shifts.csv"))

        print("Groups:")
        seeded["Groups.csv"] = _import(session, Group, Group, lambda r: Group(
            group_id=_int(r["group_id"]),
            name=r["name"],
            days=r["days"],
        ), _read_rows("Groups.csv"))

        print("Wards:")
        seeded["Wards.csv"] = _import(session, Ward, Ward, lambda r: Ward(
            ward_id=_int(r["ward_id"]),
            ward_name=r["ward_name"],
            department_id=_int(r.get("department_id")),
        ), _read_rows("Wards.csv"))

        print("EDbeds:")
        # bed_status on disk only ever means something when it's "Under Repair";
        # any other persisted value (including stale "Occupied" data) is already
        # normalized to "Available" by bed_manager._condition() on every read —
        # replicate that same normalization here rather than relax the CHECK
        # constraint to accept a value the app never treats as meaningful.
        seeded["EDbeds.csv"] = _import(session, EDBed, EDBed, lambda r: EDBed(
            bed_id=_int(r["bed_id"]),
            bed_number=str(r["bed_number"]),
            bed_status="Under Repair" if _str_or_none(r.get("bed_status")) == "Under Repair" else "Available",
            type=_str_or_none(r.get("type")) or "normal",
        ), _read_rows("EDbeds.csv"))

        print("Doctors:")
        seeded["Doctors.csv"] = _import(session, Doctor, Doctor, lambda r: Doctor(
            id=_int(r["id"]),
            intern_or_not=r["intern_or_not"],
            shift=_str_or_none(r.get("shift")),
            work_days=_str_or_none(r.get("work_days")),
            patientNb=_raw_str(r.get("patientNb")),
            availabilityTimeStart=_raw_str(r.get("availabilityTimeStart")),
            name=_str_or_none(r.get("name")),
            absent=_raw_str(r.get("absent"), default="False") or "False",
        ), _read_rows("Doctors.csv"))

        print("Nurses:")
        seeded["Nurses.csv"] = _import(session, Nurse, Nurse, lambda r: Nurse(
            id=_int(r["id"]),
            role=r["role"],
            shift=_str_or_none(r.get("shift")),
            group=_str_or_none(r.get("group")),
            patientNB=_raw_str(r.get("patientNB")),
            availabilityTimeStart=_raw_str(r.get("availabilityTimeStart")),
            absent=_raw_str(r.get("absent"), default="False") or "False",
            name=_str_or_none(r.get("name")),
        ), _read_rows("Nurses.csv"))

        print("DailyPatients:")
        seeded["DailyPatients.csv"] = _import(session, DailyPatient, DailyPatient, lambda r: DailyPatient(
            stay_id=_int(r["stay_id"]),
            subject_id=_int(r["subject_id"]),
            name=_str_or_none(r.get("name")),
            gender=_str_or_none(r.get("gender")),
            age=_float(r.get("age")),
            temperature=_float(r.get("temperature")),
            heartrate=_float(r.get("heartrate")),
            resprate=_float(r.get("resprate")),
            o2sat=_float(r.get("o2sat")),
            sbp=_float(r.get("sbp")),
            dbp=_float(r.get("dbp")),
            pain=_str_or_none(r.get("pain")),
            acuity=_float(r.get("acuity")),
            chiefcomplaint=_str_or_none(r.get("chiefcomplaint")),
            arrival_time=_str_or_none(r.get("arrival_time")),
            departure_time=_str_or_none(r.get("departure_time")),
            bed_occupation_time=_str_or_none(r.get("bed_occupation_time")),
            unurgent=_str_or_none(r.get("unurgent")),
        ), _read_rows("DailyPatients.csv"))

        print("LogPatients:")
        seeded["LogPatients.csv"] = _import(session, LogPatient, LogPatient, lambda r: LogPatient(
            subject_id=_int(r["subject_id"]),
            stay_id=_int(r["stay_id"]),
            name=_str_or_none(r.get("name")),
            gender=_str_or_none(r.get("gender")),
            age=_float(r.get("age")),
            temperature=_float(r.get("temperature")),
            heartrate=_float(r.get("heartrate")),
            resprate=_float(r.get("resprate")),
            o2sat=_float(r.get("o2sat")),
            sbp=_float(r.get("sbp")),
            dbp=_float(r.get("dbp")),
            pain=_str_or_none(r.get("pain")),
            acuity=_float(r.get("acuity")),
            chiefcomplaint=_str_or_none(r.get("chiefcomplaint")),
            arrival_time=_str_or_none(r.get("arrival_time")),
            departure_time=_str_or_none(r.get("departure_time")),
            bed_occupation_time=_str_or_none(r.get("bed_occupation_time")),
        ), _read_rows("LogPatients.csv"))

        print("Relation tables:")
        seeded["patient_bed.csv"] = _import(session, PatientBed, PatientBed, lambda r: PatientBed(
            patient_id=_int(r["patient_id"]), bed_id=_int(r["bed_id"]),
        ), _read_rows("patient_bed.csv"))
        seeded["patient_doctor.csv"] = _import(session, PatientDoctor, PatientDoctor, lambda r: PatientDoctor(
            patient_id=_int(r["patient_id"]), doctor_id=_int(r["doctor_id"]),
        ), _read_rows("patient_doctor.csv"))
        seeded["patient_nurse.csv"] = _import(session, PatientNurse, PatientNurse, lambda r: PatientNurse(
            patient_id=_int(r["patient_id"]), nurse_id=_int(r["nurse_id"]),
        ), _read_rows("patient_nurse.csv"))
        seeded["ward_bed.csv"] = _import(session, WardBed, WardBed, lambda r: WardBed(
            ward_id=_int(r["ward_id"]), bed_id=_int(r["bed_id"]),
        ), _read_rows("ward_bed.csv"))
        seeded["ward_doctor.csv"] = _import(session, WardDoctor, WardDoctor, lambda r: WardDoctor(
            ward_id=_int(r["ward_id"]), doctor_id=_int(r["doctor_id"]),
        ), _read_rows("ward_doctor.csv"))
        seeded["ward_nurse.csv"] = _import(session, WardNurse, WardNurse, lambda r: WardNurse(
            ward_id=_int(r["ward_id"]), nurse_id=_int(r["nurse_id"]),
        ), _read_rows("ward_nurse.csv"))

        return seeded
    finally:
        session.close()


def verify_row_counts(seeded):
    # Only checks tables migrate() actually seeded fresh this run (empty ->
    # imported). Tables that were already populated and skipped are live
    # operational data now — the app is expected to keep changing their row
    # counts (admissions, discharges, bed assignments), so comparing them
    # against the build-time CSV would produce a false failure on every
    # restart after go-live. See module docstring.
    print("\nRow-count parity check (CSV vs. table, freshly-seeded tables only):")
    checks = [
        ("Users.csv", User),
        ("Shifts.csv", Shift),
        ("Groups.csv", Group),
        ("Wards.csv", Ward),
        ("EDbeds.csv", EDBed),
        ("Doctors.csv", Doctor),
        ("Nurses.csv", Nurse),
        ("DailyPatients.csv", DailyPatient),
        ("LogPatients.csv", LogPatient),
        ("patient_bed.csv", PatientBed),
        ("patient_doctor.csv", PatientDoctor),
        ("patient_nurse.csv", PatientNurse),
        ("ward_bed.csv", WardBed),
        ("ward_doctor.csv", WardDoctor),
        ("ward_nurse.csv", WardNurse),
    ]
    session = SessionLocal()
    try:
        all_ok = True
        for filename, model in checks:
            if not seeded.get(filename):
                print(f"  {filename:<22} already populated — skipping (live operational data)")
                continue
            csv_count = len(_read_rows(filename))
            db_count = session.query(model).count()
            status = "OK" if csv_count == db_count else "MISMATCH"
            if csv_count != db_count:
                all_ok = False
            print(f"  {filename:<22} csv={csv_count:<6} db={db_count:<6} {status}")
        return all_ok
    finally:
        session.close()


if __name__ == "__main__":
    seeded_tables = migrate()
    ok = verify_row_counts(seeded_tables)
    sys.exit(0 if ok else 1)

# =============================================================================
# scripts/import_ml_historical_data.py — One-time ML historical data import
# =============================================================================
#
# Loads edstays_with_synth.csv (~425k rows) and meteo.csv (~3.3k rows) into the
# HistoricalEdStays / DailyWeather SQL Server tables for Stage 2 (flow_prediction
# model retraining). Idempotent: skips a table if it already has rows.
#
# Run from backend/:  .venv\Scripts\python.exe scripts\import_ml_historical_data.py
# =============================================================================

import os
import sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.session import engine, SessionLocal
from db.models import HistoricalEdStay, DailyWeather

DATASETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "datasets")


def _clean(df):
    # Replace NaN/NaT with None so pyodbc doesn't choke on IEEE NaN
    return df.astype(object).where(pd.notnull(df), None)


def import_ed_stays():
    with SessionLocal() as session:
        if session.query(HistoricalEdStay).first() is not None:
            print("HistoricalEdStays: already populated, skipping")
            return

    path = os.path.join(DATASETS, "edstays_with_synth.csv")
    df = pd.read_csv(path)
    csv_rows = len(df)

    for col in ("intime", "outtime", "intime_synth", "outtime_synth"):
        df[col] = pd.to_datetime(df[col], errors="coerce")
    for col in ("subject_id", "hadm_id", "stay_id"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.rename(columns={})[[
        "subject_id", "hadm_id", "stay_id", "intime", "outtime", "gender", "race",
        "arrival_transport", "disposition", "los_seconds",
        "intime_synth", "outtime_synth", "season_synth",
    ]]
    df = _clean(df)

    df.to_sql("HistoricalEdStays", engine, if_exists="append", index=False, chunksize=5000)

    with SessionLocal() as session:
        db_rows = session.query(HistoricalEdStay).count()
    print(f"HistoricalEdStays: inserted rows (csv={csv_rows}, db={db_rows}) {'OK' if csv_rows == db_rows else 'MISMATCH'}")


def import_weather():
    with SessionLocal() as session:
        if session.query(DailyWeather).first() is not None:
            print("DailyWeather: already populated, skipping")
            return

    path = os.path.join(DATASETS, "meteo.csv")
    df = pd.read_csv(path)
    csv_rows = len(df)

    df = df.rename(columns={"precipitation_sum (mm)": "precipitation_sum_mm"})
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df[["time", "temperature_2m_mean", "temperature_2m_min", "temperature_2m_max", "precipitation_sum_mm"]]
    df = _clean(df)

    df.to_sql("DailyWeather", engine, if_exists="append", index=False, chunksize=5000)

    with SessionLocal() as session:
        db_rows = session.query(DailyWeather).count()
    print(f"DailyWeather: inserted rows (csv={csv_rows}, db={db_rows}) {'OK' if csv_rows == db_rows else 'MISMATCH'}")


if __name__ == "__main__":
    import_ed_stays()
    import_weather()

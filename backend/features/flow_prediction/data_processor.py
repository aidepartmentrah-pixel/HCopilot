# =============================================================================
# flow_prediction/data_processor.py — ED Data Feature Engineering
# =============================================================================
#
# Prepares the historical Emergency Department stay data for the XGBoost
# patient-flow model in two steps:
#
#   Step 1 — load_and_prepare_data()
#     Reads ED stay records (HistoricalEdStays table) and resamples them to a
#     daily count of patient arrivals (column "y").  Merges with daily average
#     temperature data (DailyWeather table) so the model can learn weather-related patterns.
#
#   Step 2 — create_features()
#     Engineers the time-series features the XGBoost model expects:
#       - Calendar features : dayofweek, month, weekofyear
#       - Lag features      : y_lag_1 (yesterday), y_lag_7 (same day last week)
#       - Rolling mean      : y_roll_7 (7-day moving average)
#     The first 7 rows are dropped because lag/rolling features cannot be computed
#     without at least 7 prior observations.
#
# WHY NOT USE PROPHET OR ARIMA?
#   The model is a gradient-boosted tree (XGBoost) rather than a classical
#   time-series model.  This means we must manually engineer all temporal
#   structure as numeric features — hence the lag and rolling-window columns.
#   The trade-off is that XGBoost does not extrapolate trends but is robust to
#   irregular patterns in the feature space (day-of-week, weather, etc.).
#
# prepare_prediction_data() is a helper kept for reference; the actual
# prediction logic lives in api.py's auto-regressive loop.
#
# DATA SOURCE: HistoricalEdStays / DailyWeather (SQL Server, see db/models.py) —
# originally edstays_with_synth.csv / meteo.csv, migrated in Stage 2.
# =============================================================================

import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from db.session import SessionLocal
from db.models import HistoricalEdStay, DailyWeather


class FlowDataProcessor:
    """
    Reads historical ED stay data from SQL Server and produces the
    feature-engineered DataFrame consumed by the XGBoost patient-flow model.

    The processor is stateless between calls — each method reads from the
    database and returns a new DataFrame without caching.  Caching is handled
    at the api.py level via the _ml_df module variable.
    """

    def __init__(self, datasets_folder=None):
        # datasets_folder kept for backward-compatible construction
        # (FlowDataProcessor(DATASETS_FOLDER)); unused now that data lives in SQL Server.
        pass

    def load_and_prepare_data(self):
        """
        Load ED stay records, resample to daily counts, and merge with weather.

        The ED stay table records individual patient visits.  This method groups
        them by arrival date (intime_synth truncated to the day) and counts
        the arrivals per day, producing the target variable "y".

        Weather data from DailyWeather is averaged to a daily temperature and
        left-joined onto the daily arrivals so days without weather data are
        still included (with NaN temperature, which the model handles).

        Returns:
            pd.DataFrame with columns: ds (date), y (daily arrival count),
            temperature_2m_mean (average temperature for that day).
        """
        with SessionLocal() as session:
            intimes = [r[0] for r in session.query(HistoricalEdStay.intime_synth).all()]
            weather_rows = session.query(DailyWeather.time, DailyWeather.temperature_2m_mean).all()

        df = pd.DataFrame({"intime_synth": intimes})
        df["visitdate"] = pd.to_datetime(df["intime_synth"])

        # Count arrivals per calendar day and rename for Prophet-style ds/y convention
        daily_arrivals = (
            df.set_index("visitdate")
              .resample("D")
              .size()
              .reset_index(name="y")
              .rename(columns={"visitdate": "ds"})
        )

        dfWeather = pd.DataFrame(weather_rows, columns=["time", "temperature_2m_mean"])
        dfWeather["date"] = pd.to_datetime(dfWeather["time"])

        # Compute a single average temperature per day (meteo may have sub-daily records)
        daily_temp = (
            dfWeather.groupby("date", as_index=False)
                     .agg({"temperature_2m_mean": "mean"})
                     .rename(columns={"date": "ds"})
        )

        # Left-join so days without weather data are still included in the result
        master_df = daily_arrivals.merge(daily_temp, on="ds", how="left")
        master_df["ds"] = pd.to_datetime(master_df["ds"])
        return master_df

    def create_features(self, master_df):
        """
        Engineer lag, rolling, and calendar features from the prepared daily DataFrame.

        Features added:
          - dayofweek  : 0=Monday … 6=Sunday (captures weekly seasonality)
          - month      : 1–12 (captures annual seasonality)
          - weekofyear : ISO week number (1–53)
          - y_lag_1    : previous day's patient count (most predictive lag)
          - y_lag_7    : count from the same day last week (captures weekly pattern)
          - y_roll_7   : 7-day rolling mean (smooths short-term noise)

        The first 7 rows must be dropped because lag-7 and roll-7 require 7
        prior observations and would otherwise be NaN.

        Args:
            master_df : DataFrame returned by load_and_prepare_data().

        Returns:
            pd.DataFrame with all original columns plus the engineered features,
            with the first 7 rows removed.
        """
        ml_df = master_df.copy().rename(columns={"ds": "date"})
        ml_df["date"] = pd.to_datetime(ml_df["date"])

        # Calendar features
        ml_df["dayofweek"]  = ml_df["date"].dt.dayofweek
        ml_df["month"]      = ml_df["date"].dt.month
        ml_df["weekofyear"] = ml_df["date"].dt.isocalendar().week.astype(int)

        # Lag features — shift() moves values forward, so y_lag_1[i] = y[i-1]
        ml_df["y_lag_1"]  = ml_df["y"].shift(1)
        ml_df["y_lag_7"]  = ml_df["y"].shift(7)
        ml_df["y_roll_7"] = ml_df["y"].rolling(7).mean()

        # Drop rows with NaN lags (first 7 rows cannot be fully computed)
        ml_df.dropna(inplace=True)
        return ml_df

    def prepare_prediction_data(self, n_days=30):
        """
        Build a future DataFrame for n_days ahead with bootstrapped lag values.

        This method illustrates the full auto-regressive bootstrapping logic.
        In practice the api.py predict endpoint implements its own inline version
        of this loop so it can update pred_history incrementally without holding
        all future rows in memory at once.

        Lag bootstrapping strategy:
          - Days 1–7 : lags reference the real historical tail (last 7 actual values)
          - Day 8+   : lags reference previously predicted values (y_pred column)

        Args:
            n_days : Number of future days to prepare (default 30).

        Returns:
            Tuple of (ml_df, future_df) where ml_df is the historical feature
            DataFrame and future_df has one row per future day with engineered
            features and bootstrapped lag values.
        """
        master_df = self.load_and_prepare_data()
        ml_df     = self.create_features(master_df)

        last_date    = ml_df["date"].max()
        future_dates = pd.date_range(start=last_date + timedelta(days=1), periods=n_days, freq="D")

        # Use the 7-day average temperature as a constant proxy for future weather
        last_temp = ml_df["temperature_2m_mean"].iloc[-7:].mean()

        future_data = []
        for date in future_dates:
            future_data.append({
                "date":                 date,
                "temperature_2m_mean":  last_temp,
                "dayofweek":            date.dayofweek,
                "month":                date.month,
                "weekofyear":           date.isocalendar().week,
            })
        future_df = pd.DataFrame(future_data)

        last_y = ml_df["y"].iloc[-7:].values
        for i in range(len(future_df)):
            if i == 0:
                # First future day: all lags from real history
                future_df.loc[i, "y_lag_1"]  = last_y[-1]
                future_df.loc[i, "y_lag_7"]  = last_y[-7] if len(last_y) >= 7 else last_y[0]
                future_df.loc[i, "y_roll_7"] = last_y.mean()
            else:
                # Use previously predicted value as the lag for subsequent days
                future_df.loc[i, "y_lag_1"] = future_df.loc[i-1, "y_pred"] if i > 0 and "y_pred" in future_df.columns else last_y[-1]
                future_df.loc[i, "y_lag_7"] = last_y[-(7-i)] if i < 7 else future_df.loc[i-7, "y_pred"]
                # Rolling mean: mix of real tail and predicted values
                recent_vals = list(last_y[-(7-i):]) if i < 7 else []
                recent_vals += list(future_df.loc[max(0, i-7):i-1, "y_pred"]) if i > 0 and "y_pred" in future_df.columns else []
                future_df.loc[i, "y_roll_7"] = np.mean(recent_vals) if recent_vals else last_y.mean()

        return ml_df, future_df

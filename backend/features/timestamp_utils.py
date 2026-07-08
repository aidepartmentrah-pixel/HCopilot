# =============================================================================
# timestamp_utils.py — Shared CSV and Timestamp Utilities
# =============================================================================
#
# This module is imported by many feature managers.  It provides two categories
# of helpers:
#
#   1. safe_read_csv  — a wrapper around pd.read_csv that returns an empty
#      DataFrame (with the correct column schema) instead of raising an error
#      when a file is missing, newly created (0 bytes), or malformed.
#
#   2. Timestamp validators — validate_timestamp_order and validate_discharge_time
#      enforce the temporal ordering rule:
#          arrival_time ≤ bed_occupation_time ≤ departure_time
#      Both raise HTTP 400 with a human-readable message if a violation is found.
#
# WHY TWO SEPARATE VALIDATORS?
#   validate_timestamp_order is used when creating or editing patient records
#   where ALL three timestamps are user-supplied and should all be valid.
#
#   validate_discharge_time is used specifically during discharge.  At discharge
#   time the bed_occupation_time may already be stored with a bad value (e.g.
#   entered before the system enforced ordering).  Silently skipping an invalid
#   stored bed_occupation_time avoids blocking a valid discharge due to legacy
#   data entry errors.
# =============================================================================

from datetime import datetime
from fastapi import HTTPException
import pandas as pd


def safe_read_csv(path: str, columns: list) -> pd.DataFrame:
    """
    Read a CSV file and return its contents as a DataFrame.

    Unlike a bare pd.read_csv call, this function handles three graceful-
    failure cases that are common in this project:
      - File doesn't exist yet (first run before any data has been entered).
      - File was just created with only a header row and is technically empty.
      - File is corrupt / unparseable.

    In all failure cases an empty DataFrame with the supplied column schema is
    returned so callers can always iterate over rows without a None/crash guard.

    Args:
        path    : Absolute path to the CSV file to read.
        columns : List of column names to use for the fallback empty DataFrame.

    Returns:
        A pandas DataFrame containing the file's rows, or an empty DataFrame
        with the given columns if the file cannot be read.
    """
    try:
        return pd.read_csv(path)
    except (pd.errors.EmptyDataError, pd.errors.ParserError):
        # EmptyDataError  → file exists but has no parseable content (e.g. 0 bytes)
        # ParserError     → file is malformed / truncated
        return pd.DataFrame(columns=columns)


def _parse_ts(ts):
    """
    Parse a timestamp value that may come from user input or a CSV cell.

    Returns a datetime object if parsing succeeds, or None if the value is
    absent, blank, or not ISO-8601 formatted.  This is intentionally lenient
    so that callers only validate pairs where both sides have a real value.

    Args:
        ts : Any value — typically a string, NaN float, or None from a DataFrame cell.

    Returns:
        datetime or None.
    """
    if ts is None:
        return None
    s = str(ts).strip()
    # Treat empty strings and sentinel text values as "no timestamp provided"
    if not s or s.lower() in ('nan', 'none', 'nat'):
        return None
    try:
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        # Unparseable format — treat as absent rather than crashing
        return None


def validate_timestamp_order(arrival_time=None, bed_occupation_time=None, departure_time=None):
    """
    Validate that the three patient timestamps are in chronological order.

    Rule:  arrival ≤ bed_occupation ≤ departure
    Equal timestamps are allowed (a patient could arrive and be bedded simultaneously).
    Only pairs where BOTH values are non-null are checked; missing timestamps are skipped.

    This function is called when creating or editing a patient record where the user
    has full control over all three fields.

    Args:
        arrival_time        : ISO datetime string for when the patient arrived, or None.
        bed_occupation_time : ISO datetime string for when the patient was bedded, or None.
        departure_time      : ISO datetime string for when the patient was discharged, or None.

    Raises:
        HTTPException(400) : If any validated timestamp pair is out of order.
    """
    arr = _parse_ts(arrival_time)
    bed = _parse_ts(bed_occupation_time)
    dep = _parse_ts(departure_time)

    # Helper to format datetimes in error messages consistently
    fmt = lambda dt: dt.strftime('%Y-%m-%d %H:%M')

    if arr and bed and bed < arr:
        raise HTTPException(
            status_code=400,
            detail=f"Bed occupation time ({fmt(bed)}) must be at or after arrival time ({fmt(arr)})"
        )
    if bed and dep and dep < bed:
        raise HTTPException(
            status_code=400,
            detail=f"Departure time ({fmt(dep)}) must be at or after bed occupation time ({fmt(bed)})"
        )
    if arr and dep and not bed and dep < arr:
        # When there is no bed_occupation_time, departure must still be after arrival
        raise HTTPException(
            status_code=400,
            detail=f"Departure time ({fmt(dep)}) must be at or after arrival time ({fmt(arr)})"
        )


def validate_discharge_time(arrival_time=None, bed_occupation_time=None, departure_time=None):
    """
    Validate a new departure_time against the patient's stored arrival and bed times.

    This is a discharge-specific validator that differs from validate_timestamp_order
    in one important way: if the stored bed_occupation_time is itself invalid
    (earlier than arrival_time), it is silently ignored rather than blocking the
    discharge.  This handles the case where bad data was entered before the system
    enforced ordering, and we do not want to permanently trap the record.

    Args:
        arrival_time        : Stored ISO arrival datetime string, or None.
        bed_occupation_time : Stored ISO bed occupation datetime string, or None.
        departure_time      : New departure datetime string to validate, or None.

    Raises:
        HTTPException(400) : If departure is before arrival, or before a valid bed time.
    """
    arr = _parse_ts(arrival_time)
    bed = _parse_ts(bed_occupation_time)
    dep = _parse_ts(departure_time)

    # Nothing to validate if no departure time was provided
    if not dep:
        return

    fmt = lambda dt: dt.strftime('%Y-%m-%d %H:%M')

    # Discard the stored bed_occupation_time if it is already invalid (before arrival).
    # This prevents legacy bad data from blocking a valid discharge operation.
    if bed and arr and bed < arr:
        bed = None

    if arr and dep and dep < arr:
        raise HTTPException(
            status_code=400,
            detail=f"Departure time ({fmt(dep)}) must be at or after arrival time ({fmt(arr)})"
        )
    if bed and dep and dep < bed:
        raise HTTPException(
            status_code=400,
            detail=f"Departure time ({fmt(dep)}) must be at or after bed occupation time ({fmt(bed)})"
        )

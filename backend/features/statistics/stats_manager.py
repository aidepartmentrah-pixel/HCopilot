# Statistics manager — aggregates and computes metrics from DailyPatients.csv
# (active patients) and LogPatients.csv (discharged archive).
#
# All computation happens on-the-fly: no caching, no background tasks.
# The module-level helpers handle shared parsing and data-quality filtering
# so that every public method operates on clean, consistent data.
#
# Data-quality caps enforced throughout:
#   wait_time > 1440 min  (24 h)  → treated as a data-entry error, excluded
#   LOS       > 10080 min (7 days) → treated as a test artifact, excluded
#
# These caps prevent a handful of bogus rows from skewing averages while still
# preserving the vast majority of real clinical observations.

import os
import math
import pandas as pd
from datetime import datetime

_DS = os.path.join(os.path.dirname(__file__), "..", "..", "datasets")

DAILY_FILE   = os.path.join(_DS, "DailyPatients.csv")
LOG_FILE     = os.path.join(_DS, "LogPatients.csv")
BEDS_FILE    = os.path.join(_DS, "EDbeds.csv")
PB_FILE      = os.path.join(_DS, "patient_bed.csv")
NURSES_FILE  = os.path.join(_DS, "Nurses.csv")
DOCTORS_FILE = os.path.join(_DS, "Doctors.csv")
PN_FILE      = os.path.join(_DS, "patient_nurse.csv")
PD_FILE      = os.path.join(_DS, "patient_doctor.csv")
WARDS_FILE   = os.path.join(_DS, "Wards.csv")
WARD_BED_FILE = os.path.join(_DS, "ward_bed.csv")


def _parse_minutes(start, end):
    """
    Compute the elapsed minutes between two ISO-format timestamp strings.

    Returns None if either value is unparseable or if the computed difference is
    negative (end before start), so callers can filter without crashing.

    Args:
        start: ISO datetime string for the earlier event (e.g. arrival_time).
        end:   ISO datetime string for the later event (e.g. bed_occupation_time).

    Returns:
        float: elapsed minutes (>= 0), or None on parse error or negative diff.
    """
    try:
        t1 = datetime.fromisoformat(str(start).strip())
        t2 = datetime.fromisoformat(str(end).strip())
        diff = (t2 - t1).total_seconds() / 60
        return diff if diff >= 0 else None
    except Exception:
        return None


def _safe_float(v):
    """
    Coerce a value to float, returning None for NaN or unconvertible inputs.

    Used when extracting numeric vitals from CSV rows where the column may
    contain empty strings, 'nan', or other non-numeric artefacts from pandas.
    """
    if v is None:
        return None
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def _read_daily():
    """
    Load DailyPatients.csv into a DataFrame, coercing timestamp columns to object
    dtype to prevent pandas from silently converting them to NaT.

    Returns an empty DataFrame (no columns) when the file does not exist.
    """
    if not os.path.exists(DAILY_FILE):
        return pd.DataFrame()
    df = pd.read_csv(DAILY_FILE)
    for col in ("arrival_time", "departure_time", "bed_occupation_time"):
        if col in df.columns:
            df[col] = df[col].astype(object)
    return df


def _read_log():
    """
    Load LogPatients.csv into a DataFrame, coercing timestamp columns to object
    dtype.  The log holds discharged patients and is the source of truth for LOS
    calculations.

    Returns an empty DataFrame (no columns) when the file does not exist.
    """
    if not os.path.exists(LOG_FILE):
        return pd.DataFrame()
    df = pd.read_csv(LOG_FILE)
    for col in ("arrival_time", "departure_time", "bed_occupation_time"):
        if col in df.columns:
            df[col] = df[col].astype(object)
    return df


def _collect_wait_minutes(df):
    """
    Extract valid wait-to-bed durations (in minutes) from a patient DataFrame.

    A waiting time is considered valid when:
    - Both arrival_time and bed_occupation_time are present and non-empty.
    - The computed duration is between 0 and 1440 minutes (24 h).

    Values exceeding 1440 minutes are silently dropped as data-entry errors —
    they are not counted as outliers or flagged; they simply do not contribute
    to any statistic.

    Args:
        df: patient DataFrame containing arrival_time and bed_occupation_time columns.

    Returns:
        list[float]: list of valid wait durations in minutes.
    """
    results = []
    for _, row in df.iterrows():
        arr = row.get("arrival_time")
        bed = row.get("bed_occupation_time")
        if pd.notna(arr) and pd.notna(bed) and str(arr).strip() and str(bed).strip():
            m = _parse_minutes(arr, bed)
            # cap at 24 h — longer values indicate data-entry errors
            if m is not None and 0 <= m <= 1440:
                results.append(m)
    return results


def _collect_los_hours(df):
    """
    Extract valid length-of-stay values (in hours) from a discharged patient DataFrame.

    A LOS value is considered valid when:
    - Both arrival_time and departure_time are present and non-empty.
    - The computed duration is between 0 and 10080 minutes (7 days).

    Values exceeding 10080 minutes are silently dropped as test artifacts.

    Args:
        df: discharged patient DataFrame (typically from LogPatients.csv)
            containing arrival_time and departure_time columns.

    Returns:
        list[float]: list of valid LOS values in hours.
    """
    results = []
    for _, row in df.iterrows():
        arr = row.get("arrival_time")
        dep = row.get("departure_time")
        if pd.notna(arr) and pd.notna(dep) and str(arr).strip() and str(dep).strip():
            m = _parse_minutes(arr, dep)
            # cap at 7 days — longer values are test artifacts
            if m is not None and 0 < m <= 10080:
                results.append(m / 60)
    return results


def _audit_timestamps(df):
    """
    Scan a combined patient DataFrame for timestamp integrity issues.

    Three categories of problems are counted independently:
    - missing_arrival:    rows where arrival_time is absent or blank.
    - inverted_bed:       rows where bed_occupation_time precedes arrival_time.
    - inverted_departure: rows where departure_time is at or before arrival_time.

    Rows with valid LOS (0 < minutes <= 10080) and valid wait (0 <= minutes <= 1440)
    are counted separately to support the quality-percentage calculation.

    Args:
        df: combined DataFrame (DailyPatients + LogPatients).

    Returns:
        dict with keys: total, missing_arrival, inverted_bed, inverted_departure,
        valid_los_samples, valid_wait_samples.
    """
    total = len(df)
    missing_arrival   = 0
    inverted_bed      = 0  # bed_occupation before arrival
    inverted_departure = 0  # departure before arrival
    valid_los         = 0
    valid_wait        = 0

    for _, row in df.iterrows():
        arr = row.get("arrival_time")
        dep = row.get("departure_time")
        bed = row.get("bed_occupation_time")

        has_arr = pd.notna(arr) and str(arr).strip()
        has_dep = pd.notna(dep) and str(dep).strip()
        has_bed = pd.notna(bed) and str(bed).strip()

        if not has_arr:
            missing_arrival += 1
            continue

        if has_bed:
            m = _parse_minutes(arr, bed)
            if m is None or m < 0:
                inverted_bed += 1
            elif m <= 1440:
                valid_wait += 1

        if has_dep:
            m = _parse_minutes(arr, dep)
            if m is None or m <= 0:
                inverted_departure += 1
            elif m <= 10080:
                valid_los += 1

    return {
        "total":               total,
        "missing_arrival":     missing_arrival,
        "inverted_bed":        inverted_bed,
        "inverted_departure":  inverted_departure,
        "valid_los_samples":   valid_los,
        "valid_wait_samples":  valid_wait,
    }


class StatsManager:
    """
    Stateless aggregator for emergency-department statistics.

    All seven public methods read their source data from disk on every call
    (DailyPatients.csv for live data, LogPatients.csv for historical data).
    There is no internal state — StatsManager can safely be instantiated as a
    module-level singleton without thread-safety concerns.

    Public methods:
        overview()           — headline KPIs (counts, averages, occupancy)
        data_quality()       — timestamp integrity audit
        waiting_times()      — wait-to-bed and LOS distributions
        acuity_breakdown()   — per-ESI-level stats
        throughput()         — arrivals by hour / day-of-week
        top_complaints()     — most frequent chief complaints
        vitals_summary()     — mean/min/max of six vital signs
    """

    def data_quality(self):
        """
        Audit timestamp integrity across the combined patient history.

        Counts rows with missing arrival_time, inverted bed-occupation timestamps,
        or inverted departure timestamps.  Also computes a quality percentage:
        (clean_rows / total_rows) * 100, where a 'clean' row has a valid arrival
        and either no departure or a non-negative departure gap.

        Note: a row is counted in at most one problem bucket even if multiple
        issues exist, because the audit loop moves on after finding the first
        problem per row.

        Returns:
            dict with keys: total_records, clean_records, quality_pct,
            missing_arrival, inverted_bed, inverted_departure,
            valid_los_samples, valid_wait_samples.
        """
        log   = _read_log()
        daily = _read_daily()
        combined = pd.concat([daily, log], ignore_index=True) if (len(daily) + len(log)) > 0 else pd.DataFrame()
        audit = _audit_timestamps(combined)
        total = audit["total"]
        broken = audit["missing_arrival"] + audit["inverted_bed"] + audit["inverted_departure"]
        # deduplicate: a row counted in multiple buckets is still one broken row
        # re-count cleanly
        clean_rows = 0
        for _, row in combined.iterrows():
            arr = row.get("arrival_time")
            dep = row.get("departure_time")
            bed = row.get("bed_occupation_time")
            has_arr = pd.notna(arr) and str(arr).strip()
            has_dep = pd.notna(dep) and str(dep).strip()
            ok = True
            if not has_arr:
                ok = False
            else:
                if has_dep and (_parse_minutes(arr, dep) or -1) <= 0:
                    ok = False
            if ok:
                clean_rows += 1

        quality_pct = round(clean_rows / total * 100, 1) if total > 0 else 0
        return {
            "total_records":      total,
            "clean_records":      clean_rows,
            "quality_pct":        quality_pct,
            "missing_arrival":    audit["missing_arrival"],
            "inverted_bed":       audit["inverted_bed"],
            "inverted_departure": audit["inverted_departure"],
            "valid_los_samples":  audit["valid_los_samples"],
            "valid_wait_samples": audit["valid_wait_samples"],
        }

    def overview(self):
        """
        Return headline emergency-department KPIs.

        Reads both DailyPatients (for live counts and current acuity) and
        LogPatients (for LOS history).  Wait times include active patients
        who already have a bed_occupation_time recorded.

        Occupancy rate is derived from EDbeds.csv (total beds) versus the
        patient_bed.csv relation table (currently assigned beds).  The result
        is clamped to [0, 100] because chariot beds created after EDbeds.csv
        was last read could temporarily push the raw ratio above 1.

        Returns:
            dict with keys:
                active_patients       — current row count in DailyPatients
                historical_patients   — current row count in LogPatients
                avg_wait_to_bed_min   — mean wait time in minutes (None if no data)
                avg_los_hours         — mean LOS in hours from log (None if no data)
                occupancy_rate        — % of beds currently occupied (None if no bed data)
                avg_acuity            — mean numeric acuity of active patients (None if no data)
                long_wait_pct         — % of patients who waited > 240 min (None if no data)
                wait_sample_count     — number of valid wait measurements used
                los_sample_count      — number of valid LOS measurements used
        """
        daily = _read_daily()
        log   = _read_log()

        active_count     = len(daily)
        historical_count = len(log)

        # Wait time: both active and discharged (need arrival + bed_occupation)
        all_df = pd.concat([daily, log], ignore_index=True) if (len(daily) + len(log)) > 0 else pd.DataFrame()
        wait_minutes = _collect_wait_minutes(all_df) if len(all_df) > 0 else []
        los_hours    = _collect_los_hours(log) if len(log) > 0 else []

        avg_wait = round(sum(wait_minutes) / len(wait_minutes), 1) if wait_minutes else None
        avg_los  = round(sum(los_hours) / len(los_hours), 2) if los_hours else None

        long_waits = sum(1 for w in wait_minutes if w > 240)
        long_wait_pct = round(long_waits / len(wait_minutes) * 100, 1) if wait_minutes else None

        # Occupancy rate from beds + patient_bed relation
        occupancy_rate = None
        if os.path.exists(BEDS_FILE):
            beds = pd.read_csv(BEDS_FILE)
            total_beds = len(beds)
            if total_beds > 0 and os.path.exists(PB_FILE):
                pb = pd.read_csv(PB_FILE)
                occupied = len(pb["bed_id"].unique()) if "bed_id" in pb.columns else 0
                occupancy_rate = round(min(occupied, total_beds) / total_beds * 100, 1)

        # Average acuity of current patients
        avg_acuity = None
        if len(daily) > 0 and "acuity" in daily.columns:
            vals = pd.to_numeric(daily["acuity"], errors="coerce").dropna().tolist()
            avg_acuity = round(sum(vals) / len(vals), 2) if vals else None

        return {
            "active_patients":       active_count,
            "historical_patients":   historical_count,
            "avg_wait_to_bed_min":   avg_wait,
            "avg_los_hours":         avg_los,
            "occupancy_rate":        occupancy_rate,
            "avg_acuity":            avg_acuity,
            "long_wait_pct":         long_wait_pct,
            "wait_sample_count":     len(wait_minutes),
            "los_sample_count":      len(los_hours),
        }

    def waiting_times(self):
        """
        Return detailed wait-to-bed and length-of-stay distributions.

        Wait durations are bucketed into six ranges (0–30 min through >8 h).
        LOS values (from discharged patients only) are bucketed into five ranges
        (<4 h through >24 h).

        The median wait is computed as the value at the midpoint of the sorted
        list (not interpolated), which is sufficient for ED reporting purposes.

        Returns:
            dict with:
                wait_to_bed.distribution   — counts per time bucket
                wait_to_bed.avg_minutes    — mean wait in minutes
                wait_to_bed.median_minutes — median wait (midpoint of sorted list)
                wait_to_bed.sample_count   — number of valid measurements
                length_of_stay.distribution — counts per time bucket
                length_of_stay.avg_hours    — mean LOS in hours
                length_of_stay.sample_count — number of valid measurements
        """
        daily = _read_daily()
        log   = _read_log()
        all_df = pd.concat([daily, log], ignore_index=True) if (len(daily) + len(log)) > 0 else pd.DataFrame()

        wait_dist = {"0-30 min": 0, "30-60 min": 0, "1-2 h": 0, "2-4 h": 0, "4-8 h": 0, ">8 h": 0}
        wait_vals = []
        for m in (_collect_wait_minutes(all_df) if len(all_df) > 0 else []):
            wait_vals.append(round(m, 1))
            if   m <=  30: wait_dist["0-30 min"]  += 1
            elif m <=  60: wait_dist["30-60 min"]  += 1
            elif m <= 120: wait_dist["1-2 h"]      += 1
            elif m <= 240: wait_dist["2-4 h"]      += 1
            elif m <= 480: wait_dist["4-8 h"]      += 1
            else:          wait_dist[">8 h"]        += 1

        los_dist = {"<4 h": 0, "4-8 h": 0, "8-12 h": 0, "12-24 h": 0, ">24 h": 0}
        los_vals = []
        for h in (_collect_los_hours(log) if len(log) > 0 else []):
            los_vals.append(round(h, 2))
            if   h <  4: los_dist["<4 h"]    += 1
            elif h <  8: los_dist["4-8 h"]   += 1
            elif h < 12: los_dist["8-12 h"]  += 1
            elif h < 24: los_dist["12-24 h"] += 1
            else:        los_dist[">24 h"]   += 1

        sorted_wait = sorted(wait_vals)
        median_wait = round(sorted_wait[len(sorted_wait) // 2], 1) if sorted_wait else None

        return {
            "wait_to_bed": {
                "distribution": wait_dist,
                "avg_minutes":    round(sum(wait_vals) / len(wait_vals), 1) if wait_vals else None,
                "median_minutes": median_wait,
                "sample_count":   len(wait_vals),
            },
            "length_of_stay": {
                "distribution": los_dist,
                "avg_hours":    round(sum(los_vals) / len(los_vals), 2) if los_vals else None,
                "sample_count": len(los_vals),
            },
        }

    def acuity_breakdown(self):
        """
        Return per-ESI-level statistics across the combined patient population.

        Iterates ESI levels 1–5 and for each level counts all patients (active +
        discharged), computes average wait-to-bed time, and computes average LOS
        from discharged patients only (active patients have no departure_time yet).

        ESI label map:
            1 → Immediate, 2 → Emergent, 3 → Urgent,
            4 → Less Urgent, 5 → Non-Urgent.

        Returns:
            dict with key 'acuity_breakdown': list of per-level dicts, each with
            level, label, count, avg_wait_min, avg_los_hours.
        """
        daily = _read_daily()
        log   = _read_log()
        all_df = pd.concat([daily, log], ignore_index=True) if (len(daily) + len(log)) > 0 else pd.DataFrame()

        esi_labels = {
            1: "ESI 1 — Immediate",
            2: "ESI 2 — Emergent",
            3: "ESI 3 — Urgent",
            4: "ESI 4 — Less Urgent",
            5: "ESI 5 — Non-Urgent",
        }

        breakdown = []
        for level in [1, 2, 3, 4, 5]:
            if "acuity" in all_df.columns:
                subset = all_df[pd.to_numeric(all_df["acuity"], errors="coerce") == level]
            else:
                subset = pd.DataFrame()

            waits = _collect_wait_minutes(subset)

            if "acuity" in log.columns:
                log_sub = log[pd.to_numeric(log["acuity"], errors="coerce") == level]
            else:
                log_sub = pd.DataFrame()
            los_h = _collect_los_hours(log_sub)

            breakdown.append({
                "level":         level,
                "label":         esi_labels[level],
                "count":         len(subset),
                "avg_wait_min":  round(sum(waits) / len(waits), 1) if waits else None,
                "avg_los_hours": round(sum(los_h) / len(los_h), 2) if los_h else None,
            })

        return {"acuity_breakdown": breakdown}

    def throughput(self):
        """
        Return patient arrival counts bucketed by hour-of-day and day-of-week.

        Parses arrival_time from the combined patient dataset (active + discharged).
        Hour buckets are keyed as string integers "0"–"23"; day-of-week keys use
        three-letter abbreviations "Mon"–"Sun".

        Unparseable arrival_time values are silently skipped rather than crashing,
        so partial data still produces a useful result.

        Returns:
            dict with:
                by_hour          — {"0": count, …, "23": count}
                by_day_of_week   — {"Mon": count, …, "Sun": count}
                total_arrivals   — sum of all hour bucket counts
        """
        daily = _read_daily()
        log   = _read_log()
        all_df = pd.concat([daily, log], ignore_index=True) if (len(daily) + len(log)) > 0 else pd.DataFrame()

        hour_counts = {str(h): 0 for h in range(24)}
        dow_map   = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
        dow_counts = {v: 0 for v in dow_map.values()}

        if len(all_df) > 0 and "arrival_time" in all_df.columns:
            for arr in all_df["arrival_time"]:
                if pd.notna(arr) and str(arr).strip():
                    try:
                        dt = datetime.fromisoformat(str(arr).strip())
                        hour_counts[str(dt.hour)] += 1
                        dow_counts[dow_map[dt.weekday()]] += 1
                    except Exception:
                        pass

        return {
            "by_hour":         hour_counts,
            "by_day_of_week":  dow_counts,
            "total_arrivals":  sum(hour_counts.values()),
        }

    def top_complaints(self, top_n=10):
        """
        Return the top-N chief complaints by patient count.

        Normalises complaint strings to title case before grouping so that
        "chest pain" and "Chest Pain" are treated as the same complaint.
        Rows where the normalised complaint is "Nan" (pandas default for missing
        strings after fillna("Unknown") → title()) are excluded from results.

        Args:
            top_n (int): Maximum number of complaints to return.  Defaults to 10.

        Returns:
            dict with key 'complaints': sorted list of dicts, each with
            complaint (str), count (int), avg_los_hours (float | None).
            avg_los_hours is computed from discharged patients only.
        """
        daily = _read_daily()
        log   = _read_log()
        all_df = pd.concat([daily, log], ignore_index=True) if (len(daily) + len(log)) > 0 else pd.DataFrame()

        if len(all_df) == 0 or "chiefcomplaint" not in all_df.columns:
            return {"complaints": []}

        all_df["_cc"] = all_df["chiefcomplaint"].fillna("Unknown").astype(str).str.strip().str.title()
        if "chiefcomplaint" in log.columns:
            log["_cc"] = log["chiefcomplaint"].fillna("Unknown").astype(str).str.strip().str.title()

        result = []
        for complaint, grp in all_df.groupby("_cc"):
            if complaint == "Nan" or not complaint:
                continue
            count = len(grp)

            log_grp = log[log["_cc"] == complaint] if "_cc" in log.columns else pd.DataFrame()
            los_h = _collect_los_hours(log_grp)

            result.append({
                "complaint":     complaint,
                "count":         count,
                "avg_los_hours": round(sum(los_h) / len(los_h), 2) if los_h else None,
            })

        result.sort(key=lambda x: x["count"], reverse=True)
        return {"complaints": result[:top_n]}

    def vitals_summary(self):
        """
        Return aggregated vital-sign statistics for currently active patients.

        Computes mean, min, and max for each of six standard vital signs using
        only the current DailyPatients rows.  Each vital includes a 'normal'
        boolean that is True when the computed average lies within the accepted
        clinical reference range.

        Reference ranges used:
            temperature : 36.1–37.5 °C
            heartrate   : 60–100 bpm
            resprate    : 12–20 br/min
            o2sat       : 95–100 %
            sbp         : 90–140 mmHg
            dbp         : 60–90 mmHg

        Returns:
            dict with:
                vitals — mapping of vital name → {avg, min, max, unit, normal, count}
                count  — total number of active patients in DailyPatients
        """
        daily = _read_daily()

        if len(daily) == 0:
            return {"vitals": {}, "count": 0}

        normal_ranges = {
            "temperature": (36.1, 37.5,  "°C"),
            "heartrate":   (60,   100,   "bpm"),
            "resprate":    (12,   20,    "br/min"),
            "o2sat":       (95,   100,   "%"),
            "sbp":         (90,   140,   "mmHg"),
            "dbp":         (60,   90,    "mmHg"),
        }

        vitals = {}
        for col, (lo, hi, unit) in normal_ranges.items():
            if col not in daily.columns:
                continue
            vals = pd.to_numeric(daily[col], errors="coerce").dropna()
            if len(vals) == 0:
                continue
            avg = round(float(vals.mean()), 1)
            vitals[col] = {
                "avg":    avg,
                "min":    round(float(vals.min()), 1),
                "max":    round(float(vals.max()), 1),
                "unit":   unit,
                "normal": lo <= avg <= hi,
                "count":  int(len(vals)),
            }

        return {"vitals": vitals, "count": len(daily)}

    def staff_stats(self):
        """
        Return distribution and workload statistics for nurses and doctors.

        Reads Nurses.csv, Doctors.csv, patient_nurse.csv, and patient_doctor.csv.
        Computes headcount (total / active / absent), role/type breakdowns, shift
        distribution, and patient-load distribution (how many staff carry 0, 1,
        2–3, 4–5, or >5 patients) for both staff groups.

        Returns:
            dict with 'nurses' and 'doctors' sub-dicts, each containing:
                total, active, absent,
                role_distribution / type_distribution,
                shift_distribution,
                patient_load_distribution,
                avg_patients_per_active,
                total_patient_assignments,
                unique_patients_covered.
        """
        nurses  = pd.read_csv(NURSES_FILE)  if os.path.exists(NURSES_FILE)  else pd.DataFrame()
        doctors = pd.read_csv(DOCTORS_FILE) if os.path.exists(DOCTORS_FILE) else pd.DataFrame()
        pn      = pd.read_csv(PN_FILE)      if os.path.exists(PN_FILE)      else pd.DataFrame()
        pd_rel  = pd.read_csv(PD_FILE)      if os.path.exists(PD_FILE)      else pd.DataFrame()

        def _load_dist(staff_df, relation_df, id_col):
            """Bucket staff members by how many patients are assigned to them."""
            dist = {"0": 0, "1": 0, "2-3": 0, "4-5": 0, ">5": 0}
            if id_col not in relation_df.columns or "id" not in staff_df.columns:
                dist["0"] = len(staff_df)
                return dist
            counts = relation_df.groupby(id_col).size().to_dict()
            assigned_ids = set(counts.keys())
            all_ids = set(staff_df["id"].tolist())
            dist["0"] = len(all_ids - assigned_ids)
            for c in counts.values():
                if   c == 1: dist["1"]   += 1
                elif c <= 3: dist["2-3"] += 1
                elif c <= 5: dist["4-5"] += 1
                else:        dist[">5"]  += 1
            return dist

        # ── Nurses ──────────────────────────────────────────────────────────
        total_n  = len(nurses)
        absent_n = int(nurses["absent"].sum()) if "absent" in nurses.columns else 0
        active_n = total_n - absent_n

        role_dist  = nurses["role"].value_counts().to_dict()  if "role"  in nurses.columns else {}
        shift_n    = nurses["shift"].fillna("Unassigned").value_counts().to_dict() if "shift" in nurses.columns else {}
        load_dist_n = _load_dist(nurses, pn, "nurse_id")

        uniq_pts_n = int(pn["patient_id"].nunique()) if len(pn) > 0 and "patient_id" in pn.columns else 0
        avg_pts_n  = round(len(pn) / active_n, 2) if active_n > 0 and len(pn) > 0 else 0

        # ── Doctors ──────────────────────────────────────────────────────────
        total_d  = len(doctors)
        absent_d = int(doctors["absent"].sum()) if "absent" in doctors.columns else 0
        active_d = total_d - absent_d

        type_dist  = doctors["intern_or_not"].value_counts().to_dict() if "intern_or_not" in doctors.columns else {}
        shift_d    = doctors["shift"].fillna("Unassigned").value_counts().to_dict() if "shift" in doctors.columns else {}
        load_dist_d = _load_dist(doctors, pd_rel, "doctor_id")

        uniq_pts_d = int(pd_rel["patient_id"].nunique()) if len(pd_rel) > 0 and "patient_id" in pd_rel.columns else 0
        avg_pts_d  = round(len(pd_rel) / active_d, 2) if active_d > 0 and len(pd_rel) > 0 else 0

        return {
            "nurses": {
                "total":                    total_n,
                "active":                   active_n,
                "absent":                   absent_n,
                "role_distribution":        role_dist,
                "shift_distribution":       shift_n,
                "patient_load_distribution": load_dist_n,
                "avg_patients_per_active":  avg_pts_n,
                "total_patient_assignments": len(pn),
                "unique_patients_covered":  uniq_pts_n,
            },
            "doctors": {
                "total":                    total_d,
                "active":                   active_d,
                "absent":                   absent_d,
                "type_distribution":        type_dist,
                "shift_distribution":       shift_d,
                "patient_load_distribution": load_dist_d,
                "avg_patients_per_active":  avg_pts_d,
                "total_patient_assignments": len(pd_rel),
                "unique_patients_covered":  uniq_pts_d,
            },
        }

    def staff_member_detail(self, kind: str, member_id: int):
        """
        Return full profile and patient/bed details for a single nurse or doctor.

        Args:
            kind      : "nurse" or "doctor"
            member_id : integer id from Nurses.csv or Doctors.csv

        Returns:
            dict with:
                member   — personal fields (name, role/type, shift, group, absent, free_time)
                patients — list of active patient records assigned to this staff member
                beds     — list of {bed_number, bed_status, type, ward_name} for those patients
                ward_distribution — {ward_name: count} across assigned beds
        """
        is_nurse = kind == "nurse"
        staff_file  = NURSES_FILE  if is_nurse else DOCTORS_FILE
        rel_file    = PN_FILE      if is_nurse else PD_FILE
        id_col      = "nurse_id"   if is_nurse else "doctor_id"

        staff_df = pd.read_csv(staff_file) if os.path.exists(staff_file) else pd.DataFrame()
        rel_df   = pd.read_csv(rel_file)   if os.path.exists(rel_file)   else pd.DataFrame()
        daily    = _read_daily()
        beds_df  = pd.read_csv(BEDS_FILE)     if os.path.exists(BEDS_FILE)     else pd.DataFrame()
        pb_df    = pd.read_csv(PB_FILE)       if os.path.exists(PB_FILE)       else pd.DataFrame()
        wb_df    = pd.read_csv(WARD_BED_FILE) if os.path.exists(WARD_BED_FILE) else pd.DataFrame()
        wards_df = pd.read_csv(WARDS_FILE)    if os.path.exists(WARDS_FILE)    else pd.DataFrame()

        # ── Member profile ──────────────────────────────────────────────────
        if len(staff_df) == 0 or "id" not in staff_df.columns:
            return {"error": f"{kind} not found"}

        row = staff_df[staff_df["id"].astype(int) == member_id]
        if len(row) == 0:
            return {"error": f"{kind} id {member_id} not found"}

        row = row.iloc[0]

        def _sv(v):
            try:
                import math
                if math.isnan(float(v)):
                    return None
            except (TypeError, ValueError):
                pass
            return str(v).strip() if v is not None else None

        if is_nurse:
            member = {
                "id":        int(row["id"]),
                "name":      _sv(row.get("name")),
                "role":      _sv(row.get("role")),
                "shift":     _sv(row.get("shift")),
                "group":     _sv(row.get("group")),
                "absent":    bool(row.get("absent", False)),
                "free_time": _sv(row.get("availabilityTimeStart")),
            }
        else:
            member = {
                "id":        int(row["id"]),
                "name":      _sv(row.get("name")),
                "type":      _sv(row.get("intern_or_not")),
                "shift":     _sv(row.get("shift")),
                "group":     _sv(row.get("work_days")),
                "absent":    bool(row.get("absent", False)),
                "free_time": _sv(row.get("availabilityTimeStart")),
            }

        # ── Assigned patients ───────────────────────────────────────────────
        assigned_patient_ids = set()
        if len(rel_df) > 0 and id_col in rel_df.columns and "patient_id" in rel_df.columns:
            sub = rel_df[rel_df[id_col].astype(int) == member_id]
            assigned_patient_ids = set(sub["patient_id"].astype(int).tolist())

        patients = []
        if len(daily) > 0 and "subject_id" in daily.columns and assigned_patient_ids:
            for _, pr in daily.iterrows():
                pid = int(pr["subject_id"]) if pd.notna(pr.get("subject_id")) else None
                if pid not in assigned_patient_ids:
                    continue
                patients.append({
                    "patient_id":     pid,
                    "stay_id":        int(pr["stay_id"])   if pd.notna(pr.get("stay_id"))   else None,
                    "name":           _sv(pr.get("name")),
                    "gender":         _sv(pr.get("gender")),
                    "age":            _sv(pr.get("age")),
                    "acuity":         _sv(pr.get("acuity")),
                    "chiefcomplaint": _sv(pr.get("chiefcomplaint")),
                    "arrival_time":   _sv(pr.get("arrival_time")),
                })

        # ── Beds & ward distribution ────────────────────────────────────────
        bed_details = []
        ward_dist = {}

        # Build ward-name lookup: bed_id → ward_name
        bed_to_ward = {}
        if len(wb_df) > 0 and len(wards_df) > 0 and "ward_id" in wb_df.columns and "bed_id" in wb_df.columns:
            ward_name_map = {}
            if "ward_id" in wards_df.columns and "ward_name" in wards_df.columns:
                ward_name_map = {int(r["ward_id"]): str(r["ward_name"]) for _, r in wards_df.iterrows()}
            for _, wbr in wb_df.iterrows():
                bid = int(wbr["bed_id"])
                wid = int(wbr["ward_id"])
                bed_to_ward[bid] = ward_name_map.get(wid, f"Ward {wid}")

        # Build bed-info lookup: bed_id → bed fields
        bed_info = {}
        if len(beds_df) > 0 and "bed_id" in beds_df.columns:
            for _, br in beds_df.iterrows():
                bid = int(br["bed_id"])
                bed_info[bid] = {
                    "bed_number": _sv(br.get("bed_number")),
                    "bed_status": _sv(br.get("bed_status")),
                    "type":       _sv(br.get("type")),
                }

        # patient_bed rows for our patients
        if len(pb_df) > 0 and "patient_id" in pb_df.columns and "bed_id" in pb_df.columns and assigned_patient_ids:
            for _, pbr in pb_df.iterrows():
                pid = int(pbr["patient_id"])
                bid = int(pbr["bed_id"])
                if pid not in assigned_patient_ids:
                    continue
                info = bed_info.get(bid, {})
                ward  = bed_to_ward.get(bid, "Unknown")
                bed_details.append({
                    "patient_id": pid,
                    "bed_id":     bid,
                    "bed_number": info.get("bed_number"),
                    "bed_status": info.get("bed_status"),
                    "type":       info.get("type"),
                    "ward":       ward,
                })
                ward_dist[ward] = ward_dist.get(ward, 0) + 1

        return {
            "member":            member,
            "patients":          patients,
            "beds":              bed_details,
            "ward_distribution": ward_dist,
        }

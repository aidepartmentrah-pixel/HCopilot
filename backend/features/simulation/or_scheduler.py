# OR Scheduler — produces prioritised bed/staff assignment suggestions for every
# patient currently in DailyPatients who does not yet have a bed.
#
# DESIGN RULES (enforced here, do not relax without updating these comments):
#
#  1. Three completely separate lanes — acuity membership is fixed at triage and
#     never changes regardless of waiting time or computed score.
#       Lane "1-2": acuity 1, 2, or null (null treated as 1)  → Ward 1 only
#       Lane "3-4": acuity 3 or 4                             → Ward 2 / Ward 3
#       Lane "5":   acuity 5                                  → any ward
#
#  2. Priority score (lane 3-4 only):
#       score = base_acuity − (waiting_minutes / 60)
#     Lower score = more urgent.  base_acuity defaults to the numeric acuity
#     (3.0 or 4.0) but can be overridden per patient from the frontend.
#     Score ONLY ranks patients within the lane — it never affects lane assignment.
#
#  3. Staff fairness — both doctors and nurses:
#     Primary  : fewest patientNb (actual stored count + extra load from this run)
#     Tiebreak : earliest availabilityTimeStart (rested longest since last patient)
#
#  4. Doctor seniority for lane "1-2":
#     Require intern_or_not == "doctor".  Fall back to any available with a warning.
#
#  5. Strict-nurse mode (optional checkbox):
#     Pick exactly one RN and one PN.  Fall back to any two nurses if a role is
#     unavailable on the current shift, and flag nurse_strict_fallback = True.
#
#  6. No-disruption: the OR only considers UNASSIGNED patients.  It never moves or
#     re-suggests beds for patients who already have an assignment.
#
#  7. Ward 1 overflow: if all Ward 1 beds are occupied when a critical patient
#     arrives, mark is_overflow = True and suggest the best available other-ward bed.
#     The frontend shows an emergency alert for these suggestions.
#
#  8. Ward 2 / Ward 3 balance (lane 3-4): at each assignment step, choose the ward
#     with more available beds at that moment.
#
#  9. ICU priority for lane "1-2": a critical patient must get a bed of type "ICU"
#     first — Ward 1's ICU beds, then ICU beds in any other ward (overflow).
#     If none exist anywhere, look for an already-existing free "chariot" bed
#     (temporary overflow bed) before giving up. If still nothing is found,
#     bed_id is left None and icu_unavailable = True — the frontend must let the
#     user either (a) reassign a current ICU occupant to another bed, freeing
#     theirs, or (b) create a new chariot bed on confirm (use_chariot = True on
#     /or-confirm). A chariot bed is deleted automatically once its patient is
#     discharged/released, unless another lane-1/2 patient is still waiting with
#     no other bed free (see BedManager.cleanup_chariot_if_unneeded).

import math
import pandas as pd
from datetime import datetime
from typing import Optional

from db.session import SessionLocal
from db.models import DailyPatient, PatientBed, EDBed, WardBed, Ward, Doctor, Nurse, Shift, Group

# Ward 1 is the critical ward (Recovery Room). Only acuity 1/2 patients go here.
CRITICAL_WARD_ID = 1


def _active_shift_name() -> str:
    """Return the first shift name whose time window covers the current hour (OR scheduler compat)."""
    names = _active_shift_names()
    return names[0] if names else "morning"


def _active_group_id() -> int:
    """Return the first group_id whose days include today's weekday (backward compat)."""
    ids = _active_group_ids()
    return ids[0] if ids else 1


def _active_group_names() -> list:
    """
    Return ALL group names whose day-list includes today's weekday (0=Mon).
    Returns an empty list when today falls inside no configured group.
    """
    try:
        with SessionLocal() as session:
            groups = session.query(Group).all()
        dow = datetime.now().weekday()
        matches = []
        for row in groups:
            nums = [int(d.strip()) for d in str(row.days).split(",") if d.strip().isdigit()]
            if dow in nums:
                matches.append(str(row.name).strip())
        return matches
    except Exception:
        return []


def _active_group_name() -> str:
    """Return the first active group name (OR scheduler compat wrapper)."""
    names = _active_group_names()
    return names[0] if names else "Group 1"


def _active_shift_names() -> list:
    """
    Return ALL shift names whose time window covers the current hour.
    Returns an empty list when the current hour falls inside no configured shift.
    Supports overnight shifts (start_hour > end_hour).
    """
    try:
        with SessionLocal() as session:
            shifts = session.query(Shift).all()
        h = datetime.now().hour
        matches = []
        for row in shifts:
            s, e = row.start_hour, row.end_hour
            if s <= e:
                if s <= h < e:
                    matches.append(str(row.name).strip())
            else:                      # overnight: e.g. 22 → 06
                if h >= s or h < e:
                    matches.append(str(row.name).strip())
        return matches
    except Exception:
        return []


def _active_group_ids() -> list:
    """
    Return ALL group_ids whose day-list includes today's weekday (0=Mon).
    Returns an empty list when today falls inside no configured group.
    """
    try:
        with SessionLocal() as session:
            groups = session.query(Group).all()
        dow = datetime.now().weekday()
        matches = []
        for row in groups:
            nums = [int(d.strip()) for d in str(row.days).split(",") if d.strip().isdigit()]
            if dow in nums:
                matches.append(row.group_id)
        return matches
    except Exception:
        return []


# ── Helper utilities ─────────────────────────────────────────────────────────

def _safe(v):
    """Return None for NaN/None, otherwise the raw value."""
    if v is None:
        return None
    try:
        if math.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        pass
    return v


def _parse_nb(raw, extra: int = 0) -> int:
    """Parse a patientNb/patientNB cell (may be '', NaN, or int-like) → int."""
    s = str(raw).strip()
    if s in ("", "nan", "None"):
        return 0 + extra
    try:
        return int(float(s)) + extra
    except (ValueError, TypeError):
        return 0 + extra


def _parse_avail_ts(raw) -> float:
    """
    Parse availabilityTimeStart to a Unix timestamp for sorting.
    Empty / missing  → float('inf')  (placed last in the fairness sort).
    Stored format is "%Y-%m-%dT%H:%M" (see DoctorsManager.update_patient_count).
    """
    s = str(raw).strip()
    if not s or s in ("nan", "None"):
        return float("inf")
    try:
        return datetime.fromisoformat(s).timestamp()
    except ValueError:
        return float("inf")


def _effective_acuity(raw_acuity) -> int:
    """Map the stored acuity to an integer lane key.  None/null → 1 (most critical)."""
    if raw_acuity is None:
        return 1
    try:
        v = int(float(raw_acuity))
        return v if 1 <= v <= 5 else 1
    except (ValueError, TypeError):
        return 1


def _acuity_lane(eff: int) -> str:
    if eff in (1, 2):
        return "1-2"
    if eff in (3, 4):
        return "3-4"
    return "5"


def _waiting_minutes(arrival_str) -> float:
    """Minutes since arrival_time.  Returns 0 if unparseable."""
    if not arrival_str or str(arrival_str).strip() in ("", "nan", "None"):
        return 0.0
    try:
        arrival = datetime.fromisoformat(str(arrival_str).strip())
        delta   = (datetime.now() - arrival).total_seconds() / 60.0
        return max(0.0, delta)
    except ValueError:
        return 0.0


# ── Main class ────────────────────────────────────────────────────────────────

class ORScheduler:
    """Stateless scheduler: all data is read fresh from CSV on each call."""

    # ── Data loaders ──────────────────────────────────────────────────────────

    def _current_shift(self) -> str:
        return _active_shift_name()

    def _current_group(self) -> str:
        return _active_group_name()

    def _load_unassigned_patients(self) -> list[dict]:
        """
        Return patients in DailyPatients who have no row in patient_bed.
        Each dict carries all fields needed by the lane logic.
        """
        with SessionLocal() as session:
            dp_rows = session.query(DailyPatient).all()
            if not dp_rows:
                return []
            assigned_ids = {pb.patient_id for pb in session.query(PatientBed).all()}

        unurgent_ids = {r.subject_id for r in dp_rows if str(r.unurgent or "").strip().lower() == "true"}

        patients = []
        for row in dp_rows:
            pid = row.subject_id
            if pid in assigned_ids or pid in unurgent_ids:
                continue  # already has a bed or is in unurgent path
            raw_acuity = _safe(row.acuity)
            eff        = _effective_acuity(raw_acuity)
            wait       = _waiting_minutes(_safe(row.arrival_time))
            patients.append({
                "patient_id":        pid,
                "stay_id":           row.stay_id,
                "name":              _safe(row.name),
                "gender":            _safe(row.gender),
                "age":               _safe(row.age),
                "acuity":            raw_acuity,
                "effective_acuity":  eff,
                "acuity_lane":       _acuity_lane(eff),
                "acuity_was_null":   raw_acuity is None,
                "waiting_minutes":   wait,
                "arrival_time":      _safe(row.arrival_time),
                "chiefcomplaint":    _safe(row.chiefcomplaint),
            })
        return patients

    def _load_available_beds(self) -> dict:
        """
        Return available beds grouped by ward_id.
        Keys: ward_id (int) for known wards, 0 for unassigned beds.
        Values: list of {bed_id, bed_number, ward_id, ward_name}.
        """
        with SessionLocal() as session:
            beds = session.query(EDBed).all()
            if not beds:
                return {}
            occupied_ids = {pb.bed_id for pb in session.query(PatientBed).all()}
            ward_by_bed = {wb.bed_id: wb.ward_id for wb in session.query(WardBed).all()}
            ward_names = {w.ward_id: w.ward_name for w in session.query(Ward).all()}

        grouped: dict[int, list] = {}
        for row in beds:
            bid  = row.bed_id
            cond = str(row.bed_status or "Available").strip()
            if cond == "Under Repair" or bid in occupied_ids:
                continue  # skip unavailable beds

            wid = ward_by_bed.get(bid)
            if wid is not None:
                wname = ward_names.get(wid, f"Ward {wid}")
            else:
                wid   = 0   # unassigned to any ward
                wname = "Unassigned"

            raw_type  = str(row.type or "normal").strip()
            bed_type  = raw_type if raw_type in ("normal", "monitor", "ICU", "chariot") else "normal"

            grouped.setdefault(wid, []).append({
                "bed_id":     bid,
                "bed_number": str(row.bed_number),
                "bed_type":   bed_type,
                "ward_id":    wid,
                "ward_name":  wname,
            })
        return grouped

    def _load_icu_occupants(self) -> list[dict]:
        """
        List patients currently occupying an ICU-type bed. Used when no ICU bed is
        free for a new critical patient — the frontend offers to reassign one of
        these occupants to a different bed, freeing their ICU bed.
        """
        with SessionLocal() as session:
            icu_beds = session.query(EDBed).filter(EDBed.type == "ICU").all()
            if not icu_beds:
                return []
            patient_by_bed = {pb.bed_id: pb.patient_id for pb in session.query(PatientBed).all()}
            if not patient_by_bed:
                return []
            ward_by_bed = {wb.bed_id: wb.ward_id for wb in session.query(WardBed).all()}
            ward_names = {w.ward_id: w.ward_name for w in session.query(Ward).all()}
            dp_info = {
                p.subject_id: {"name": p.name, "gender": p.gender, "age": p.age}
                for p in session.query(DailyPatient).all()
            }

        occupants = []
        for row in icu_beds:
            bid = row.bed_id
            pid = patient_by_bed.get(bid)
            if pid is None:
                continue
            wid  = ward_by_bed.get(bid)
            info = dp_info.get(pid, {})
            occupants.append({
                "patient_id":    pid,
                "bed_id":        bid,
                "bed_number":    str(row.bed_number),
                "ward_id":       wid,
                "ward_name":     ward_names.get(wid, f"Ward {wid}") if wid is not None else "Unassigned",
                "patient_name":  info.get("name"),
                "patient_gender": info.get("gender"),
                "patient_age":   info.get("age"),
            })
        return occupants

    def _load_doctors(self, shifts, groups) -> pd.DataFrame:
        """
        Doctors on ANY of the given shifts AND in ANY of the given groups, and not absent.
        shifts / groups may each be a single string or a list of strings.
        """
        with SessionLocal() as session:
            doctors = session.query(Doctor).all()
        if not doctors:
            return pd.DataFrame()
        df = pd.DataFrame([{
            "id": d.id, "intern_or_not": d.intern_or_not, "shift": d.shift,
            "work_days": d.work_days, "patientNb": d.patientNb,
            "availabilityTimeStart": d.availabilityTimeStart, "name": d.name, "absent": d.absent,
        } for d in doctors])
        if isinstance(shifts, str):
            shifts = [shifts]
        if isinstance(groups, str):
            groups = [groups]
        shifts_lower = {s.lower() for s in shifts}
        groups_set   = {str(g).strip() for g in groups}
        df = df[df["shift"].astype(str).str.strip().str.lower().isin(shifts_lower)]
        df = df[df["work_days"].astype(str).str.strip().isin(groups_set)]
        if "absent" in df.columns:
            df = df[~df["absent"].astype(str).str.strip().str.lower().isin(["true", "1", "yes"])]
        return df.reset_index(drop=True)

    def _load_nurses(self, shifts, groups) -> pd.DataFrame:
        """
        Nurses on ANY of the given shifts AND in ANY of the given groups, and not absent.
        shifts / groups may each be a single string or a list of strings.
        """
        with SessionLocal() as session:
            nurses = session.query(Nurse).all()
        if not nurses:
            return pd.DataFrame()
        df = pd.DataFrame([{
            "id": n.id, "role": n.role, "shift": n.shift, "group": n.group,
            "patientNB": n.patientNB, "availabilityTimeStart": n.availabilityTimeStart,
            "name": n.name, "absent": n.absent,
        } for n in nurses])
        if isinstance(shifts, str):
            shifts = [shifts]
        if isinstance(groups, str):
            groups = [groups]
        shifts_lower = {s.lower() for s in shifts}
        groups_set   = {str(g).strip() for g in groups}
        df = df[df["shift"].astype(str).str.strip().str.lower().isin(shifts_lower)]
        df = df[df["group"].astype(str).str.strip().isin(groups_set)]
        if "absent" in df.columns:
            df = df[~df["absent"].astype(str).str.strip().str.lower().isin(["true", "1", "yes"])]
        return df.reset_index(drop=True)

    # ── Staff selection ───────────────────────────────────────────────────────

    def _pick_doctor(
        self,
        doctors_df: pd.DataFrame,
        require_senior: bool,
        extra_load: dict,
        exclude_ids: set,
    ) -> tuple[Optional[dict], bool]:
        """
        Return (best_doctor_dict, senior_fallback_flag).
        senior_fallback = True means acuity-1/2 wanted a senior but got an intern.
        """
        if doctors_df.empty:
            return None, False

        candidates = doctors_df[~doctors_df["id"].astype(str).isin({str(i) for i in exclude_ids})]

        senior_fallback = False
        if require_senior:
            senior = candidates[candidates["intern_or_not"].astype(str).str.strip() == "doctor"]
            if senior.empty:
                # No senior on this shift — fall back but flag it
                senior_fallback = True
            else:
                candidates = senior

        if candidates.empty:
            return None, senior_fallback

        def sort_key(row):
            did = int(row["id"])
            nb  = _parse_nb(row["patientNb"], extra_load.get(did, 0))
            ts  = _parse_avail_ts(row["availabilityTimeStart"])
            return (nb, ts)

        best = min(candidates.itertuples(index=False), key=lambda r: (
            _parse_nb(r.patientNb, extra_load.get(int(r.id), 0)),
            _parse_avail_ts(r.availabilityTimeStart),
        ))

        return {
            "id":           int(best.id),
            "name":         _safe(getattr(best, "name", None)),
            "type":         str(best.intern_or_not).strip(),
            "patientNb":    _parse_nb(best.patientNb),
            "availabilityTimeStart": str(best.availabilityTimeStart).strip(),
        }, senior_fallback

    def _pick_nurses(
        self,
        nurses_df: pd.DataFrame,
        strict: bool,
        extra_load: dict,
        exclude_ids: set,
    ) -> tuple[Optional[dict], Optional[dict], bool]:
        """
        Return (nurse1, nurse2, strict_fallback_flag).
        strict=True → nurse1 must be RN, nurse2 must be PN (or fallback).
        Nurses already in exclude_ids are skipped; exclude_ids is updated in place.
        """
        if nurses_df.empty:
            return None, None, False

        available = nurses_df[~nurses_df["id"].astype(str).isin({str(i) for i in exclude_ids})]

        def best_from(pool: pd.DataFrame) -> Optional[dict]:
            if pool.empty:
                return None
            best = min(pool.itertuples(index=False), key=lambda r: (
                _parse_nb(r.patientNB, extra_load.get(int(r.id), 0)),
                _parse_avail_ts(r.availabilityTimeStart),
            ))
            return {
                "id":   int(best.id),
                "name": _safe(getattr(best, "name", None)),
                "role": str(best.role).strip(),
                "patientNB": _parse_nb(best.patientNB),
                "availabilityTimeStart": str(best.availabilityTimeStart).strip(),
            }

        strict_fallback = False

        if strict:
            rn_pool = available[available["role"].astype(str).str.strip() == "RN"]
            pn_pool = available[available["role"].astype(str).str.strip() == "PN"]

            n1 = best_from(rn_pool)
            if n1:
                exclude_ids.add(n1["id"])
                pn_pool = pn_pool[pn_pool["id"].astype(str) != str(n1["id"])]
            n2 = best_from(pn_pool)

            # Fall back if a role is missing
            if n1 is None or n2 is None:
                strict_fallback = True
                remaining = available[~available["id"].astype(str).isin({str(i) for i in exclude_ids})]
                if n1 is None:
                    n1 = best_from(remaining)
                    if n1:
                        exclude_ids.add(n1["id"])
                if n2 is None:
                    remaining2 = available[~available["id"].astype(str).isin({str(i) for i in exclude_ids})]
                    n2 = best_from(remaining2)
        else:
            n1 = best_from(available)
            if n1:
                exclude_ids.add(n1["id"])
            remaining = available[~available["id"].astype(str).isin({str(i) for i in exclude_ids})]
            n2 = best_from(remaining)

        if n2:
            exclude_ids.add(n2["id"])

        return n1, n2, strict_fallback

    # ── Bed pool helpers ──────────────────────────────────────────────────────

    def _pop_bed(self, pool: list) -> Optional[dict]:
        """Remove and return the first bed from a list, or None if empty."""
        return pool.pop(0) if pool else None

    def _pop_bed_of_type(self, pool: list, bed_type: str) -> Optional[dict]:
        """Remove and return the first bed of a given type in pool, or None (no mutation) if none found."""
        for i, b in enumerate(pool):
            if b.get("bed_type") == bed_type:
                return pool.pop(i)
        return None

    def _pop_balanced_ward23(self, w2: list, w3: list, other: list) -> Optional[dict]:
        """
        Pick from Ward 2 or Ward 3, choosing whichever currently has MORE available
        beds (less occupied relative to this run's picks).  Falls back to other.
        """
        if len(w2) >= len(w3) and w2:
            return w2.pop(0)
        if w3:
            return w3.pop(0)
        if w2:
            return w2.pop(0)
        return self._pop_bed(other)

    # ── Reason builders ───────────────────────────────────────────────────────

    def _reason_bed(self, bed: Optional[dict], lane: str, is_overflow: bool, icu_unavailable: bool = False) -> str:
        if bed is None:
            if icu_unavailable:
                return (
                    "No ICU bed available for this critical patient — reassign a patient "
                    "currently in an ICU bed, or add a temporary chariot bed"
                )
            return "No available bed found — all beds occupied or under repair"
        wname = bed["ward_name"]
        bnum  = bed["bed_number"]
        btype = f" [{bed['bed_type']}]" if bed.get("bed_type") else ""
        if lane == "1-2":
            if bed.get("bed_type") == "chariot":
                return f"No ICU bed free → temporary chariot bed {bnum} in {wname} (critical patient, overflow)"
            if is_overflow:
                return (
                    f"ICU OVERFLOW: bed {bnum}{btype} in {wname}"
                    " (no ICU bed in Ward 1, nearest ICU bed used)"
                )
            return f"Acuity 1/2 → ICU bed {bnum}{btype}, {wname} (critical protocol, ICU priority)"
        if lane == "3-4":
            return f"Acuity 3/4 → bed {bnum}{btype}, {wname} (balanced ward assignment)"
        return f"Acuity 5 → bed {bnum}{btype}, {wname} (lowest priority)"

    def _reason_score(self, patient: dict, base: Optional[float], score: Optional[float]) -> str:
        if base is None:
            return f"Waiting {patient['waiting_minutes']:.0f} min"
        return (
            f"Waiting {patient['waiting_minutes']:.0f} min | "
            f"Priority score: {score:.2f} "
            f"(base {base:.1f} − {patient['waiting_minutes']/60:.2f})"
        )

    def _reason_doctor(self, doc: Optional[dict], require_senior: bool, fallback: bool) -> str:
        if doc is None:
            return "No doctor available on current shift"
        role_str = "senior" if doc["type"] == "doctor" else "intern"
        avail    = doc["availabilityTimeStart"] or "—"
        nb       = doc["patientNb"]
        base     = f"Dr. #{doc['id']} ({role_str}): {nb} patient(s), available since {avail}"
        if fallback:
            return base + " [WARN: no senior on shift — intern assigned as fallback]"
        return base

    def _reason_nurses(self, n1: Optional[dict], n2: Optional[dict], strict: bool, fallback: bool) -> str:
        if n1 is None and n2 is None:
            return "No nurses available on current shift"
        parts = []
        if n1:
            parts.append(f"Nurse #{n1['id']} ({n1['role']}, {n1['patientNB']} pts)")
        if n2:
            parts.append(f"Nurse #{n2['id']} ({n2['role']}, {n2['patientNB']} pts)")
        line = " + ".join(parts)
        if strict and not fallback:
            return line + " — strict mode (1 RN + 1 PN)"
        if strict and fallback:
            return line + " — strict mode (role not fully available, partial fallback)"
        return line + " — fairness assignment"

    # ── Main entry point ──────────────────────────────────────────────────────

    def compute_suggestions(
        self,
        strict_nurses: bool = False,
        base_score_overrides: Optional[dict] = None,
        shift_override: Optional[str] = None,
        group_override: Optional[str] = None,
    ) -> dict:
        """
        Compute assignment suggestions for all currently unassigned patients.

        Returns a dict with:
            suggestions   : list of suggestion dicts (one per unassigned patient)
            current_shift : "morning" | "night"
            ward1_full    : bool — True if Ward 1 had zero free beds of any type
            icu_shortage  : bool — True if any critical patient found no ICU bed
            icu_occupants : list of patients currently in an ICU bed (for manual reassignment)
            no_waiting    : bool — True if there are no unassigned patients
        """
        if base_score_overrides is None:
            base_score_overrides = {}

        # Single-value shift/group for display in the response; lists for staff loading
        # so that doctors/nurses on any currently-active shift or group are included.
        if shift_override is not None:
            shift       = shift_override
            load_shifts = [shift_override]
        else:
            all_shifts  = _active_shift_names()
            shift       = all_shifts[0] if all_shifts else self._current_shift()
            load_shifts = all_shifts or [shift]

        if group_override is not None:
            group       = group_override
            load_groups = [group_override]
        else:
            all_groups  = _active_group_names()
            group       = all_groups[0] if all_groups else self._current_group()
            load_groups = all_groups or [group]

        patients  = self._load_unassigned_patients()
        bed_pools = self._load_available_beds()
        doctors   = self._load_doctors(load_shifts, load_groups)
        nurses    = self._load_nurses(load_shifts, load_groups)
        icu_occupants = self._load_icu_occupants()

        if not patients:
            return {
                "suggestions":    [],
                "current_shift":  shift,
                "current_group":  group,
                "current_shifts": load_shifts,
                "current_groups": load_groups,
                "ward1_full":     False,
                "icu_shortage":   False,
                "icu_occupants":  icu_occupants,
                "no_waiting":     True,
            }

        # Separate bed pools
        ward1_pool = list(bed_pools.get(CRITICAL_WARD_ID, []))
        ward2_pool = list(bed_pools.get(2, []))
        ward3_pool = list(bed_pools.get(3, []))
        other_pool = []
        for wid, beds in bed_pools.items():
            if wid not in (CRITICAL_WARD_ID, 2, 3):
                other_pool.extend(beds)

        # Overflow pool for critical patients when Ward 1 is full
        overflow_pool = ward2_pool + ward3_pool + other_pool

        # Separate into three lanes
        lane_critical = [p for p in patients if p["acuity_lane"] == "1-2"]
        lane_normal   = [p for p in patients if p["acuity_lane"] == "3-4"]
        lane_low      = [p for p in patients if p["acuity_lane"] == "5"]

        # Lane 1-2: sort by effective acuity (1 before 2), then by waiting time descending
        lane_critical.sort(key=lambda p: (p["effective_acuity"], -p["waiting_minutes"]))

        # Lane 3-4: compute priority score then sort ascending (lower = more urgent)
        for p in lane_normal:
            override = base_score_overrides.get(str(p["patient_id"]))
            base     = override if override is not None else float(p["effective_acuity"])
            p["base_score"]     = base
            p["priority_score"] = base - (p["waiting_minutes"] / 60.0)
        lane_normal.sort(key=lambda p: p["priority_score"])

        # Lane 5: sort by waiting time descending (longest waiter first)
        lane_low.sort(key=lambda p: -p["waiting_minutes"])

        # Extra load accumulated during this suggestion run (prevents over-assigning one staff)
        extra_doc_load   = {}   # doctor_id → extra patients assigned in this run
        extra_nurse_load = {}   # nurse_id  → extra patients assigned in this run

        suggestions  = []
        global_ward1_full   = False  # True if Ward 1 had zero free beds of any type for some patient
        global_icu_shortage = False  # True if some critical patient found no ICU bed anywhere

        # ── Lane 1-2 (critical) — ICU bed priority, chariot fallback ───────────
        for p in lane_critical:
            ward1_full_now = len(ward1_pool) == 0
            if ward1_full_now:
                global_ward1_full = True

            is_overflow = False

            # 1) Prefer an ICU bed in Ward 1
            bed = self._pop_bed_of_type(ward1_pool, "ICU")
            # 2) Fall back to an ICU bed in any other ward
            if bed is None:
                bed = (self._pop_bed_of_type(ward2_pool, "ICU")
                       or self._pop_bed_of_type(ward3_pool, "ICU")
                       or self._pop_bed_of_type(other_pool, "ICU"))
                if bed is not None:
                    is_overflow = True
            # 3) Fall back to an already-existing free chariot bed (created for an
            #    earlier ICU shortage and not yet cleaned up)
            if bed is None:
                bed = (self._pop_bed_of_type(ward1_pool, "chariot")
                       or self._pop_bed_of_type(ward2_pool, "chariot")
                       or self._pop_bed_of_type(ward3_pool, "chariot")
                       or self._pop_bed_of_type(other_pool, "chariot"))
                if bed is not None:
                    is_overflow = bed["ward_id"] != CRITICAL_WARD_ID

            if bed is not None:
                # Remove this bed from overflow pool so it's not double-offered to lane 3-4/5
                overflow_pool = [b for b in overflow_pool if b["bed_id"] != bed["bed_id"]]

            icu_unavailable = bed is None
            if icu_unavailable:
                global_icu_shortage = True
            no_bed = bed is None

            exclude_ids: set = set()
            doc, doc_fallback = self._pick_doctor(doctors, require_senior=True,
                                                   extra_load=extra_doc_load,
                                                   exclude_ids=exclude_ids)
            if doc:
                exclude_ids.add(doc["id"])
                extra_doc_load[doc["id"]] = extra_doc_load.get(doc["id"], 0) + 1

            n1, n2, nurse_fallback = self._pick_nurses(nurses, strict=strict_nurses,
                                                        extra_load=extra_nurse_load,
                                                        exclude_ids=exclude_ids)
            if n1:
                extra_nurse_load[n1["id"]] = extra_nurse_load.get(n1["id"], 0) + 1
            if n2:
                extra_nurse_load[n2["id"]] = extra_nurse_load.get(n2["id"], 0) + 1

            reasons = [
                self._reason_bed(bed, "1-2", is_overflow, icu_unavailable),
                self._reason_score(p, None, None),
                self._reason_doctor(doc, require_senior=True, fallback=doc_fallback),
                self._reason_nurses(n1, n2, strict=strict_nurses, fallback=nurse_fallback),
            ]

            suggestions.append({
                "patient_id":       p["patient_id"],
                "stay_id":          p["stay_id"],
                "name":             p.get("name"),
                "gender":           p.get("gender"),
                "age":              p.get("age"),
                "acuity":           p["acuity"],
                "effective_acuity": p["effective_acuity"],
                "acuity_lane":      "1-2",
                "priority_score":   None,
                "base_score":       None,
                "waiting_minutes":  p["waiting_minutes"],
                "bed_id":           bed["bed_id"]     if bed else None,
                "bed_number":       bed["bed_number"] if bed else None,
                "bed_type":         bed["bed_type"]   if bed else None,
                "ward_id":          bed["ward_id"]    if bed else None,
                "ward_name":        bed["ward_name"]  if bed else None,
                "doctor_id":        doc["id"]         if doc else None,
                "doctor_name":      doc["name"]       if doc else None,
                "doctor_type":      doc["type"]       if doc else None,
                "nurse1_id":        n1["id"]          if n1 else None,
                "nurse1_name":      n1["name"]        if n1 else None,
                "nurse1_role":      n1["role"]        if n1 else None,
                "nurse2_id":        n2["id"]          if n2 else None,
                "nurse2_name":      n2["name"]        if n2 else None,
                "nurse2_role":      n2["role"]        if n2 else None,
                "is_overflow":             is_overflow,
                "ward1_full":              ward1_full_now,
                "icu_unavailable":         icu_unavailable,
                "no_bed_available":        no_bed,
                "senior_fallback":         doc_fallback,
                "nurse_strict_fallback":   nurse_fallback,
                "reasons":                 reasons,
            })

        # ── Lane 3-4 (normal) ─────────────────────────────────────────────────
        for p in lane_normal:
            bed = self._pop_balanced_ward23(ward2_pool, ward3_pool, other_pool)
            no_bed = bed is None

            exclude_ids: set = set()
            doc, doc_fallback = self._pick_doctor(doctors, require_senior=False,
                                                   extra_load=extra_doc_load,
                                                   exclude_ids=exclude_ids)
            if doc:
                exclude_ids.add(doc["id"])
                extra_doc_load[doc["id"]] = extra_doc_load.get(doc["id"], 0) + 1

            n1, n2, nurse_fallback = self._pick_nurses(nurses, strict=strict_nurses,
                                                        extra_load=extra_nurse_load,
                                                        exclude_ids=exclude_ids)
            if n1:
                extra_nurse_load[n1["id"]] = extra_nurse_load.get(n1["id"], 0) + 1
            if n2:
                extra_nurse_load[n2["id"]] = extra_nurse_load.get(n2["id"], 0) + 1

            reasons = [
                self._reason_bed(bed, "3-4", False, False),
                self._reason_score(p, p["base_score"], p["priority_score"]),
                self._reason_doctor(doc, require_senior=False, fallback=doc_fallback),
                self._reason_nurses(n1, n2, strict=strict_nurses, fallback=nurse_fallback),
            ]

            suggestions.append({
                "patient_id":       p["patient_id"],
                "stay_id":          p["stay_id"],
                "name":             p.get("name"),
                "gender":           p.get("gender"),
                "age":              p.get("age"),
                "acuity":           p["acuity"],
                "effective_acuity": p["effective_acuity"],
                "acuity_lane":      "3-4",
                "priority_score":   round(p["priority_score"], 2),
                "base_score":       p["base_score"],
                "waiting_minutes":  p["waiting_minutes"],
                "bed_id":           bed["bed_id"]     if bed else None,
                "bed_number":       bed["bed_number"] if bed else None,
                "bed_type":         bed["bed_type"]   if bed else None,
                "ward_id":          bed["ward_id"]    if bed else None,
                "ward_name":        bed["ward_name"]  if bed else None,
                "doctor_id":        doc["id"]         if doc else None,
                "doctor_name":      doc["name"]       if doc else None,
                "doctor_type":      doc["type"]       if doc else None,
                "nurse1_id":        n1["id"]          if n1 else None,
                "nurse1_name":      n1["name"]        if n1 else None,
                "nurse1_role":      n1["role"]        if n1 else None,
                "nurse2_id":        n2["id"]          if n2 else None,
                "nurse2_name":      n2["name"]        if n2 else None,
                "nurse2_role":      n2["role"]        if n2 else None,
                "is_overflow":            False,
                "ward1_full":             False,
                "no_bed_available":       no_bed,
                "senior_fallback":        doc_fallback,
                "nurse_strict_fallback":  nurse_fallback,
                "reasons":                reasons,
            })

        # ── Lane 5 (acuity 5 — non-urgent) ───────────────────────────────────────
        # Acuity-5 patients do not consume a bed; they are routed to the
        # unurgent treatment path. Staff are still suggested but optional.
        for p in lane_low:
            exclude_ids: set = set()
            doc, doc_fallback = self._pick_doctor(doctors, require_senior=False,
                                                   extra_load=extra_doc_load,
                                                   exclude_ids=exclude_ids)
            if doc:
                exclude_ids.add(doc["id"])
                extra_doc_load[doc["id"]] = extra_doc_load.get(doc["id"], 0) + 1

            n1, n2, nurse_fallback = self._pick_nurses(nurses, strict=False,
                                                        extra_load=extra_nurse_load,
                                                        exclude_ids=exclude_ids)
            if n1:
                extra_nurse_load[n1["id"]] = extra_nurse_load.get(n1["id"], 0) + 1
            if n2:
                extra_nurse_load[n2["id"]] = extra_nurse_load.get(n2["id"], 0) + 1

            reasons = [
                "Acuity 5 — non-urgent: routed to unurgent treatment path (no bed required).",
                self._reason_doctor(doc, require_senior=False, fallback=doc_fallback),
                self._reason_nurses(n1, n2, strict=False, fallback=nurse_fallback),
            ]

            suggestions.append({
                "patient_id":       p["patient_id"],
                "stay_id":          p["stay_id"],
                "name":             p.get("name"),
                "gender":           p.get("gender"),
                "age":              p.get("age"),
                "acuity":           p["acuity"],
                "effective_acuity": p["effective_acuity"],
                "acuity_lane":      "5",
                "priority_score":   None,
                "base_score":       None,
                "waiting_minutes":  p["waiting_minutes"],
                "suggest_unurgent": True,
                "bed_id":           None,
                "bed_number":       None,
                "bed_type":         None,
                "ward_id":          None,
                "ward_name":        None,
                "doctor_id":        doc["id"]   if doc else None,
                "doctor_name":      doc["name"] if doc else None,
                "doctor_type":      doc["type"] if doc else None,
                "nurse1_id":        n1["id"]    if n1 else None,
                "nurse1_name":      n1["name"]  if n1 else None,
                "nurse1_role":      n1["role"]  if n1 else None,
                "nurse2_id":        n2["id"]    if n2 else None,
                "nurse2_name":      n2["name"]  if n2 else None,
                "nurse2_role":      n2["role"]  if n2 else None,
                "is_overflow":            False,
                "ward1_full":             False,
                "no_bed_available":       False,
                "senior_fallback":        False,
                "nurse_strict_fallback":  nurse_fallback,
                "reasons":                reasons,
            })

        return {
            "suggestions":    suggestions,
            "current_shift":  shift,
            "current_group":  group,
            "current_shifts": load_shifts,
            "current_groups": load_groups,
            "ward1_full":     global_ward1_full,
            "icu_shortage":   global_icu_shortage,
            "icu_occupants":  icu_occupants,
            "no_waiting":     False,
        }

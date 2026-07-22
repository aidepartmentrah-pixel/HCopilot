# HTTP API for the simulation feature.
#
# Endpoints:
#   GET  /api/simulation/sample-patient   — draw one random record from Patients.csv
#   POST /api/simulation/confirm-patient  — add the confirmed patient to DailyPatients
#   POST /api/simulation/or-suggest       — run the OR scheduler on all unassigned patients
#   POST /api/simulation/or-confirm       — apply one OR suggestion (create the assignment)

import math
import pandas as pd
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from db.session import SessionLocal
from db.models import DailyPatient, PatientBed, EDBed, WardBed, Ward, PatientDoctor, PatientNurse, Doctor, Nurse, Group

from .dataset_sampler import DatasetSampler
from .or_scheduler    import (ORScheduler, CRITICAL_WARD_ID,
                               _active_shift_name, _active_group_id,
                               _active_shift_names, _active_group_ids,
                               _active_group_names,
                               _effective_acuity)
from .models          import ConfirmPatientRequest, ORSuggestRequest, ORConfirmRequest, StaffSwapRequest

# Reuse the same write-path logic as the scheduling feature by importing its dependencies
from features.data_management.daily_patients_manager  import DailyPatientsManager
from features.patient_management.patient_manager       import PatientManager
from features.relations.relations_manager              import RelationsManager
from features.beds_display.bed_manager                 import BedManager
from features.staff_management.doctors_manager         import DoctorsManager
from features.staff_management.nurses_manager          import NursesManager

router     = APIRouter()
sampler    = DatasetSampler()
scheduler  = ORScheduler()
dp_mgr     = DailyPatientsManager()
pat_mgr    = PatientManager()
rel        = RelationsManager()
bed_mgr    = BedManager()
doc_mgr    = DoctorsManager()
nurse_mgr  = NursesManager()


# ── 1. Sample a random patient from the historical dataset ────────────────────

@router.get("/sample-patient")
async def sample_patient():
    """
    Draw one random record from Patients.csv and attach the next available
    patient_id / stay_id.  The record is shown in the confirmation modal;
    nothing is written to DailyPatients until the user clicks Confirm.
    """
    try:
        return sampler.sample()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 2. Confirm a sampled patient → write to DailyPatients ────────────────────

@router.post("/confirm-patient")
async def confirm_patient(body: ConfirmPatientRequest):
    """
    Add the confirmed patient to DailyPatients with the current timestamp as
    arrival_time.  Uses PatientManager.add so all existing duplicate-ID guards apply.
    """
    try:
        arrival_time = datetime.now().strftime("%Y-%m-%dT%H:%M")
        result = pat_mgr.add(
            patient_id      = body.subject_id,
            stay_id         = body.stay_id,
            arrival_time    = arrival_time,
            temperature     = body.temperature,
            heartrate       = body.heartrate,
            resprate        = body.resprate,
            o2sat           = body.o2sat,
            sbp             = body.sbp,
            dbp             = body.dbp,
            pain            = body.pain,
            acuity          = body.acuity,
            chiefcomplaint  = body.chiefcomplaint,
        )
        return {**result, "arrival_time": arrival_time, "patient_id": body.subject_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 3. Run the OR scheduler on all unassigned patients ────────────────────────

@router.post("/or-suggest")
async def or_suggest(body: ORSuggestRequest):
    """
    Compute assignment suggestions for every patient in DailyPatients who does not
    yet have a bed.  Accepts per-patient base-score overrides (for acuity 3/4 lane)
    and the strict-nurses flag.

    The response includes a ward1_full flag so the frontend can show an emergency
    alert when any critical patient had to be assigned outside Ward 1.
    """
    try:
        return scheduler.compute_suggestions(
            strict_nurses        = body.strict_nurses,
            base_score_overrides = body.base_score_overrides or {},
            shift_override       = body.shift_override,
            group_override       = body.group_override,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 4. Confirm one OR suggestion → create the assignment ──────────────────────

@router.post("/or-confirm")
async def or_confirm(body: ORConfirmRequest):
    """
    Apply a single OR suggestion by creating the patient↔bed relation and
    optionally linking doctor and nurses.  Mirrors the logic in
    /api/scheduling/assign so all availability guards run normally.
    Stamps bed_occupation_time with the current time.

    If use_chariot is True (no ICU bed was free for this critical patient and
    the user chose not to manually reassign an ICU occupant), a new temporary
    chariot bed is created here and used instead of body.bed_id.
    """
    try:
        occupation_time = datetime.now().strftime("%Y-%m-%dT%H:%M")

        # ── Unurgent path: no bed, just mark the patient and link staff ──────
        if body.use_unurgent:
            dp_mgr.mark_unurgent(body.stay_id or body.patient_id)

            if body.doctor_id:
                rel.add("patient_doctor", body.patient_id, body.doctor_id)
                doc_mgr.update_patient_count(body.doctor_id, +1)
            if body.nurse1_id:
                rel.add("patient_nurse", body.patient_id, body.nurse1_id)
                nurse_mgr.update_patient_count(body.nurse1_id, +1)
            if body.nurse2_id and body.nurse2_id != body.nurse1_id:
                rel.add("patient_nurse", body.patient_id, body.nurse2_id)
                nurse_mgr.update_patient_count(body.nurse2_id, +1)

            return {
                "ok":      True,
                "message": f"Patient {body.patient_id} routed to unurgent treatment path",
                "unurgent": True,
            }

        if body.use_chariot:
            chariot = bed_mgr.create_chariot_bed(ward_id=CRITICAL_WARD_ID)
            bed_id  = chariot["bed_id"]
        else:
            if body.bed_id is None:
                raise HTTPException(status_code=400, detail="bed_id is required unless use_chariot is set")
            bed_id = body.bed_id

        # Guard: bed must be available and patient must not already have a bed
        bed_mgr.check_bed_available(bed_id)
        bed_mgr.check_patient_has_no_bed(body.patient_id)

        # Link patient → bed
        rel.add("patient_bed", body.patient_id, bed_id)
        bed_mgr.add_bed_to_history(body.patient_id, bed_id)

        # Link patient → doctor (optional)
        if body.doctor_id:
            rel.add("patient_doctor", body.patient_id, body.doctor_id)
            doc_mgr.update_patient_count(body.doctor_id, +1)

        # Link patient → nurse(s) (optional)
        if body.nurse1_id:
            rel.add("patient_nurse", body.patient_id, body.nurse1_id)
            nurse_mgr.update_patient_count(body.nurse1_id, +1)
        if body.nurse2_id and body.nurse2_id != body.nurse1_id:
            rel.add("patient_nurse", body.patient_id, body.nurse2_id)
            nurse_mgr.update_patient_count(body.nurse2_id, +1)

        # Stamp bed_occupation_time on the DailyPatients row
        with SessionLocal() as session:
            if body.stay_id:
                rows = session.query(DailyPatient).filter(DailyPatient.stay_id == body.stay_id).all()
            else:
                rows = session.query(DailyPatient).filter(DailyPatient.subject_id == body.patient_id).all()
            for r in rows:
                r.bed_occupation_time = occupation_time
            session.commit()

        return {
            "ok":              True,
            "message":         f"Patient {body.patient_id} assigned to bed {bed_id}",
            "occupation_time": occupation_time,
            "bed_id":          bed_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 5. Current shift / group context (for the live clock) ────────────────────

@router.get("/current-context")
async def current_context():
    """
    Return ALL shifts and groups that are active right now (may be empty, one, or several).
    The clock uses this to display the live context without running the full OR scheduler.
    """
    active_shifts = _active_shift_names()   # [] when current hour matches no configured shift
    active_groups = _active_group_ids()     # [] when today matches no configured group

    group_names: list = []
    try:
        with SessionLocal() as session:
            groups_by_id = {g.group_id: g.name for g in session.query(Group).all()}
        for gid in active_groups:
            group_names.append(groups_by_id.get(gid, f"Group {gid}"))
    except Exception:
        group_names = [f"Group {gid}" for gid in active_groups]

    return {
        "shifts":          active_shifts,
        "groups":          active_groups,
        "group_names":     group_names,
        "no_shift_match":  len(active_shifts) == 0,
        "no_group_match":  len(active_groups) == 0,
    }


# ── 6. Staff audit — scan bed-assigned patients for shift/group mismatches ────

def _safe_audit(v):
    if v is None:
        return None
    try:
        if math.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        pass
    return v


def _occ_ts(p: dict) -> float:
    """Occupation-time → sort key. No time → +inf (sorted last)."""
    occ = p.get("occupation_time")
    if not occ or str(occ).strip() in ("", "nan", "None"):
        return float("inf")
    try:
        return -datetime.fromisoformat(str(occ).strip()).timestamp()  # negative → descending
    except ValueError:
        return float("inf")


@router.get("/staff-audit")
async def staff_audit(
    shift_override:  Optional[str]  = Query(default=None),
    group_override:  Optional[str]  = Query(default=None),
    strict_nurses:   bool           = Query(default=False),
):
    """
    Scan every patient who currently occupies a bed. For each assigned doctor and
    nurse (up to 1 doctor + 2 nurses), check whether their shift and rotation group
    match the current shift/group. Return a list of patients that have mismatches,
    each annotated with a replacement suggestion drawn from on-duty staff using the
    same OR fairness logic (fewest patients, then earliest availability timestamp).

    Sort order: acuity 1-2 first, then 3-4; within each group most recently
    admitted (bed_occupation_time DESC) comes first.
    """
    # When the user provides an override it is treated as a single-element list so the
    # same set-membership logic applies uniformly everywhere.
    active_shifts: list = [shift_override] if shift_override else _active_shift_names()
    active_groups: list = [group_override] if group_override else _active_group_names()

    active_shifts_lower: set = {s.lower() for s in active_shifts}
    active_groups_set:   set = {str(g) for g in active_groups}

    no_shift_match = len(active_shifts) == 0
    no_group_match = len(active_groups) == 0

    # ── Load all tables ──────────────────────────────────────────────────────
    with SessionLocal() as session:
        dp_rows = session.query(DailyPatient).all()
        pb_rows = session.query(PatientBed).all()
        if not dp_rows or not pb_rows:
            return {"patients": [], "current_shifts": active_shifts, "current_groups": active_groups,
                    "no_shift_match": no_shift_match, "no_group_match": no_group_match}

        dp = pd.DataFrame([{
            "subject_id": p.subject_id, "name": p.name,
            "acuity": p.acuity, "bed_occupation_time": p.bed_occupation_time,
        } for p in dp_rows])
        pb = pd.DataFrame([{"patient_id": r.patient_id, "bed_id": r.bed_id} for r in pb_rows])

        beds_df  = pd.DataFrame([{"bed_id": b.bed_id, "bed_number": b.bed_number} for b in session.query(EDBed).all()])
        wb_df    = pd.DataFrame([{"ward_id": w.ward_id, "bed_id": w.bed_id} for w in session.query(WardBed).all()])
        wards_df = pd.DataFrame([{"ward_id": w.ward_id, "ward_name": w.ward_name} for w in session.query(Ward).all()])
        pd_df    = pd.DataFrame([{"patient_id": r.patient_id, "doctor_id": r.doctor_id} for r in session.query(PatientDoctor).all()])
        pn_df    = pd.DataFrame([{"patient_id": r.patient_id, "nurse_id": r.nurse_id} for r in session.query(PatientNurse).all()])

        docs_df = pd.DataFrame([{
            "id": d.id, "name": d.name, "shift": d.shift, "work_days": d.work_days,
            "intern_or_not": d.intern_or_not, "patientNb": d.patientNb,
            "availabilityTimeStart": d.availabilityTimeStart, "absent": d.absent,
        } for d in session.query(Doctor).all()])
        nurses_df = pd.DataFrame([{
            "id": n.id, "name": n.name, "shift": n.shift, "group": n.group,
            "role": n.role, "patientNB": n.patientNB,
            "availabilityTimeStart": n.availabilityTimeStart, "absent": n.absent,
        } for n in session.query(Nurse).all()])

    if dp.empty or pb.empty:
        return {"patients": [], "current_shifts": active_shifts, "current_groups": active_groups,
                "no_shift_match": no_shift_match, "no_group_match": no_group_match}

    ward_names: dict = {}
    if not wards_df.empty and "ward_id" in wards_df.columns and "ward_name" in wards_df.columns:
        for _, r in wards_df.iterrows():
            ward_names[int(r["ward_id"])] = str(r["ward_name"])

    doc_lookup:   dict = {}
    if not docs_df.empty:
        for _, r in docs_df.iterrows():
            doc_lookup[int(r["id"])] = r.to_dict()

    nurse_lookup: dict = {}
    if not nurses_df.empty:
        for _, r in nurses_df.iterrows():
            nurse_lookup[int(r["id"])] = r.to_dict()

    # ── Build bed-info lookup by patient ────────────────────────────────────
    bed_by_patient: dict = {}
    for _, row in pb.iterrows():
        pid = int(row["patient_id"])
        bid = int(row["bed_id"])
        bed_number = f"#{bid}"
        if not beds_df.empty and "bed_id" in beds_df.columns:
            brows = beds_df[beds_df["bed_id"] == bid]
            if not brows.empty:
                bed_number = str(brows.iloc[0]["bed_number"])
        ward_name = "Unknown"
        if not wb_df.empty and "bed_id" in wb_df.columns:
            wrows = wb_df[wb_df["bed_id"] == bid]
            if not wrows.empty:
                wid = int(wrows.iloc[0]["ward_id"])
                ward_name = ward_names.get(wid, f"Ward {wid}")
        bed_by_patient[pid] = {"bed_id": bid, "bed_number": bed_number, "ward_name": ward_name}

    # ── Patient info from DailyPatients ─────────────────────────────────────
    patient_info: dict = {}
    for _, row in dp.iterrows():
        try:
            pid = int(row["subject_id"])
        except (ValueError, TypeError):
            continue
        acuity_raw = _safe_audit(row.get("acuity"))
        patient_info[pid] = {
            "patient_id":      pid,
            "name":            _safe_audit(row.get("name")),
            "acuity":          acuity_raw,
            "effective_acuity": _effective_acuity(acuity_raw),
            "occupation_time": _safe_audit(row.get("bed_occupation_time")),
        }

    # ── On-duty staff (match ANY active shift AND ANY active group) ──────────────
    on_duty_doc_ids:   set = set()
    on_duty_nurse_ids: set = set()
    on_duty_docs   = []
    on_duty_nurses = []

    if not docs_df.empty and not no_shift_match and not no_group_match:
        for _, r in docs_df.iterrows():
            if (str(r.get("shift", "")).strip().lower() in active_shifts_lower and
                    str(r.get("work_days", "")).strip() in active_groups_set):
                if str(r.get("absent", "")).strip().lower() not in ("true", "1", "yes"):
                    on_duty_docs.append(r.to_dict())
                    on_duty_doc_ids.add(int(r["id"]))

    if not nurses_df.empty and not no_shift_match and not no_group_match:
        for _, r in nurses_df.iterrows():
            if (str(r.get("shift", "")).strip().lower() in active_shifts_lower and
                    str(r.get("group", "")).strip() in active_groups_set):
                if str(r.get("absent", "")).strip().lower() not in ("true", "1", "yes"):
                    on_duty_nurses.append(r.to_dict())
                    on_duty_nurse_ids.add(int(r["id"]))

    # ── All non-absent staff (for manual override — includes off-duty) ─────────
    all_active_docs: list = []
    if not docs_df.empty:
        for _, r in docs_df.iterrows():
            if str(r.get("absent", "")).strip().lower() not in ("true", "1", "yes"):
                all_active_docs.append(r.to_dict())

    all_active_nurses: list = []
    if not nurses_df.empty:
        for _, r in nurses_df.iterrows():
            if str(r.get("absent", "")).strip().lower() not in ("true", "1", "yes"):
                all_active_nurses.append(r.to_dict())

    def _nb_doc(d):
        raw = d.get("patientNb", "")
        try:
            return int(float(raw)) if str(raw).strip() not in ("", "nan", "None") else 0
        except (ValueError, TypeError):
            return 0

    def _nb_nurse(n):
        raw = n.get("patientNB", "")
        try:
            return int(float(raw)) if str(raw).strip() not in ("", "nan", "None") else 0
        except (ValueError, TypeError):
            return 0

    def _avail_ts(staff: dict) -> float:
        """Parse availabilityTimeStart → Unix timestamp for tiebreaking (earlier = more rested)."""
        s = str(staff.get("availabilityTimeStart", "")).strip()
        if not s or s in ("nan", "None"):
            return float("inf")
        try:
            return datetime.fromisoformat(s).timestamp()
        except ValueError:
            return float("inf")

    def _doc_sort_key(d):
        """Primary: fewest patients. Tiebreak: earliest availabilityTimeStart. Matches OR scheduler."""
        return (_nb_doc(d), _avail_ts(d))

    def _nurse_sort_key(n):
        """Primary: fewest patients. Tiebreak: earliest availabilityTimeStart. Matches OR scheduler."""
        return (_nb_nurse(n), _avail_ts(n))

    def _get_doc_candidates(exclude_ids: set, prefer_senior: bool = False) -> list:
        """Return ALL non-absent doctors: on-duty first (OR-ranked), then off-duty (OR-ranked).
        Each entry carries an on_duty flag so the frontend can group them visually.
        The ranking within each group mirrors the OR scheduler: fewest patients → earliest rest."""
        on_pool  = [d for d in on_duty_docs    if int(d["id"]) not in exclude_ids]
        off_pool = [d for d in all_active_docs  if int(d["id"]) not in exclude_ids
                    and int(d["id"]) not in on_duty_doc_ids]

        def sort_pool(pool):
            if prefer_senior:
                seniors = sorted([d for d in pool if str(d.get("intern_or_not","")).strip()=="doctor"], key=_doc_sort_key)
                others  = sorted([d for d in pool if str(d.get("intern_or_not","")).strip()!="doctor"], key=_doc_sort_key)
                return seniors + others
            return sorted(pool, key=_doc_sort_key)

        ordered = sort_pool(on_pool) + sort_pool(off_pool)
        return [
            {
                "id":        int(d["id"]),
                "name":      _safe_audit(d.get("name")) or f"Dr. #{int(d['id'])}",
                "type":      str(d.get("intern_or_not", "")).strip(),
                "patientNb": _nb_doc(d),
                "on_duty":   int(d["id"]) in on_duty_doc_ids,
                "shift":     str(d.get("shift", "")).strip(),
                "group":     str(d.get("work_days", "")).strip(),
            }
            for d in ordered
        ]

    def _get_nurse_candidates(exclude_ids: set, prefer_role: Optional[str] = None, strict: bool = False) -> list:
        """Return non-absent nurses: on-duty first (OR-ranked), then off-duty (OR-ranked).
        strict=True: only show nurses whose role matches prefer_role; fall back to all if none found.
        Each entry carries an on_duty flag so the frontend can group them visually."""
        on_pool  = [n for n in on_duty_nurses    if int(n["id"]) not in exclude_ids]
        off_pool = [n for n in all_active_nurses  if int(n["id"]) not in exclude_ids
                    and int(n["id"]) not in on_duty_nurse_ids]

        def sort_pool(pool):
            if strict and prefer_role:
                role_pool = [n for n in pool if str(n.get("role", "")).strip() == prefer_role]
                # Fall back to all nurses in this pool if no matching role found
                return sorted(role_pool or pool, key=_nurse_sort_key)
            if prefer_role:
                matched = sorted([n for n in pool if str(n.get("role","")).strip()==prefer_role], key=_nurse_sort_key)
                others  = sorted([n for n in pool if str(n.get("role","")).strip()!=prefer_role], key=_nurse_sort_key)
                return matched + others
            return sorted(pool, key=_nurse_sort_key)

        ordered = sort_pool(on_pool) + sort_pool(off_pool)
        return [
            {
                "id":        int(n["id"]),
                "name":      _safe_audit(n.get("name")) or f"Nurse #{int(n['id'])}",
                "role":      str(n.get("role", "")).strip(),
                "patientNb": _nb_nurse(n),
                "on_duty":   int(n["id"]) in on_duty_nurse_ids,
                "shift":     str(n.get("shift", "")).strip(),
                "group":     str(n.get("group", "")).strip(),
            }
            for n in ordered
        ]

    # ── Build results ────────────────────────────────────────────────────────
    results = []
    patient_ids_with_beds = set(pb["patient_id"].astype(int).tolist())

    for pid in patient_ids_with_beds:
        if pid not in patient_info:
            continue
        info     = patient_info[pid]
        bed_info = bed_by_patient.get(pid, {})

        doc_ids = (
            pd_df[pd_df["patient_id"] == pid]["doctor_id"].astype(int).tolist()
            if not pd_df.empty else []
        )
        nurse_ids = (
            pn_df[pn_df["patient_id"] == pid]["nurse_id"].astype(int).tolist()
            if not pn_df.empty else []
        )

        all_assigned   = set(doc_ids) | set(nurse_ids)
        staff_assignments = []  # ALL assigned staff — mismatched or not

        # Doctor (at most 1)
        for did in doc_ids[:1]:
            doc = doc_lookup.get(did)
            if not doc:
                continue
            shift_ok    = (not no_shift_match) and str(doc.get("shift", "")).strip().lower() in active_shifts_lower
            group_ok    = (not no_group_match) and str(doc.get("work_days", "")).strip() in active_groups_set
            is_mismatch = not shift_ok or not group_ok
            candidates  = _get_doc_candidates(all_assigned, prefer_senior=info["effective_acuity"] <= 2)
            staff_assignments.append({
                "staff_id":             did,
                "staff_type":           "doctor",
                "staff_name":           _safe_audit(doc.get("name")) or f"Dr. #{did}",
                "current_staff_shift":  str(doc.get("shift", "—")),
                "current_staff_group":  str(doc.get("work_days", "—")),
                "expected_shifts":      active_shifts,
                "expected_groups":      active_groups,
                "shift_ok":             shift_ok,
                "group_ok":             group_ok,
                "is_mismatch":          is_mismatch,
                "no_shift_match":       no_shift_match,
                "no_group_match":       no_group_match,
                "candidates":           candidates,
            })

        # Nurses (at most 2)
        # In strict mode slot 0 must be RN, slot 1 must be PN — same rule as the OR scheduler.
        # In non-strict mode prefer the same role as the current nurse (soft preference).
        _strict_roles = ["RN", "PN"]
        for nurse_idx, nid in enumerate(nurse_ids[:2]):
            nurse = nurse_lookup.get(nid)
            if not nurse:
                continue
            shift_ok    = (not no_shift_match) and str(nurse.get("shift", "")).strip().lower() in active_shifts_lower
            group_ok    = (not no_group_match) and str(nurse.get("group", "")).strip() in active_groups_set
            is_mismatch = not shift_ok or not group_ok
            prefer_role = _strict_roles[nurse_idx] if strict_nurses else (str(nurse.get("role", "")).strip() or None)
            candidates  = _get_nurse_candidates(all_assigned, prefer_role=prefer_role, strict=strict_nurses)
            staff_assignments.append({
                "staff_id":             nid,
                "staff_type":           "nurse",
                "staff_name":           _safe_audit(nurse.get("name")) or f"Nurse #{nid}",
                "current_staff_shift":  str(nurse.get("shift", "—")),
                "current_staff_group":  str(nurse.get("group", "—")),
                "expected_shifts":      active_shifts,
                "expected_groups":      active_groups,
                "shift_ok":             shift_ok,
                "group_ok":             group_ok,
                "is_mismatch":          is_mismatch,
                "no_shift_match":       no_shift_match,
                "no_group_match":       no_group_match,
                "candidates":           candidates,
            })

        # Only patients with at least one mismatched staff member need attention
        if any(sa["is_mismatch"] for sa in staff_assignments):
            results.append({
                "patient_id":        pid,
                "name":              info.get("name"),
                "acuity":            info.get("acuity"),
                "effective_acuity":  info["effective_acuity"],
                "bed_number":        bed_info.get("bed_number", "—"),
                "ward_name":         bed_info.get("ward_name", "—"),
                "occupation_time":   info.get("occupation_time"),
                "staff_assignments": staff_assignments,
            })

    # Sort: acuity 1-2 first, then 3-4; within each tier most recently admitted first
    results.sort(key=lambda p: (
        0 if p["effective_acuity"] <= 2 else 1,
        _occ_ts(p),
    ))

    return {
        "patients":       results,
        "current_shifts": active_shifts,
        "current_groups": active_groups,
        "no_shift_match": no_shift_match,
        "no_group_match": no_group_match,
    }


# ── 7. Staff swap — apply one confirmed replacement ───────────────────────────

@router.post("/staff-swap")
async def staff_swap(body: StaffSwapRequest):
    """
    Replace one staff member on a patient assignment:
      1. Remove the old patient↔staff relation (graceful if already gone).
      2. Add the new patient↔staff relation.
      3. Decrement the old staff member's patient count; increment the new one's.
    """
    if body.staff_type not in ("doctor", "nurse"):
        raise HTTPException(status_code=400, detail="staff_type must be 'doctor' or 'nurse'")

    rel_table = "patient_doctor" if body.staff_type == "doctor" else "patient_nurse"

    try:
        rel.delete(rel_table, body.patient_id, body.old_staff_id)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise   # unexpected error — re-raise
        # Relation was already gone — continue to add the new one

    rel.add(rel_table, body.patient_id, body.new_staff_id)

    if body.staff_type == "doctor":
        doc_mgr.update_patient_count(body.old_staff_id, -1)
        doc_mgr.update_patient_count(body.new_staff_id, +1)
    else:
        nurse_mgr.update_patient_count(body.old_staff_id, -1)
        nurse_mgr.update_patient_count(body.new_staff_id, +1)

    return {
        "ok":     True,
        "message": (
            f"{body.staff_type.capitalize()} #{body.old_staff_id} replaced by "
            f"#{body.new_staff_id} for patient #{body.patient_id}"
        ),
    }

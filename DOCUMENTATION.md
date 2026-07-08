# HCopilot — Complete Project Documentation

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Quick Start](#3-quick-start)
4. [Data Model — CSV Files](#4-data-model--csv-files)
5. [Feature Reference](#5-feature-reference)
   - [5.1 Authentication & User Management](#51-authentication--user-management)
   - [5.2 Bed Management](#52-bed-management)
   - [5.3 Patient Management](#53-patient-management)
   - [5.4 Scheduling](#54-scheduling)
   - [5.5 Simulation & OR Scheduler](#55-simulation--or-scheduler)
   - [5.6 Flow Prediction](#56-flow-prediction)
   - [5.7 Statistics](#57-statistics)
   - [5.8 Unurgent Path](#58-unurgent-path)
   - [5.9 Staff Management](#59-staff-management)
   - [5.10 Data Management](#510-data-management)
   - [5.11 Dataset Display](#511-dataset-display)
   - [5.12 Model Files](#512-model-files)
   - [5.13 Relations](#513-relations)
   - [5.14 Reset](#514-reset)
6. [OR Scheduler — In-Depth Guide](#6-or-scheduler--in-depth-guide)
   - [6.1 When the Scheduler Runs](#61-when-the-scheduler-runs)
   - [6.2 Who Is "Unassigned"](#62-who-is-unassigned)
   - [6.3 Current Shift and Group Detection](#63-current-shift-and-group-detection)
   - [6.4 Three Triage Lanes](#64-three-triage-lanes)
   - [6.5 Patient Priority Within Each Lane](#65-patient-priority-within-each-lane)
   - [6.6 Bed Selection](#66-bed-selection)
   - [6.7 Staff Selection](#67-staff-selection)
   - [6.8 OR Scheduler Parameters](#68-or-scheduler-parameters-orsuggestrequest)
   - [6.9 OR Confirm Parameters](#69-or-confirm-parameters-orconfirmrequest)
   - [6.10 Suggestion Response Fields](#610-suggestion-response-fields)
   - [6.11 Multi-Shift and Multi-Group Overlap](#611-multi-shift-and-multi-group-overlap)
   - [6.12 Staff Audit](#612-staff-audit)
   - [6.13 Chariot Bed Lifecycle](#613-chariot-bed-lifecycle)
7. [API Endpoint Reference](#7-api-endpoint-reference)
8. [Configuration Guide](#8-configuration-guide)
9. [Vital Sign Validation Ranges](#9-vital-sign-validation-ranges)
10. [User Roles & Access Control](#10-user-roles--access-control)
11. [Frontend Structure](#11-frontend-structure)

---

## 1. Project Overview

**HCopilot** is a hospital Emergency Department (ED) management system built for the Université de Haute-Alsace. It provides a complete operational dashboard for ED staff to:

- Track real-time bed availability and patient occupancy
- Register and manage patients during their ED stay
- Assign patients to beds and link them to doctors and nurses
- Automatically generate staff/bed assignment suggestions via an OR (Operations Research) scheduler
- Simulate patient intake from a historical dataset
- Forecast future patient flow using a trained XGBoost machine learning model
- Monitor aggregate ED performance statistics (wait times, LOS, acuity, vitals)
- Manage the non-urgent (acuity 5) patient pathway separately

**Key characteristic:** There is no database. Every piece of operational data is stored in plain CSV files inside `backend/datasets/`. All reads and writes go through dedicated manager classes that handle file I/O directly.

---

## 2. Architecture

```
HCopilot/
├── backend/                    Python / FastAPI server
│   ├── app.py                  Single entry point; mounts all routers + static files
│   ├── datasets/               All CSV data files (the "database")
│   ├── models/
│   │   └── AIModels/           Trained .pkl model files (Flow_prediction.pkl)
│   └── features/               One sub-package per feature
│       ├── auth/               Login + user account management
│       ├── beds_display/       Bed CRUD, occupancy, assign/discharge
│       ├── data_management/    Wards, DailyPatients, LogPatients
│       ├── dataset_display/    Paginated CSV browser + remote refresh
│       ├── flow_prediction/    XGBoost patient-flow forecasting
│       ├── model_files/        .pkl model file listing
│       ├── patient_management/ Patient CRUD (extends data_management)
│       ├── relations/          Generic many-to-many table CRUD
│       ├── reset/              Destructive data-clear endpoints
│       ├── scheduling/         Assignment create/edit/discharge
│       ├── simulation/         Random patient intake + OR scheduler
│       ├── staff_management/   Doctors, nurses, shifts, groups
│       ├── statistics/         Aggregate KPI endpoints
│       ├── timestamp_utils.py  Shared CSV + timestamp helpers
│       └── unurgent/           Non-urgent (acuity-5) patient path
│
└── frontend/                   Vanilla HTML/CSS/JS single-page app
    ├── index.html              Single HTML shell; all pages are JS-rendered
    ├── css/                    Per-section stylesheets
    └── js/                     Per-section JavaScript modules
```

### Request Flow

```
Browser  →  GET  /                    FastAPI serves frontend/index.html
Browser  →  GET  /api/beds/list       FastAPI routes to beds_display router
Browser  →  POST /api/auth/login      FastAPI routes to auth router
```

All API endpoints are under `/api/…`. The frontend is served as static files from the same HTTP server, so no separate web server is needed in development.

---

## 3. Quick Start

### Prerequisites

- Python 3.11+ with the following packages:
  `fastapi`, `uvicorn`, `pandas`, `numpy`, `joblib`, `xgboost`, `requests`
- Install with: `pip install fastapi uvicorn pandas numpy joblib xgboost requests`

### Running the Server

```bash
cd backend
python app.py
```

The server starts at **http://localhost:8090**. Open that URL in a browser to access the full UI.

Alternatively, using uvicorn directly:

```bash
cd backend
uvicorn app:app --host localhost --port 8090 --reload
```

### Default Login

| Username | Password | Role  |
|----------|----------|-------|
| admin    | admin    | admin |

The admin account is auto-created on first run if `Users.csv` does not exist.

---

## 4. Data Model — CSV Files

All data lives in `backend/datasets/`. Files are created automatically on first use.

### Patient Data

| File | Primary Key | Purpose |
|------|-------------|---------|
| `DailyPatients.csv` | `stay_id` | Active (currently admitted) patient stays |
| `LogPatients.csv` | `stay_id` | Archived (discharged) patient stays |
| `Patients.csv` | `subject_id` | Historical dataset used for simulation sampling |

**DailyPatients / LogPatients columns:**

| Column | Type | Description |
|--------|------|-------------|
| `subject_id` | int | Patient identifier (may appear once in DailyPatients) |
| `stay_id` | int | Unique stay identifier (primary key) |
| `name` | str | Patient name |
| `gender` | str | Patient gender |
| `age` | int | Age in years |
| `arrival_time` | ISO datetime | When the patient arrived in the ED |
| `bed_occupation_time` | ISO datetime | When the patient was assigned to a bed |
| `departure_time` | ISO datetime | When the patient was discharged |
| `temperature` | float | Body temperature (°C) |
| `heartrate` | float | Heart rate (bpm) |
| `resprate` | float | Respiratory rate (breaths/min) |
| `o2sat` | float | Oxygen saturation (%) |
| `sbp` | float | Systolic blood pressure (mmHg) |
| `dbp` | float | Diastolic blood pressure (mmHg) |
| `pain` | str | Pain description |
| `acuity` | float | ESI triage level 1–5 |
| `chiefcomplaint` | str | Chief complaint text |
| `unurgent` | str | "True" if routed to the non-urgent path (DailyPatients only) |

### Bed & Ward Data

| File | Primary Key | Purpose |
|------|-------------|---------|
| `EDbeds.csv` | `bed_id` | Physical bed registry |
| `Wards.csv` | `ward_id` | Hospital ward definitions |

**EDbeds.csv columns:**

| Column | Values | Description |
|--------|--------|-------------|
| `bed_id` | int | Auto-incremented identifier |
| `bed_number` | str | Human-readable label (e.g. "A-12", "CHARIOT-5") |
| `bed_status` | "Available", "Under Repair" | Physical condition; "Occupied" is never stored — it is computed |
| `type` | "normal", "monitor", "ICU", "chariot" | Equipment type |

**Wards.csv columns:** `ward_id`, `ward_name`, `department_id`

### Staff Data

| File | Primary Key | Purpose |
|------|-------------|---------|
| `Doctors.csv` | `id` | Doctor and intern records |
| `Nurses.csv` | `id` | Nurse records |
| `Shifts.csv` | `shift_id` | Named time windows (morning/night) |
| `Groups.csv` | `group_id` | Rotation day groups |
| `Users.csv` | `user_id` | Application user accounts |

**Doctors.csv columns:**

| Column | Values | Description |
|--------|--------|-------------|
| `id` | int | Auto-incremented identifier |
| `name` | str | Display name |
| `intern_or_not` | "doctor", "intern" | Seniority type |
| `shift` | shift name | Which shift this doctor works |
| `work_days` | group_id int | Which rotation group this doctor belongs to |
| `patientNb` | str (int or "") | Current number of assigned patients |
| `availabilityTimeStart` | ISO datetime or "" | When their last patient was discharged |
| `absent` | "True"/"False" | Whether they are currently absent |

**Nurses.csv columns:**

| Column | Values | Description |
|--------|--------|-------------|
| `id` | int | Auto-incremented identifier |
| `name` | str | Display name |
| `role` | "RN", "PN", "Bed_Admission" | Nurse role type |
| `shift` | shift name | Which shift this nurse works |
| `group` | group_id int | Which rotation group this nurse belongs to |
| `patientNB` | str (int or "") | Current number of assigned patients |
| `availabilityTimeStart` | ISO datetime or "" | When their last patient was discharged |
| `absent` | "True"/"False" | Whether they are currently absent |

### Relation Tables (Many-to-Many Links)

| File | Columns | Meaning |
|------|---------|---------|
| `patient_bed.csv` | `patient_id`, `bed_id` | Which bed a patient currently occupies |
| `patient_doctor.csv` | `patient_id`, `doctor_id` | Which doctor is assigned to a patient |
| `patient_nurse.csv` | `patient_id`, `nurse_id` | Which nurses are assigned to a patient |
| `ward_bed.csv` | `ward_id`, `bed_id` | Which ward a bed belongs to |
| `ward_doctor.csv` | `ward_id`, `doctor_id` | Which ward a doctor is assigned to |
| `ward_nurse.csv` | `ward_id`, `nurse_id` | Which ward a nurse is assigned to |

> **Important:** A patient may appear in at most one row in `patient_bed.csv` (one bed per patient). A patient may have multiple rows in `patient_nurse.csv` (up to two nurses per patient).

### Flow Prediction Datasets (read-only by the ML model)

| File | Purpose |
|------|---------|
| `edstays_with_synth.csv` | Historical ED visits with synthetic timestamps (~61 MB) |
| `meteo.csv` | Historical daily temperature data (merged with ED arrivals) |
| `vitalsign_with_synth.csv` | Historical vital signs |
| `medrecon_with_synth.csv` | Historical medication reconciliation |
| `pyxis_with_synth.csv` | Historical medication dispensing |
| `diagnosis.csv` | Historical diagnosis codes |

---

## 5. Feature Reference

### 5.1 Authentication & User Management

**Location:** `backend/features/auth/`

Provides login and full CRUD for user accounts backed by `Users.csv`.

**How it works:**
- Passwords are stored as **SHA-256 hashes** — plain text is never persisted.
- On first run, an `admin` / `admin` account is created automatically.
- Each user has three comma-separated access fields that control what parts of the frontend are visible: `sections`, `settings_tabs`, and `statistics_tabs`.
- Deleting the last remaining admin account is blocked by the system.
- Back-fill: if an existing account row is missing a newer field (e.g. `statistics_tabs`) it is automatically filled with the full list on next read, so upgrades are non-breaking.

**User roles:**
- `admin` — full access to all sections, settings tabs, and statistics tabs by default
- `user` — access is limited to the sections, settings_tabs, and statistics_tabs explicitly granted

**Available page keys (sections):**
`home`, `flow-prediction`, `beds-display`, `patients`, `scheduling`, `simulation`, `unurgent`, `statistics`, `settings`

**Available settings tab keys:**
`beds`, `doctors`, `nurses`, `wards`, `daily-patients`, `log-patients`, `shifts`, `groups`, `datasets`, `relations`, `models`, `features`, `reset`

**Available statistics tab keys:**
`patients`, `nurses`, `doctors`
(If `statistics_tabs` is empty for a non-admin user who has `statistics` in `sections`, all three tabs default to accessible for backward compatibility.)

---

### 5.2 Bed Management

**Location:** `backend/features/beds_display/`

Manages hospital beds and their real-time occupancy state.

**Key concepts:**
- The `bed_status` column in `EDbeds.csv` only ever stores `"Available"` or `"Under Repair"`. The value `"Occupied"` is **computed at read-time** by checking `patient_bed.csv` — it is never written to disk.
- A bed can be in one of three display states: `Available`, `Occupied`, `Under Repair`. Under Repair overrides Occupied if both conditions apply.

**Bed types:**

| Type | Description |
|------|-------------|
| `normal` | Standard ED bed |
| `monitor` | Bed with cardiac/vital monitoring equipment |
| `ICU` | Intensive care unit bed — required for acuity 1/2 patients |
| `chariot` | Temporary overflow bed auto-created by the OR scheduler when no ICU bed is free |

**Chariot beds:**
- Created automatically by the OR scheduler (`create_chariot_bed()`) when a critical patient needs an ICU-equivalent bed but all ICU beds are occupied.
- Named `CHARIOT-{id}` in the bed number field to be visually distinguishable.
- **Auto-deleted** after the patient is discharged/moved, unless another critical patient is still waiting with insufficient ICU/chariot capacity to cover them (managed by `cleanup_chariot_if_unneeded()`).

**Operations:**
- List all beds with live status and patient info
- Get aggregate stats (total, occupied, available, under repair, occupancy %)
- Add / Modify / Delete beds
- Toggle condition between Available and Under Repair
- Assign a patient to a bed (with optional `bed_occupation_time`)
- Move a patient from one bed to another
- Release a bed (remove patient link without archiving)
- Full discharge from bed (archive to log, clear all relations, decrement staff counts)

---

### 5.3 Patient Management

**Location:** `backend/features/patient_management/`

Extends the core data management layer with patient-centric logic.

**Key concepts:**
- Subject IDs and stay IDs are auto-suggested by the system. New IDs are seeded at `10,000,001` (patient) and `30,000,001` (stay) to avoid collision with historical Patients.csv data.
- A patient (`subject_id`) may only have **one active stay** at a time in `DailyPatients.csv`. Duplicate subject_id entries are rejected at creation time.
- The frontend uses the name `patient_id` for what the CSV stores as `subject_id` — the renaming happens in `PatientManager._row_to_dict()`.

**Operations:**
- Get next available patient_id and stay_id (`/next-ids`)
- List all active patients
- Add a new patient stay (with full vital signs and demographics)
- Modify an existing patient stay
- Delete a patient stay (also clears all relation links and decrements staff counts)

> **Note:** The Change Bed action is **not available** in the Patients section. Bed reassignment for active patients is only accessible via **Beds Display** (the bed detail modal) and **Settings → Daily Patients**. This keeps the Patients view read-focused and avoids accidental mid-workflow bed moves.

---

### 5.4 Scheduling

**Location:** `backend/features/scheduling/`

Manages the full assignment lifecycle — linking a patient to a bed and optionally to a doctor and up to two nurses.

**What an assignment is:**
An assignment is not a separate database record. It is the combination of rows in:
- `patient_bed.csv` (the bed link — required)
- `patient_doctor.csv` (the doctor link — optional)
- `patient_nurse.csv` (up to 2 nurse links — optional)

**Operations:**
- `GET /list` — view all current assignments (joined from the three relation tables)
- `POST /assign` — create a new assignment (validates bed availability, patient not already assigned)
- `PUT /edit/{patient_id}/{old_bed_id}` — update an existing assignment (change bed, doctor, nurses)
- `DELETE /delete/{patient_id}/{bed_id}` — remove assignment without archiving
- `POST /discharge/{patient_id}/{bed_id}` — full discharge: stamp departure time → copy to LogPatients → remove from DailyPatients → clear all links → decrement staff patient counts

**Timestamp validation on discharge:**
The departure time is validated with `validate_discharge_time()` which allows skipping a `bed_occupation_time` that is itself invalid (earlier than arrival), to prevent legacy data entry errors from permanently blocking a discharge.

---

### 5.5 Simulation & OR Scheduler

**Location:** `backend/features/simulation/`

Three separate tools in one page: a patient intake simulator, the OR (Operations Research) automatic assignment scheduler, and the Staff Audit panel. All three share the same live clock widget at the top that shows the current active shift and group.

#### Live Clock Widget

A persistent bar at the top of the Simulation page displays:
- Current time (updates every second)
- All currently active shift names (e.g. `"Morning & Night shift"` when two shifts overlap at a boundary hour)
- All currently active rotation group names (e.g. `"Group 1 & Group 2"`)

Powered by `GET /api/simulation/current-context`. Shift and group override dropdowns in the bar let the operator simulate a different time/day context — overriding which staff are considered "on duty" for both the OR scheduler and the staff audit without changing the actual time.

#### Patient Intake Simulator

Draws a random record from the historical `Patients.csv` dataset and presents it to the user for confirmation before adding it to `DailyPatients.csv`.

**Flow:**
1. `GET /sample-patient` — draws a random row from `Patients.csv`, filtering out subjects already active in `DailyPatients`. Returns clinical data pre-loaded with new patient_id/stay_id.
2. User reviews the record in a confirmation modal.
3. `POST /confirm-patient` — adds the confirmed patient to `DailyPatients` with the current timestamp as `arrival_time`.

#### OR Scheduler

Automatically computes optimal bed + staff assignment suggestions for all unassigned patients currently in `DailyPatients`. Only staff who are on the current active shift AND rotation group (and not marked absent) are considered for suggestions.

**Flow:**
1. `POST /or-suggest` — runs the scheduling algorithm and returns a suggestion for every unassigned patient.
2. User reviews suggestions (shown with detailed reason cards). Each suggestion card shows the suggested bed, doctor, and nurses; flags for overflow/unavailable ICU; and the active shift/group context used.
3. `POST /or-confirm` — applies a single suggestion (creates the bed/doctor/nurse relations).

The OR scheduler is described in full detail in [Section 6](#6-or-scheduler--in-depth-guide).

#### Staff Audit

Scans all currently bed-assigned patients and checks whether their linked doctor and nurses are still on the active shift and rotation group. Designed to catch stale assignments after a shift change.

**Flow:**
1. User clicks "Run Audit" in the audit panel.
2. `GET /staff-audit` compares each assigned staff member's `shift` and `work_days`/`group` fields against the currently active shift and group names (or overrides from the clock bar).
3. Only patients who have at least one mismatched staff member are returned, sorted by acuity (critical first), then most recently admitted.
4. Each flagged patient shows a mismatch card listing which staff are mismatched and why (shift mismatch, group mismatch, or both), plus ranked replacement candidate dropdowns.
5. User selects a replacement and clicks "Apply swap" → `POST /staff-swap` updates the assignment and adjusts both staff members' patient counts.

**Replacement candidate ranking:**
Candidates are always split into two tiers shown in this order:
1. **On-duty** staff (matching the active shift and group, not absent) — ranked by fewest patients first, then longest idle.
2. **Off-duty** staff (not absent, but not currently on shift/group) — same ranking, listed as fallback.

**Strict nurses mode:**
A "Strict nurses" checkbox in the audit panel forces role-based nurse slot assignment:
- Nurse slot 0 → must be an `RN` (Registered Nurse)
- Nurse slot 1 → must be a `PN` (Practical Nurse)

When toggled, the audit re-runs automatically with `strict_nurses=true` and the candidate dropdowns filter accordingly. If the required role is unavailable in the on-duty pool, the system falls back to any available nurse in that pool.

**Absent staff exclusion:**
Staff marked as absent in Settings are excluded from all candidate pools in both the OR scheduler and the staff audit. The absent flag is a soft toggle — the record is preserved, and the flag can be cleared when the staff member returns. Absent staff are never suggested as replacements or new assignments.

---

### 5.6 Flow Prediction

**Location:** `backend/features/flow_prediction/`

Uses a trained **XGBoost** gradient-boosted tree model to forecast daily patient arrivals for up to 30 days ahead.

**How it works:**
1. Historical ED visit data (`edstays_with_synth.csv`) is resampled to a daily arrival count.
2. Weather data (`meteo.csv`) is merged in as an additional feature.
3. Time-series features are engineered: calendar features (day of week, month, ISO week), lag features (yesterday's count, same day last week), and a 7-day rolling mean.
4. The trained model (`backend/models/AIModels/Flow_prediction.pkl`) is loaded from disk.
5. Predictions are made one day at a time using an **auto-regressive loop**: each day's prediction feeds back as the lag input for the next day.

**Caching strategy:**
Both the model file and the feature DataFrame are cached in module-level variables and only reloaded when the underlying file changes on disk (mtime comparison). This makes the first request slow but all subsequent requests fast.

**Endpoints:**
- `GET /predict?days=N` — N-day ahead forecast (default 30)
- `GET /historical?days=N` — last N days of actual counts from the dataset (default 90)
- `GET /stats` — aggregate statistics about the full historical dataset

**Features used by the model:**

| Feature | Description |
|---------|-------------|
| `temperature_2m_mean` | Daily average temperature (°C) |
| `dayofweek` | 0=Monday … 6=Sunday |
| `month` | 1–12 |
| `weekofyear` | ISO week number 1–53 |
| `y_lag_1` | Patient count from the previous day |
| `y_lag_7` | Patient count from 7 days ago (same weekday last week) |
| `y_roll_7` | 7-day rolling mean of patient counts |

**Lag bootstrapping for future predictions:**
- Days 1–7: lags reference the real historical tail from the dataset.
- Day 8+: lags reference previously predicted values (auto-regressive).
- Temperature: the 7-day historical average is used as a static proxy for all future days.

---

### 5.7 Statistics

**Location:** `backend/features/statistics/`

A three-tab dashboard that computes aggregate KPIs on-the-fly from `DailyPatients.csv` (active) and `LogPatients.csv` (discharged), plus per-staff statistics from `Nurses.csv` and `Doctors.csv`.

Per-user tab access is controlled by the `statistics_tabs` field (see Section 10). If a user does not have access to the Patients tab, the section opens directly on the first tab they are permitted to see.

#### Patients tab

**Data quality caps:**
- Wait times > 1,440 minutes (24 h) are excluded as data-entry errors.
- Length of stay > 10,080 minutes (7 days) are excluded as test artifacts.

Seven KPI panels: wait-to-bed distribution, LOS distribution, ESI acuity breakdown (1–5), hourly/daily arrival throughput, top chief complaints, vital sign aggregates, and a data-quality warning banner (shown only when quality % < 80).

#### Nurses tab / Doctors tab

Both tabs share the same structure:
- **KPI row:** total headcount, active (non-absent) count, absence rate, average patient load, unique patients covered.
- **Role/type distribution** doughnut chart (nurse roles: PN, RN, Bed_Admission; doctor types: attending vs intern).
- **Shift distribution:** counts staff per shift using whatever shift names are stored in the CSV — including shift names from deleted shifts that were not cleared from staff records (those appear in the distribution as-is, not as "Unassigned"; staff with a null/empty shift appear as "Unassigned").
- **Patient-load table:** buckets staff by number of assigned patients (0, 1, 2–3, 4–5, >5).
- **Staff member lookup:** a dropdown lists all staff; selecting one loads a profile card showing personal details, assigned active patients with ESI and chief complaint, assigned beds with bed type and ward, and a ward distribution summary.

**Endpoints:**

| Endpoint | Returns |
|----------|---------|
| `GET /overview` | Active patient count, avg wait time, avg LOS, occupancy rate, avg acuity, long-waiter % |
| `GET /data-quality` | Timestamp integrity audit: missing arrivals, inverted timestamps, quality % |
| `GET /waiting-times` | Wait-to-bed and LOS distributions with bucket counts and averages |
| `GET /acuity-breakdown` | Per-ESI-level (1–5) counts, avg wait, avg LOS |
| `GET /throughput` | Arrival counts by hour-of-day (0–23) and day-of-week |
| `GET /top-complaints` | Top 10 chief complaints by patient volume with avg LOS |
| `GET /vitals-summary` | Mean/min/max for all six vital signs with clinical normal-range flags |
| `GET /staff-stats` | Nurse & doctor headcount, role/type breakdown, shift distribution, patient-load buckets |
| `GET /staff-member/nurse/{id}` | Full nurse profile: personal fields, assigned active patients, beds, ward distribution |
| `GET /staff-member/doctor/{id}` | Full doctor profile: personal fields, assigned active patients, beds, ward distribution |

**Vital sign normal ranges (used for the `normal` flag):**

| Vital | Normal Range | Unit |
|-------|-------------|------|
| Temperature | 36.1–37.5 | °C |
| Heart rate | 60–100 | bpm |
| Respiratory rate | 12–20 | br/min |
| O2 saturation | 95–100 | % |
| Systolic BP | 90–140 | mmHg |
| Diastolic BP | 60–90 | mmHg |

---

### 5.8 Unurgent Path

**Location:** `backend/features/unurgent/`

A separate treatment pathway for **acuity 5 (non-urgent)** patients who do not require a physical bed.

**How patients enter this path:**
- The OR scheduler automatically suggests `use_unurgent = True` for all acuity-5 patients.
- When the user confirms an acuity-5 OR suggestion, the patient's `DailyPatients` row is flagged with `unurgent = "True"` and staff are linked normally — but no bed is assigned.

**Operations:**
- `GET /list` — return all currently flagged unurgent patients, enriched with their linked doctor/nurse IDs.
- `POST /discharge/{patient_id}` — discharge workflow:
  1. Stamp `departure_time` (defaults to now).
  2. Validate departure is after arrival.
  3. Archive the row to `LogPatients.csv`.
  4. Remove from `DailyPatients.csv`.
  5. Clear `patient_doctor` and `patient_nurse` relation rows and decrement staff counts.
  > No bed to release — unurgent patients never had one.

---

### 5.9 Staff Management

**Location:** `backend/features/staff_management/`

Manages doctors, nurses, shifts, and rotation groups.

#### Doctors & Interns

- Type (`intern_or_not`): `"doctor"` (senior) or `"intern"`.
- Each doctor belongs to a shift (by name, e.g. `"morning"`) and a rotation group (`work_days` stores a `group_id`).
- `patientNb`: tracks how many patients are currently assigned. Cleared to `""` on discharge.
- `availabilityTimeStart`: ISO timestamp of when the doctor's last patient was discharged. Used by the OR scheduler for fairness ordering (longest-idle doctor gets priority when patient loads are equal).
- `absent` toggle: marks a doctor as unavailable without deleting their record. Absent staff are excluded from OR suggestions.

#### Nurses

- Role: `"RN"` (Registered Nurse), `"PN"` (Practical Nurse), or `"Bed_Admission"`.
- Same shift, group, `patientNB`, `availabilityTimeStart`, and `absent` mechanics as doctors.
- Note the column name is `patientNB` (capital NB) for nurses vs `patientNb` for doctors — a legacy naming inconsistency preserved for backward compatibility.

#### Shifts

Stored in `Shifts.csv`. A shift is a named time window:

| Column | Description |
|--------|-------------|
| `shift_id` | Auto-incremented integer |
| `name` | e.g. `"morning"`, `"night"` |
| `start_hour` | 24h integer (0–23) |
| `end_hour` | 24h integer (0–23); if < start_hour, the shift crosses midnight |

**Default shifts (auto-created on first run):**
- `morning`: 07:00 → 19:00
- `night`: 19:00 → 07:00

**Unique name enforcement:** Shift names must be unique (case-insensitive). Adding or renaming a shift to a name that already exists returns HTTP 409.

**Cascade rename:** When a shift name is changed, the system automatically updates the `shift` field of every doctor and nurse record that referenced the old name, so existing assignments stay valid after a rename.

#### Rotation Groups

Stored in `Groups.csv`. A group maps a set of weekdays to a set of staff members.

| Column | Description |
|--------|-------------|
| `group_id` | Auto-incremented integer |
| `name` | e.g. `"Group 1"`, `"Group 2"` |
| `days` | Comma-separated weekday integers: 0=Monday … 6=Sunday |

**Default groups (auto-created on first run):**
- `Group 1`: days `"0,1,2,3"` (Monday–Thursday)
- `Group 2`: days `"4,5,6"` (Friday–Sunday)

**Unique name enforcement:** Group names must be unique (case-insensitive). Adding or renaming a group to a name that already exists returns HTTP 409.

**Cascade rename:** When a group name is changed, the system automatically updates the `work_days` field (doctors) and `group` field (nurses) of every staff record that referenced the old name.

---

### 5.10 Data Management

**Location:** `backend/features/data_management/`

Provides direct CRUD access to the three core data stores and the ward registry, all accessible from the Settings panel.

| Sub-resource | Endpoints | CSV file |
|--------------|-----------|----------|
| Wards | list, stats, add, modify, delete | `Wards.csv` |
| DailyPatients | list, stats, add, modify, delete | `DailyPatients.csv` |
| LogPatients | list, stats, modify, delete | `LogPatients.csv` |

Deleting a ward cascade-removes all `ward_bed`, `ward_doctor`, and `ward_nurse` relation rows.

All vital-sign fields are validated against clinical ranges at the HTTP boundary (see [Section 9](#9-vital-sign-validation-ranges)).

---

### 5.11 Dataset Display

**Location:** `backend/features/dataset_display/`

Provides a paginated browser for all local CSV datasets. Designed to handle very large files efficiently.

**Key optimisation:** Large files (e.g. `edstays_with_synth.csv` at ~61 MB) are never fully loaded. Row counts are computed via fast newline counting (not `pd.read_csv`), and page reads use `pandas skiprows + nrows` to load only the slice needed.

**Remote refresh:** The settings panel can pull fresh data from a companion upstream API server running at `http://127.0.0.1:8100`. This is an optional feature — the system works fully from local CSV files without it.

**Known datasets:**
`diagnosis`, `Patients`, `vitalsign_with_synth`, `meteo`, `edstays_with_synth`, `medrecon_with_synth`, `pyxis_with_synth`, `Wards`, `DailyPatients`

---

### 5.12 Model Files

**Location:** `backend/features/model_files/`

Lists trained AI model files (`.pkl`) found in `backend/models/AIModels/`. Returns name, size, size in MB, and last-modified timestamp for each file. Does not load models into memory — that is handled by the flow prediction feature.

---

### 5.13 Relations

**Location:** `backend/features/relations/`

Generic CRUD for all six many-to-many relation tables. A single `RelationsManager` class handles all tables through a registry (`TABLES` dict), so no separate router is needed for each relationship.

Supported tables: `patient_bed`, `patient_doctor`, `patient_nurse`, `ward_bed`, `ward_doctor`, `ward_nurse`.

When adding a `patient_doctor` or `patient_nurse` relation via this API, the corresponding staff member's `patientNb`/`patientNB` count is automatically incremented. Deleting one decrements it.

---

### 5.14 Reset

**Location:** `backend/features/reset/`

Destructive maintenance endpoints that wipe one or more CSV files back to an empty header-only state. Accessible from Settings → Reset.

| Endpoint | Wipes |
|----------|-------|
| `POST /patients` | DailyPatients, LogPatients, patient_bed, patient_doctor, patient_nurse + resets staff counts |
| `POST /beds` | EDbeds, patient_bed, ward_bed |
| `POST /doctors` | Doctors, patient_doctor, ward_doctor |
| `POST /nurses` | Nurses, patient_nurse, ward_nurse |
| `POST /wards` | Wards, ward_bed, ward_doctor, ward_nurse |
| `POST /relations` | All 6 relation tables + resets staff counts |
| `POST /all` | Every table listed above (full system reset) |

> **Warning:** These operations are irreversible. The confirmation step is handled by the frontend modal, not the backend.

---

## 6. OR Scheduler — In-Depth Guide

The OR scheduler (`backend/features/simulation/or_scheduler.py`) is the most complex component. It produces assignment suggestions for all unassigned patients in `DailyPatients.csv` using a three-lane triage algorithm.

### 6.1 When the Scheduler Runs

The scheduler is stateless — it reads all data fresh from CSV on every call. It is invoked manually from the Simulation page via the "Run OR" button, which calls `POST /api/simulation/or-suggest`.

### 6.2 Who Is "Unassigned"

A patient is considered unassigned (eligible for a suggestion) if:
1. They have a row in `DailyPatients.csv`, **AND**
2. They have **no** row in `patient_bed.csv`, **AND**
3. They are **not** flagged with `unurgent = "True"` in `DailyPatients.csv`.

The scheduler never suggests moves for patients who already have a bed.

### 6.3 Current Shift and Group Detection

Before selecting any staff, the scheduler determines who is on duty:

**Active shift** (`_active_shift_name()`):
- Reads `Shifts.csv` and compares the current hour against each shift's `start_hour` / `end_hour`.
- Midnight-crossing shifts (where `end_hour < start_hour`) are handled with the condition `h >= start_hour OR h < end_hour`.
- If no shift matches, defaults to the first row in the file.
- Falls back to `"morning"` if the file does not exist.

**Active group** (`_active_group_id()`):
- Reads `Groups.csv` and checks which group's `days` string includes today's weekday number.
- Weekday convention: `0=Monday`, `6=Sunday`.
- Falls back to the first group if no match, or `group_id = 1` if the file is missing.

**Overrides:** Both can be overridden per request via `shift_override` and `group_override` parameters in `ORSuggestRequest`. This lets the UI let operators simulate different scheduling scenarios.

### 6.4 Three Triage Lanes

Acuity level permanently determines a patient's lane. The lane never changes regardless of waiting time or computed score.

| Lane | Acuity Values | Target Ward | Bed Type Required |
|------|--------------|-------------|-------------------|
| **1-2** | 1, 2, or `null` | Ward 1 (critical / Recovery Room) | ICU (or chariot overflow) |
| **3-4** | 3 or 4 | Ward 2 / Ward 3 (balanced) | Any available bed |
| **5** | 5 | No bed assigned | None — routed to unurgent path |

> **Important:** `null` acuity is treated as acuity 1 (most critical). This prevents under-triaged patients from slipping to a lower priority.

### 6.5 Patient Priority Within Each Lane

**Lane 1-2 (critical):**
Sorted by `(effective_acuity ASC, waiting_minutes DESC)`.
Acuity 1 patients are always processed before acuity 2. Among equal acuities, patients who have waited longest get the first suggestion.

**Lane 3-4 (normal):**
Uses a **priority score**:

```
priority_score = base_score − (waiting_minutes / 60)
```

- `base_score` defaults to the patient's numeric acuity (3.0 or 4.0).
- A **lower** score = higher urgency (the patient is more behind schedule).
- `base_score` can be overridden per patient by the operator from the frontend before running the scheduler (useful for manually elevating a patient who is being held for clinical reasons).
- Patients are sorted by `priority_score ASC` — most urgent first.

**Lane 5 (non-urgent):**
Sorted by `waiting_minutes DESC` — longest waiter first.
No bed is assigned; the suggestion is always `suggest_unurgent = True`.

### 6.6 Bed Selection

#### Lane 1-2: ICU Priority Cascade

The scheduler tries to find an ICU bed in this order:

1. **ICU bed in Ward 1** (the critical ward, `ward_id = 1`) — preferred
2. **ICU bed in any other ward** — overflow; sets `is_overflow = True`
3. **Existing free chariot bed** (a temporary chariot created for a previous patient that is not yet cleaned up) — in any ward
4. **No bed found** → `bed_id = None`, `icu_unavailable = True`

When `icu_unavailable = True`, the frontend shows an emergency alert with two options:
- **Reassign a current ICU occupant** to a normal/monitor bed, freeing their ICU bed.
- **Create a chariot bed** by confirming with `use_chariot = True` (the server creates it automatically).

#### Lane 3-4: Balanced Ward 2 / Ward 3

At each step, pick the ward (Ward 2 or Ward 3) that currently has **more available beds** (relative to previous picks in this run). This dynamically balances load across wards as patients are assigned. Falls back to any unassigned-ward bed if both Ward 2 and Ward 3 are exhausted.

#### Lane 5: No bed

No bed selection is performed. The suggestion explicitly routes the patient to the unurgent path.

#### `ward1_full` Flag

Set to `True` in the response when Ward 1 had zero free beds of any type at the time a lane-1/2 patient was being processed. The frontend uses this to show a global emergency alert.

### 6.7 Staff Selection

#### Doctor Selection

Staff are selected using a **fairness algorithm** with two sort keys:

```
Primary:  patientNb + extra_load_this_run  (ascending — fewest patients first)
Tiebreak: availabilityTimeStart            (ascending — longest idle first)
```

`extra_load_this_run` is an in-memory counter that accumulates during the current suggestion run to prevent the same doctor from being over-assigned when processing multiple patients in one batch (even though the CSV count has not been updated yet).

**Lane 1-2 seniority rule:**
Only doctors with `intern_or_not == "doctor"` (seniors) are considered for lane-1/2 patients. If no senior is on the current shift/group, the scheduler falls back to any available staff and sets `senior_fallback = True` in the suggestion.

**Absent filter:**
Doctors with `absent == "True"` are excluded before any ranking.

**Shift + group filter:**
Only doctors whose `shift` matches the active shift name AND whose `work_days` matches the active `group_id` are in the candidate pool.

#### Nurse Selection

Same fairness algorithm as doctors (fewest patients → longest idle), with an additional feature:

**Strict nurse mode** (controlled by `strict_nurses` parameter):
- When `True`: nurse 1 must be an `RN` (Registered Nurse) and nurse 2 must be a `PN` (Practical Nurse).
- If either role is unavailable on the current shift, the scheduler falls back to any two available nurses and sets `nurse_strict_fallback = True`.
- When `False` (default): any two nurses are selected by the fairness algorithm without role constraints.

Note: Lane-5 patients always use non-strict mode for nurses, even if `strict_nurses = True` globally.

#### Extra Load Tracking

During a single `or-suggest` run, both `extra_doc_load` and `extra_nurse_load` dicts accumulate the number of patients suggested for each staff member. This ensures that if 5 patients are processed in one run and the fairest doctor is initially available, the 6th patient does not also receive the same doctor (who would then have 5 extra patients but whose CSV `patientNb` has not yet been updated).

### 6.8 OR Scheduler Parameters (ORSuggestRequest)

These are the parameters the frontend sends to `POST /api/simulation/or-suggest`:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `strict_nurses` | bool | `false` | If `true`, nurse 1 must be RN and nurse 2 must be PN (with fallback if unavailable) |
| `base_score_overrides` | `{patient_id: float}` | `{}` | Per-patient override for the lane-3/4 base score (normally the numeric acuity). Use to manually elevate or defer a patient |
| `shift_override` | str or null | `null` | Force a specific shift name instead of auto-detecting from the current hour |
| `group_override` | int or null | `null` | Force a specific group_id instead of auto-detecting from the current weekday |

### 6.9 OR Confirm Parameters (ORConfirmRequest)

These are the parameters sent to `POST /api/simulation/or-confirm` to apply a single suggestion:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `patient_id` | int | Yes | Subject ID of the patient to assign |
| `stay_id` | int | No | Stay ID (used to stamp bed_occupation_time on the exact stay row) |
| `bed_id` | int | No* | ID of the bed to assign. Required unless `use_chariot = true` |
| `use_chariot` | bool | No | If `true`, a new chariot bed is created and used instead of `bed_id` |
| `use_unurgent` | bool | No | If `true`, route to unurgent path instead of assigning a bed |
| `doctor_id` | int | No | Doctor to link to the patient |
| `nurse1_id` | int | No | First nurse to link |
| `nurse2_id` | int | No | Second nurse to link (skipped if equal to nurse1_id) |

*`bed_id` is required unless `use_chariot = true` or `use_unurgent = true`.

### 6.10 Suggestion Response Fields

Each suggestion in the `or-suggest` response includes these notable flags:

| Flag | Meaning |
|------|---------|
| `is_overflow` | Critical patient placed in a ward other than Ward 1 (no ICU bed in Ward 1) |
| `ward1_full` | Ward 1 had zero free beds when this patient was processed |
| `icu_unavailable` | No ICU bed found anywhere (no `bed_id` returned; user must act) |
| `no_bed_available` | No bed of any type found for this patient |
| `senior_fallback` | No senior doctor on shift; an intern was assigned instead |
| `nurse_strict_fallback` | Strict mode requested but RN or PN was not available |
| `suggest_unurgent` | Patient is acuity 5; no bed suggested; routed to unurgent path |
| `acuity_was_null` | Patient had no acuity recorded — treated as acuity 1 by the scheduler |

### 6.11 Multi-Shift and Multi-Group Overlap

Both the OR scheduler and the staff audit support environments where more than one shift or group can be active simultaneously.

**Multiple active shifts:**
`_active_shift_names()` returns a list — not a single value — of all shift names whose time window covers the current hour. A shift that crosses midnight (e.g. 22:00–06:00) uses the condition `h >= start OR h < end` to correctly match hours on both sides of midnight.

**Multiple active groups:**
`_active_group_ids()` and `_active_group_names()` return lists. A staff member is considered on duty if their shift matches ANY of the active shift names AND their rotation group matches ANY of the active group names.

**OR scheduler compatibility:**
The OR scheduler uses `_active_shift_name()` (singular) and `_active_group_id()` (singular) which return the first match from the lists. The staff audit uses the full multi-value lists so that staff who qualify under any active shift/group combination are correctly treated as on duty.

**Override behaviour:**
When `shift_override` or `group_override` is supplied (OR suggest request or staff audit query params), the override value is treated as a single-element list so the same set-membership logic applies uniformly with no special-casing.

---

### 6.12 Staff Audit

The staff audit (`GET /api/simulation/staff-audit`) scans every patient who currently has a bed assigned and checks whether their linked doctor and nurses are on the current active shift and rotation group.

#### How Mismatches Are Detected

For each bed-assigned patient the audit:
1. Reads the patient's linked `doctor_id` (at most one) and `nurse_ids` (at most two) from the relation tables.
2. For each linked staff member checks:
   - `shift_ok`: the staff member's `shift` field matches ANY active shift name (case-insensitive).
   - `group_ok`: the staff member's `work_days` / `group` field matches ANY active group name.
   - `is_mismatch = not shift_ok OR not group_ok`.
3. Returns only patients who have at least one mismatched staff member.

#### Strict Nurses Enforcement

When `strict_nurses=true` is passed as a query parameter:
- Nurse slot 0 (first nurse) must be an `RN` (Registered Nurse).
- Nurse slot 1 (second nurse) must be a `PN` (Practical Nurse).

The replacement candidate lists for each slot are filtered by role accordingly. If no nurse of the required role is available in that pool, the filter falls back to all nurses in that pool (same fallback as the OR scheduler).

#### Replacement Candidate Pools

For each mismatched staff slot the audit returns a ranked list of replacement candidates. The ranking mirrors the OR scheduler fairness algorithm:

```
Primary:  patientNb (ascending — fewest patients first)
Tiebreak: availabilityTimeStart (ascending — longest idle first)
```

Candidates are split into two groups that are always presented in this order:
1. **On-duty** staff: matching ANY active shift AND ANY active group, not absent — OR-ranked within this group.
2. **Off-duty** staff: non-absent but not currently on shift/group — OR-ranked within this group.

This ordering ensures that on-duty staff are always offered as the primary replacement option, while still allowing the operator to manually select an off-duty staff member if necessary.

For doctor slots where the patient is critical (effective acuity ≤ 2), senior doctors (`intern_or_not == "doctor"`) are sorted before interns within each pool.

#### Sort Order of Audit Results

Patients with mismatches are returned sorted by:
1. `effective_acuity ≤ 2` (critical patients) first, `effective_acuity 3–5` second.
2. Within each tier: most recently admitted (`bed_occupation_time DESC`) first.

#### Related Endpoint

`POST /api/simulation/staff-swap` — applies a single replacement decision, swapping `old_staff_id` for `new_staff_id` on the given patient and adjusting both staff members' `patientNb` counters.

---

### 6.13 Chariot Bed Lifecycle

```
OR scheduler finds no ICU bed for a critical patient
    │
    ▼
icu_unavailable = True in suggestion
    │
    ├── User chooses "Reassign ICU occupant"
    │   → moves existing patient to a different bed
    │   → runs OR again (ICU bed now free)
    │
    └── User chooses "Create chariot" (confirms with use_chariot=True)
        → BedManager.create_chariot_bed() creates CHARIOT-{id} bed
        → Patient assigned to chariot
        │
        ▼
    Patient discharged / moved from chariot bed
        │
        ▼
    cleanup_chariot_if_unneeded() runs:
        - If no critical patients are still waiting → DELETE chariot
        - If critical patients waiting AND not enough other ICU/chariot beds → KEEP chariot
        - If critical patients waiting AND other ICU/chariot beds already cover them → DELETE chariot
```

---

## 7. API Endpoint Reference

All endpoints are prefixed with their mount path. The full URL is `http://localhost:8090/api/{prefix}/{endpoint}`.

### Authentication (`/api/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Authenticate with username + password |
| GET | `/users` | List all user accounts (no passwords) |
| POST | `/users` | Create a new user account |
| PUT | `/users/{user_id}` | Update a user (name, role, sections, password) |
| DELETE | `/users/{user_id}` | Delete a user (blocked if last admin) |

### Beds (`/api/beds`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/list` | All beds with live status, ward, and patient info |
| GET | `/stats` | Aggregate counts only |
| PUT | `/condition/{bed_id}` | Toggle Available ↔ Under Repair |
| POST | `/assign/{bed_id}` | Assign a patient to a bed |
| POST | `/move/{patient_id}` | Move a patient to a different bed |
| POST | `/release/{bed_id}` | Remove patient link (no archive) |
| POST | `/discharge/{bed_id}` | Full discharge workflow |
| POST | `/add` | Create a new bed |
| PUT | `/modify/{bed_id}` | Update bed number, ward, or type |
| DELETE | `/delete/{bed_id}` | Permanently delete a bed |

### Patients (`/api/patients`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/next-ids` | Suggest next available patient_id and stay_id |
| GET | `/list` | All active patient stays |
| GET | `/stats` | Patient count summary |
| POST | `/add` | Add a new patient stay |
| PUT | `/modify/{stay_id}` | Update a patient stay |
| DELETE | `/delete/{stay_id}` | Delete a patient stay |

### Scheduling (`/api/scheduling`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/list` | All current assignments |
| POST | `/assign` | Create a new assignment |
| PUT | `/edit/{patient_id}/{old_bed_id}` | Edit an existing assignment |
| DELETE | `/delete/{patient_id}/{bed_id}` | Remove assignment (no archive) |
| POST | `/discharge/{patient_id}/{bed_id}` | Full discharge workflow |

### Simulation (`/api/simulation`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sample-patient` | Draw one random patient from Patients.csv |
| POST | `/confirm-patient` | Add confirmed patient to DailyPatients |
| POST | `/or-suggest` | Run OR scheduler on all unassigned patients |
| POST | `/or-confirm` | Apply a single OR suggestion |
| GET | `/current-context` | Return all currently active shift names and group names (used by the live clock) |
| GET | `/staff-audit` | Scan bed-assigned patients for shift/group mismatches; return ranked replacement candidates |
| POST | `/staff-swap` | Replace one staff member on a patient assignment and update patient counts |

### Flow Prediction (`/api/flow-prediction`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/predict?days=N` | N-day ahead forecast |
| GET | `/historical?days=N` | Last N days of actual counts |
| GET | `/stats` | Dataset aggregate statistics |

### Statistics (`/api/statistics`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/overview` | Headline KPIs |
| GET | `/data-quality` | Timestamp integrity audit |
| GET | `/waiting-times` | Wait and LOS distributions |
| GET | `/acuity-breakdown` | Per-ESI-level stats |
| GET | `/throughput` | Arrivals by hour and day-of-week |
| GET | `/top-complaints` | Top 10 chief complaints |
| GET | `/vitals-summary` | Vital sign aggregates |
| GET | `/staff-stats` | Nurse & doctor headcount, shift dist., patient-load dist. |
| GET | `/staff-member/nurse/{id}` | Individual nurse profile + patients + beds |
| GET | `/staff-member/doctor/{id}` | Individual doctor profile + patients + beds |

### Staff Management (`/api/staff`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/doctors/list` | All doctors/interns |
| GET | `/doctors/stats` | Doctor aggregate counts |
| POST | `/doctors/add` | Add a doctor/intern |
| PUT | `/doctors/modify/{id}` | Update a doctor record |
| PUT | `/doctors/toggle-absent/{id}` | Toggle absent flag |
| DELETE | `/doctors/delete/{id}` | Delete a doctor |
| GET | `/nurses/list` | All nurses |
| GET | `/nurses/stats` | Nurse aggregate counts |
| POST | `/nurses/add` | Add a nurse |
| PUT | `/nurses/modify/{id}` | Update a nurse record |
| PUT | `/nurses/toggle-absent/{id}` | Toggle absent flag |
| DELETE | `/nurses/delete/{id}` | Delete a nurse |
| GET | `/shifts/list` | All shift definitions |
| POST | `/shifts/add` | Add a shift |
| PUT | `/shifts/modify/{shift_id}` | Update a shift |
| DELETE | `/shifts/delete/{shift_id}` | Delete a shift |
| GET | `/groups/list` | All rotation groups |
| POST | `/groups/add` | Add a rotation group |
| PUT | `/groups/modify/{group_id}` | Update a group |
| DELETE | `/groups/delete/{group_id}` | Delete a group |

### Data Management (`/api/data`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/wards/list` | All wards with bed counts |
| GET | `/wards/stats` | Ward aggregate stats |
| POST | `/wards/add` | Add a ward |
| PUT | `/wards/modify/{ward_id}` | Update a ward |
| DELETE | `/wards/delete/{ward_id}` | Delete ward (cascade relation cleanup) |
| GET | `/daily-patients/list` | All active stays |
| GET | `/daily-patients/stats` | Active stay count summary |
| POST | `/daily-patients/add` | Add a stay |
| PUT | `/daily-patients/modify/{stay_id}` | Update a stay |
| DELETE | `/daily-patients/delete/{stay_id}` | Delete a stay |
| GET | `/log-patients/list` | All archived stays |
| GET | `/log-patients/stats` | Archive count summary |
| PUT | `/log-patients/modify/{stay_id}` | Update an archived stay |
| DELETE | `/log-patients/delete/{stay_id}` | Delete an archived stay |

### Unurgent (`/api/unurgent`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/list` | All unurgent patients with linked staff |
| POST | `/discharge/{patient_id}` | Discharge from unurgent path |

### Relations (`/api/relations`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tables` | List all supported table names and columns |
| GET | `/{table}` | All rows in a relation table |
| POST | `/{table}` | Add a relation pair `{col_a, col_b}` |
| DELETE | `/{table}/{col_a}/{col_b}` | Remove a specific pair |

### Dataset Display (`/api/patient-flow`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/datasets` | Metadata for all known datasets |
| GET | `/data/{dataset}?page=N&page_size=N` | Paginated rows from a dataset |
| POST | `/refresh-data/{dataset}` | Pull a dataset from upstream API |
| POST | `/refresh-all-data` | Pull all datasets from upstream API |

### Models (`/api/models`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/list` | List .pkl files in AIModels/ with metadata |

### Reset (`/api/reset`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/patients` | Wipe all patient data |
| POST | `/beds` | Wipe all bed data |
| POST | `/doctors` | Wipe all doctor data |
| POST | `/nurses` | Wipe all nurse data |
| POST | `/wards` | Wipe all ward data |
| POST | `/relations` | Wipe all relation tables |
| POST | `/all` | Full system reset |

---

## 8. Configuration Guide

### Adding a New Ward

1. Go to Settings → Wards → Add Ward.
2. Enter a ward name and department ID.
3. After adding, go to Settings → Beds to assign beds to the new ward.

> Ward 1 (`ward_id = 1`) is the **critical ward**. The OR scheduler routes all lane-1/2 (acuity 1/2/null) patients to Ward 1 specifically. Do not rename or change ward_id 1 to a non-critical purpose.

### Configuring Shifts

1. Go to Settings → Shifts.
2. Default shifts are `morning` (07:00–19:00) and `night` (19:00–07:00).
3. To add a custom shift, provide a name and start/end hours (24h format).
4. For shifts crossing midnight, set `end_hour < start_hour` (e.g. start=22, end=6).

After changing shifts, make sure all doctors and nurses have their `shift` field updated to match an existing shift name.

### Configuring Rotation Groups

1. Go to Settings → Groups.
2. Default groups: Group 1 (Mon–Thu, days `0,1,2,3`) and Group 2 (Fri–Sun, days `4,5,6`).
3. Days are 0-indexed from Monday. Example: `"1,3,5"` means Tuesday, Thursday, Saturday.
4. Doctors use the `work_days` field (stores group_id). Nurses use the `group` field.

### Setting Up the Flow Prediction Model

1. Train the XGBoost model externally and save it as a joblib `.pkl` file containing a dict `{"model": <XGBRegressor>, "features": ["temperature_2m_mean", "dayofweek", "month", "weekofyear", "y_lag_1", "y_lag_7", "y_roll_7"]}`.
2. Place the file at `backend/models/AIModels/Flow_prediction.pkl`.
3. Ensure `backend/datasets/edstays_with_synth.csv` and `backend/datasets/meteo.csv` are present.
4. Navigate to the Flow Prediction page — the model loads automatically on first request.

---

## 9. Vital Sign Validation Ranges

All patient input routes validate vital signs at the HTTP boundary. Submissions outside these ranges are rejected with HTTP 400.

| Field | Min | Max | Unit |
|-------|-----|-----|------|
| `temperature` | 26 | 46 | °C |
| `heartrate` | 20 | 300 | bpm |
| `resprate` | 4 | 100 | breaths/min |
| `o2sat` | 0 | 100 | % |
| `sbp` | 40 | 300 | mmHg |
| `dbp` | 20 | 200 | mmHg |
| `acuity` | 1 | 5 | ESI level |

---

## 10. User Roles & Access Control

### Role Types

| Role | Description |
|------|-------------|
| `admin` | Created with full access to all sections and settings tabs |
| `user` | Access limited to explicitly granted sections and settings_tabs |

### Access Restriction Fields

Each user account has three comma-separated fields that control frontend visibility:

**`sections`** — which navigation pages are shown:
```
home, flow-prediction, beds-display, patients, scheduling,
simulation, unurgent, statistics, settings
```

**`settings_tabs`** — which sub-tabs within the Settings page are shown:
```
beds, doctors, nurses, wards, daily-patients, log-patients,
shifts, groups, datasets, relations, models, features, reset
```

**`statistics_tabs`** — which sub-tabs within the Statistics section are shown:
```
patients, nurses, doctors
```
If this field is empty for a non-admin user who has `statistics` access, all three tabs default to accessible (backward compatibility). When the Statistics section opens, inaccessible tabs are hidden and the section activates the first tab the user is permitted to see.

### Important Notes

- Access control is **frontend-only** — the backend API does not enforce role-based access on individual endpoints. All API endpoints are accessible to anyone with HTTP access to the server.
- For production deployment, add authentication middleware to the FastAPI app and restrict CORS to the actual frontend domain.
- Removing all admin accounts is blocked by the `UsersManager.delete()` method, but a user with API access could bypass this by directly editing `Users.csv`.

---

---

## 11. Frontend Structure

The entire frontend is a single-page application (SPA) served from `frontend/index.html`. All page content is rendered by JavaScript without any full-page reloads. Navigation is managed by `navigation.js` which shows/hides `<section>` elements based on the active `data-section` attribute.

### Page Sections

Each section corresponds to a `<section id="…" class="section">` block in `index.html`. The nav button `data-section` value matches the section id.

| Section id | Nav label | Description |
|-----------|-----------|-------------|
| `home` | Home | Dashboard with quick-access cards |
| `flow-prediction` | Flow Prediction | XGBoost patient-flow chart + forecast |
| `beds-display` | Beds | Live bed grid + bed management |
| `patients` | Patients | Active patient list + add/edit modal |
| `scheduling` | Scheduling | Assignment list + create/edit/discharge |
| `simulation` | Simulation | Patient intake + OR scheduler + staff audit |
| `unurgent` | Unurgent | Acuity-5 treatment path + discharge |
| `statistics` | Statistics | Three-tab dashboard: Patients (7 ED KPI panels), Nurses (headcount, shift dist., staff lookup), Doctors (same structure); per-user tab access control |
| `settings` | Settings | All configuration tabs |

### Settings Tabs

The Settings section has sub-tabs controlled by `data-tab` buttons inside `#settings`. Each tab is rendered by a dedicated JS module.

| Tab key | JS module | Manages |
|---------|-----------|---------|
| `beds` | `settings.js` (shared) | Bed add/edit/delete |
| `doctors` | `settings_doctors.js` | Doctor/intern CRUD + absent toggle |
| `nurses` | `settings_nurses.js` | Nurse CRUD + absent toggle |
| `wards` | `settings_wards.js` | Ward add/edit/delete |
| `daily-patients` | `settings_daily_patients.js` | DailyPatients direct CRUD |
| `log-patients` | `settings_log_patients.js` | LogPatients view/edit/delete |
| `shifts` | `settings_shifts.js` | Shift time window CRUD |
| `groups` | `settings_groups.js` | Rotation group CRUD |
| `datasets` | `dataset_display.js` | Paginated CSV browser + remote refresh |
| `relations` | `settings_relations.js` | Relation table viewer |
| `models` | (via `app.js`) | ML model file listing |
| `features` | `settings_features.js` | Feature flags / configuration toggles |
| `reset` | `settings_reset.js` | Destructive data-clear operations |
| Accounts | `settings_accounts.js` | User account management |

### JavaScript Module Map

| JS file | Feature |
|---------|---------|
| `app.js` | Application bootstrap: loads initial data, wires nav, coordinates section init |
| `navigation.js` | SPA routing: show/hide sections, manage active nav state, access control by user role |
| `utils.js` | Shared helpers: fetch wrappers, toast notifications, modal open/close |
| `auth.js` | Login modal, session management, logout |
| `beds_display.js` | Bed grid render, condition toggle, assign/release/discharge actions |
| `change_bed.js` | Move-patient-between-beds modal logic |
| `patients.js` | Patient list table, add/edit patient modal, vital sign validation |
| `scheduling.js` | Assignment list, create/edit assignment modal, discharge modal |
| `simulation.js` | Patient intake modal, OR scheduler panel, staff audit panel, staff swap modal |
| `unurgent.js` | Unurgent patient list table, discharge modal |
| `flow_prediction.js` | Chart.js forecast + historical chart, stats cards |
| `statistics.js` | Three-tab statistics dashboard (Chart.js); Patients KPI panels, Nurses/Doctors panels with staff charts and profile lookup; per-user tab access enforcement on every load |
| `dataset_display.js` | Paginated dataset table, column display, refresh controls |
| `model_files.js` | ML model file list in Settings |
| `settings.js` | Bed settings tab; also shared modal logic used by other settings modules |
| `settings_doctors.js` | Doctor/intern table + add/edit/delete/absent forms |
| `settings_nurses.js` | Nurse table + add/edit/delete/absent forms |
| `settings_shifts.js` | Shift time window table + add/edit/delete forms |
| `settings_groups.js` | Rotation group table + add/edit/delete forms |
| `settings_wards.js` | Ward table + add/edit/delete forms |
| `settings_daily_patients.js` | DailyPatients CRUD table in Settings |
| `settings_log_patients.js` | LogPatients table in Settings |
| `settings_relations.js` | Relation table viewer in Settings |
| `settings_reset.js` | Reset confirmation modals and API calls |
| `settings_features.js` | Feature flag toggles |
| `settings_accounts.js` | User account table + add/edit/delete forms |

### CSS File Map

| CSS file | Styles |
|----------|--------|
| `base.css` | Reset, typography, layout, nav bar, shared utilities |
| `auth.css` | Login modal overlay |
| `home.css` | Dashboard cards and quick-access grid |
| `beds.css` | Bed grid, status badges, bed detail cards |
| `patients.css` | Patient list table, vital sign fields |
| `scheduling.css` | Assignment list, discharge modal |
| `simulation.css` | OR scheduler panels, audit mismatch cards |
| `unurgent.css` | Unurgent patient list |
| `flow_prediction.css` | Forecast chart layout and stats strip |
| `statistics.css` | Statistics dashboard panels |
| `datasets.css` | Dataset browser table |
| `models.css` | Model file list |
| `modals.css` | Shared modal chrome (overlay, header, footer, form fields) |
| `settings.css` | Settings tabs, sub-tab nav |
| `settings_reset.css` | Reset tab danger-zone styling |

---

*Documentation updated July 2026 — HCopilot v1.0*

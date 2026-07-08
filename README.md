# HCopilot

HCopilot is a hospital Emergency Department (ED) management system built for the Université de Haute-Alsace. It provides an operational dashboard for ED staff to track real-time bed availability, register and triage patients, assign staff automatically using an Operations Research scheduler, forecast future patient arrivals with a trained XGBoost model, and monitor aggregate ED performance statistics — all from a single browser-based interface.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Python 3.11+ |
| Web framework | FastAPI |
| Data layer | pandas (CSV flat files — no database) |
| ML model | XGBoost (via joblib) |
| Frontend | Vanilla JavaScript, HTML5, CSS3 (no framework) |

## How to Run

```bash
cd backend
pip install fastapi uvicorn pandas numpy joblib xgboost requests
uvicorn app:app --port 8090
```

Then open **http://localhost:8090** in a browser. The FastAPI server serves both the API and the frontend static files from the same port.

Alternatively: `python app.py` starts the dev server directly.

**Default login:** username `admin` / password `admin` (auto-created on first run).

## Main Features

- **Patient Intake Simulator** — draw random patients from a historical dataset and confirm them into the active patient list with one click
- **OR Scheduler** — automatically suggests optimal bed + staff assignments for all unassigned patients using a three-lane triage algorithm (acuity 1-2 → ICU in Ward 1, 3-4 → balanced wards, 5 → unurgent path); uses a fairness algorithm (fewest patients first, then longest idle) to distribute load; respects active shift, rotation group, and absent flags
- **Staff Audit** — after a shift change, scan all bed-assigned patients and flag those whose doctor or nurse is no longer on the active shift/group; provides ranked on-duty and off-duty replacement candidates with one-click staff swap; supports strict nurse mode (enforces RN in slot 1, PN in slot 2) and shift/group override for simulation
- **Live Clock & Shift Context** — a clock bar on the Simulation page shows the current time, active shift(s), and active group(s); shift/group override controls let operators simulate any time context for both the OR scheduler and the staff audit
- **Beds Display** — live bed grid showing occupancy, ward, patient info, and bed type (normal/monitor/ICU/chariot); chariot beds are auto-created when ICU capacity is exhausted and auto-deleted after discharge
- **Scheduling** — manual assignment of patients to beds and staff; full discharge workflow that archives to LogPatients and decrements staff patient counts
- **Settings — Doctors & Nurses** — manage staff records with shift, rotation group, absent toggle, and patient-count tracking; absent staff are excluded from all OR and audit candidate pools without deleting their records
- **Settings — Shifts & Groups** — configure named time windows (with midnight-crossing support) and weekday rotation groups; names are unique and renaming cascades automatically to all linked staff records; deleting a shift does not reset staff shift fields — statistics will still show the old shift name for any staff who retain it
- **User Management** — admin-only account CRUD with three-tier access control: navigation sections, settings sub-tabs, and statistics sub-tabs (Patients / Nurses / Doctors) can each be granted or revoked independently per user; changes take effect immediately without requiring a re-login
- **Settings — Wards & Beds** — manage ward definitions and bed types
- **Statistics** — three-tab dashboard (Patients / Nurses / Doctors); Patients tab shows real-time KPIs: wait-to-bed times, LOS distributions, ESI acuity breakdown, arrival throughput by hour/day, top chief complaints, vital sign aggregates; Nurses and Doctors tabs show headcount KPIs, shift distribution (reads directly from staff records including any old shift names), patient-load distribution, role/type breakdown doughnut, and an individual staff member profile lookup (assigned patients, free time, beds, ward distribution); each tab can be independently granted or revoked per user account
- **Flow Prediction** — XGBoost model forecasts daily patient arrivals up to 30 days ahead using an auto-regressive lag loop seeded from historical data
- **Unurgent Path** — separate management and discharge workflow for acuity-5 patients who do not require a physical bed

## Architecture

```
backend/
  app.py                    FastAPI entry point; mounts all routers + static files
  datasets/                 All CSV runtime data (the "database")
  features/                 One sub-package per feature; each exposes a FastAPI router
    auth/                   Login + user management (SHA-256 passwords)
    beds_display/           Bed CRUD, occupancy, assign/move/discharge
    data_management/        Wards, DailyPatients, LogPatients CRUD
    dataset_display/        Paginated CSV browser + remote dataset refresh
    flow_prediction/        XGBoost patient-flow forecasting
    patient_management/     Patient CRUD (extends data_management)
    relations/              Generic many-to-many table CRUD (6 link tables)
    reset/                  Destructive data-clear endpoints
    scheduling/             Assignment create/edit/discharge
    simulation/             Patient intake simulator + OR scheduler + staff audit
    staff_management/       Doctors, nurses, shifts, groups CRUD
    statistics/             Aggregate KPI endpoints
    timestamp_utils.py      Shared CSV-read and timestamp-validation helpers
    unurgent/               Acuity-5 patient path
frontend/
  index.html                Single-page shell; all content rendered by JS
  css/                      One CSS file per feature section
  js/                       One JS module per feature/settings tab
```

Data storage is entirely CSV-based. There is no database. Each manager class in a feature folder handles its own CSV reads and writes through `pandas`. Relation tables (patient↔bed, patient↔doctor, etc.) are stored as two-column CSV files managed by a single `RelationsManager`.

## Documentation

See **[DOCUMENTATION.md](DOCUMENTATION.md)** for the complete reference covering the data model, OR scheduler algorithm, staff audit logic, all API endpoints, shift/group configuration, and the frontend section structure.

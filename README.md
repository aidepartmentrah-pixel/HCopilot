# HCopilot

HCopilot is a hospital Emergency Department (ED) management system built for the Université de Haute-Alsace. It provides an operational dashboard for ED staff to track real-time bed availability, register and triage patients, assign staff automatically using an Operations Research scheduler, forecast future patient arrivals with a trained XGBoost model, and monitor aggregate ED performance statistics — all from a single browser-based interface.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Python 3.11+ |
| Web framework | FastAPI |
| Data layer | Microsoft SQL Server, via SQLAlchemy ORM + Alembic migrations |
| ML model | XGBoost (via joblib), trained from SQL Server historical data |
| Frontend | Vanilla JavaScript, HTML5, CSS3 (no framework) |
| Deployment | Docker (backend + frontend + SQL Server containers, see `docker-compose.yml`) |

> **Note for anyone who worked on the original CSV-based version**: the data
> layer was migrated from CSV/pandas to Microsoft SQL Server. Every manager
> class now talks to SQL Server through the ORM models in `backend/db/`
> instead of reading/writing `backend/datasets/*.csv` directly. The public
> API (routes, request/response shapes, business logic/algorithms) is
> unchanged — only the storage layer underneath it moved.

## How to Run (local development)

You need a running SQL Server instance. The quickest way is a standalone
Docker container (you don't need the full `docker-compose.yml` stack for
day-to-day backend development):

```bash
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=Str0ng!Passw0rd" \
  -p 1433:1433 --name hcopilot-dev-sqlserver \
  -v hcopilot_dev_data:/var/opt/mssql \
  -d mcr.microsoft.com/mssql/server:2022-latest
```

Then, from `backend/`:

```bash
python -m venv .venv
.venv/Scripts/activate        # Windows; use .venv/bin/activate on Linux/Mac
pip install -r requirements.txt

cp .env.example .env          # fill in the password you used above
alembic upgrade head          # creates the schema (safe to re-run)

uvicorn app:app --port 8090
```

Then open **http://localhost:8090** in a browser.

**Default login:** username `admin` / password `admin` (auto-created on first run, same as before — change it after logging in).

The database starts empty except for a few auto-seeded defaults (admin
user, default Shifts/Groups). Add wards, beds, and staff through the
Settings UI, or write your own seed script — this repo intentionally does
not ship real hospital data (see `backend/scripts/migrate_csv_to_mssql.py`
and `import_ml_historical_data.py` for the shape of a one-time data-loading
script, if you need to import a CSV export of your own test data).

## How to Run (full Docker stack)

```bash
cp .env.example .env   # fill in real values
docker compose up -d
```

This builds/starts SQL Server, runs the database migrations automatically
(`db-init` service), then starts the backend and frontend containers.
Frontend at `http://localhost:8082` (or whatever `FRONTEND_PORT` you set).

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
  app.py                    FastAPI entry point; mounts all routers (+ static files if frontend/ is present)
  db/
    session.py               SQLAlchemy engine/session factory, reads connection info from .env
    models.py                 ORM model for every table
  alembic/                   Schema migrations — source of truth for the database structure
  scripts/
    migrate_csv_to_mssql.py         One-time CSV -> SQL Server data loader (operational data)
    import_ml_historical_data.py    One-time loader for the flow-prediction training data
    ensure_database_exists.py       Creates the database if it doesn't exist yet
  datasets/                 Legacy CSV files — no longer read by the running app; kept only as
                             input for the one-time migration scripts above
  features/                 One sub-package per feature; each exposes a FastAPI router
    auth/                   Login + user management (SHA-256 passwords)
    beds_display/           Bed CRUD, occupancy, assign/move/discharge
    data_management/        Wards, DailyPatients, LogPatients CRUD
    dataset_display/        Paginated dataset browser + remote dataset refresh
    flow_prediction/        XGBoost patient-flow forecasting (trained from SQL Server data)
    patient_management/     Patient CRUD (extends data_management)
    relations/               Generic many-to-many table CRUD (6 link tables)
    reset/                   Destructive data-clear endpoints
    scheduling/              Assignment create/edit/discharge
    simulation/              Patient intake simulator + OR scheduler + staff audit
    staff_management/        Doctors, nurses, shifts, groups CRUD
    statistics/              Aggregate KPI endpoints
    timestamp_utils.py       Shared timestamp-validation helpers
    unurgent/                Acuity-5 patient path
frontend/
  index.html                Single-page shell; all content rendered by JS
  css/                      One CSS file per feature section
  js/                       One JS module per feature/settings tab
  Dockerfile, nginx.conf    Serves the frontend + reverse-proxies /api/* to the backend container
```

Data storage is Microsoft SQL Server, accessed through the SQLAlchemy ORM models in `backend/db/models.py`. Every manager class in a feature folder opens its own session per call (see any `*_manager.py` file for the pattern) rather than reading/writing files. Relation tables (patient↔bed, patient↔doctor, etc.) are still six separate tables under the hood, but are exposed through one generic `RelationsManager` — same public API as before the migration, just backed by SQL Server instead of CSV.

## Documentation

See **[DOCUMENTATION.md](DOCUMENTATION.md)** for the complete reference covering the data model, OR scheduler algorithm, staff audit logic, all API endpoints, shift/group configuration, and the frontend section structure.

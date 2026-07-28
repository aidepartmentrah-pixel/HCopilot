# HCopilot

HCopilot is a hospital Emergency Department (ED) management system built for the Université de Haute-Alsace. It provides an operational dashboard for ED staff to track real-time bed availability, register and triage patients, assign staff automatically using an Operations Research scheduler, forecast future patient arrivals with a trained XGBoost model, and monitor aggregate ED performance statistics — all from a single browser-based interface.

## Contents

- [Tech Stack](#tech-stack)
- [How to Run](#how-to-run)
  - [Option 1 — Docker (full stack, easiest)](#option-1--docker-full-stack-easiest)
  - [Option 2 — No Docker](#option-2--no-docker)
  - [Option 3 — Hybrid (fastest for coding)](#option-3--hybrid-fastest-for-coding)
- [Main Features](#main-features)
- [Architecture](#architecture)
- [Documentation](#documentation)

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

## How to Run

There are 3 ways to run HCopilot. Pick one:

| Option | You install SQL Server yourself? | Good for |
|--------|-----------------------------------|----------|
| [1. Docker (full stack)](#option-1--docker-full-stack-easiest) | No | Just running the app, deploying to a new machine |
| [2. No Docker](#option-2--no-docker) | Yes | Machines where Docker isn't allowed/available |
| [3. Hybrid](#option-3--hybrid-fastest-for-coding) | No (SQL Server only, in one container) | Actively editing backend code |

---

### Option 1 — Docker (full stack, easiest)

Everything — SQL Server, backend, frontend — runs in containers. You never install SQL Server.

**Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

#### Setup

```bash
cp .env.example .env      # then edit .env: set strong passwords for
                           # MSSQL_SA_PASSWORD and DATABASE_PASSWORD
docker compose up -d --build
```

That's it. This starts SQL Server, waits for it to be ready, builds the
schema, loads any CSVs found in `backend/datasets/` (see note below), then
starts the backend and frontend.

Open **http://localhost:8082** (or whatever `FRONTEND_PORT` you set in `.env`).

Check everything came up:
```bash
docker compose ps
```
You want `sqlserver` and `backend` → `Up (healthy)`, `db-init` → `Exited (0)`, `frontend` → `Up`.

#### Restarting the stack

| Goal | Command |
|------|---------|
| Restart the running containers, keep all data | `docker compose restart` |
| Stop everything, start again, keep all data | `docker compose down` then `docker compose up -d` |
| Rebuild after changing code/Dockerfiles, keep data | `docker compose up -d --build` |
| Full wipe — also delete the database data and reseed from CSVs | `docker compose down -v` then `docker compose up -d --build` |

> The full wipe destroys everything currently in the database (not just the CSV-seeded rows) — only use it if you're sure you don't need that data.

#### Notes

> **About your data:** `backend/datasets/*.csv` is git-ignored — CSVs don't
> travel with `git push`/`git pull`, you need to copy them to the machine
> yourself before the first `docker compose up`. They're only read once,
> the first time the database is empty (re-running `docker compose up` on
> an existing database does nothing to already-loaded tables). If you don't
> have `edstays_with_synth.csv`/`meteo.csv` (used only by the optional Flow
> Prediction feature), remove `&& python scripts/import_ml_historical_data.py`
> from the `db-init` service's `command` in `docker-compose.yml` — everything
> else works fine without it.

### Option 2 — No Docker

Run everything natively. You install SQL Server yourself for this option.

**Requirements:** SQL Server (e.g. Express/Developer edition) installed and
running, "ODBC Driver 18 for SQL Server" installed, Python 3.11+.

#### Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows; use .venv/bin/activate on Linux/Mac
pip install -r requirements.txt

cp .env.example .env          # point DATABASE_SERVER at your SQL Server, fill in real password
alembic upgrade head          # creates the schema (safe to re-run)
python scripts/migrate_csv_to_mssql.py   # optional: loads your CSVs, if any

python app.py
```

Open **http://localhost:8090** — the backend serves the frontend directly
from the same process (no separate web server needed) whenever `frontend/`
is present next to `backend/`.

#### Next time (already set up, just restarting after a shutdown)

```bash
cd backend
.venv\Scripts\activate        # Windows; use .venv/bin/activate on Linux/Mac
python app.py
```

### Option 3 — Hybrid (fastest for coding)

Only the database runs in Docker; the backend runs natively so you can
restart it instantly after every code change (no image rebuild).

**Requirements:** Docker, Python 3.11+.

#### Setup

```bash
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=Str0ng!Passw0rd" \
  -p 1433:1433 --name hcopilot-dev-sqlserver \
  -v hcopilot_dev_data:/var/opt/mssql \
  -d mcr.microsoft.com/mssql/server:2022-latest
```

Then, from `backend/`, the same steps as Option 2 (venv, `pip install`,
`.env` pointing `DATABASE_SERVER` at `localhost`, `alembic upgrade head`,
`python app.py`).

Open **http://localhost:8090**.

---

**Default login (all 3 options):** username `admin` / password `admin`
(auto-created on first run if no users exist — change it after logging in
via Settings → Accounts).

Without any CSVs loaded, the database starts empty except for a few
auto-seeded defaults (admin user, default Shifts/Groups). Add wards, beds,
and staff through the Settings UI, or provide your own CSVs in
`backend/datasets/` before the first run (see `backend/scripts/migrate_csv_to_mssql.py`
and `import_ml_historical_data.py` for the exact filenames/shape expected).

## Main Features

| Feature | Details |
|---------|---------|
| **Patient Intake Simulator** | draw random patients from a historical dataset and confirm them into the active patient list with one click |
| **OR Scheduler** | automatically suggests optimal bed + staff assignments for all unassigned patients using a three-lane triage algorithm (acuity 1-2 → ICU in Ward 1, 3-4 → balanced wards, 5 → unurgent path); uses a fairness algorithm (fewest patients first, then longest idle) to distribute load; respects active shift, rotation group, and absent flags |
| **Staff Audit** | after a shift change, scan all bed-assigned patients and flag those whose doctor or nurse is no longer on the active shift/group; provides ranked on-duty and off-duty replacement candidates with one-click staff swap; supports strict nurse mode (enforces RN in slot 1, PN in slot 2) and shift/group override for simulation |
| **Live Clock & Shift Context** | a clock bar on the Simulation page shows the current time, active shift(s), and active group(s); shift/group override controls let operators simulate any time context for both the OR scheduler and the staff audit |
| **Beds Display** | live bed grid showing occupancy, ward, patient info, and bed type (normal/monitor/ICU/chariot); chariot beds are auto-created when ICU capacity is exhausted and auto-deleted after discharge |
| **Scheduling** | manual assignment of patients to beds and staff; full discharge workflow that archives to LogPatients and decrements staff patient counts |
| **Settings — Doctors & Nurses** | manage staff records with shift, rotation group, absent toggle, and patient-count tracking; absent staff are excluded from all OR and audit candidate pools without deleting their records |
| **Settings — Shifts & Groups** | configure named time windows (with midnight-crossing support) and weekday rotation groups; names are unique and renaming cascades automatically to all linked staff records; deleting a shift does not reset staff shift fields — statistics will still show the old shift name for any staff who retain it |
| **User Management** | admin-only account CRUD with three-tier access control: navigation sections, settings sub-tabs, and statistics sub-tabs (Patients / Nurses / Doctors) can each be granted or revoked independently per user; changes take effect immediately without requiring a re-login |
| **Settings — Wards & Beds** | manage ward definitions and bed types |
| **Statistics** | three-tab dashboard (Patients / Nurses / Doctors); Patients tab shows real-time KPIs: wait-to-bed times, LOS distributions, ESI acuity breakdown, arrival throughput by hour/day, top chief complaints, vital sign aggregates; Nurses and Doctors tabs show headcount KPIs, shift distribution (reads directly from staff records including any old shift names), patient-load distribution, role/type breakdown doughnut, and an individual staff member profile lookup (assigned patients, free time, beds, ward distribution); each tab can be independently granted or revoked per user account |
| **Flow Prediction** | XGBoost model forecasts daily patient arrivals up to 30 days ahead using an auto-regressive lag loop seeded from historical data |
| **Unurgent Path** | separate management and discharge workflow for acuity-5 patients who do not require a physical bed |

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

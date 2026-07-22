# HCopilot — Developer Setup Guide

Hussein,

Since you delivered HCopilot, we've made two major changes to the project that you should know about before picking development back up:

1. **The data layer moved from CSV files to a real Microsoft SQL Server database.** Every feature that used to read/write CSV files under `backend/datasets/` now goes through SQLAlchemy models and Alembic migrations (`backend/db/`, `backend/alembic/`).
2. **The flow-prediction model now trains from that same database**, not from static CSV files.

You've been added as a collaborator via a fork of the repository (not direct write access to the original) — the repo is public, so you can fork it, clone your fork, do your work there, and open a Pull Request back to us when you're ready. We'll review and merge from there.

This document covers getting a local development environment running from scratch — no Docker, straight against a native SQL Server install, since that's your preference.

## 1. Fork and clone

1. Go to `https://github.com/aidepartmentrah-pixel/HCopilot` and click **Fork**.
2. Clone your fork locally:
   ```
   git clone https://github.com/HusseinZein235/HCopilot.git
   ```

## 2. Prerequisites

- **Python 3.11+**
- **SQL Server 2022 Developer Edition** — free, full-featured (not Express), download directly from Microsoft. This is a native install, no Docker involved.
- **ODBC Driver 18 for SQL Server** — a separate small driver install, required by the Python SQL Server library (`pyodbc`) regardless of how SQL Server itself is hosted.

## 3. Python environment

From the repo root:
```
cd backend
python -m venv .venv
.venv\Scripts\activate          (Windows)
pip install -r requirements.txt
```

## 4. Configure the database connection

Copy `backend/.env.example` to `backend/.env` and fill in the values for your local SQL Server instance:

```
DATABASE_SERVER=localhost
DATABASE_PORT=1433
DATABASE_NAME=HCopilotDB
DATABASE_USER=sa
DATABASE_PASSWORD=<your local sa password>
DATABASE_DRIVER=ODBC Driver 18 for SQL Server
DATABASE_TRUST_SERVER_CERTIFICATE=yes
```

## 5. Build the database

Run these two commands in order, from `backend/`:

```
python scripts/ensure_database_exists.py
alembic upgrade head
```

The first creates the `HCopilotDB` database itself (SQL Server needs `CREATE DATABASE` before anything else can happen). The second builds every table from the version-controlled migration files in `backend/alembic/versions/` — this is the full schema history, so you'll end up with the exact same table structure we have.

## 6. About data — please read this before assuming something's broken

**The actual hospital data is intentionally not in this repository.** The CSV files that used to hold patients, staff, beds, and wards, and the historical dataset used to train the forecasting model, are excluded via `.gitignore` for size and privacy reasons — they always have been, since your original commit.

After step 5, your database will have empty tables, except for a few things the application seeds automatically the first time it runs:
- A default `admin` / `admin` login
- Default shift definitions (morning/night)
- Default rotation groups (Group 1/Group 2)

Everything else — wards, beds, doctors, nurses, patients — will be empty until you either:
- Create test records yourself through the app's own Settings pages, or
- Ask us for a sanitized sample dataset if you need bulk data to test something specific.

This is expected, not a bug in your setup.

## 7. Run the app

```
cd backend
uvicorn app:app --port 8090
```

Open `http://localhost:8090` in a browser. Log in with `admin` / `admin`.

## 8. Run the test suite

```
cd backend
pytest tests/
```

This should pass in full against your empty-but-schema-complete database — it's designed to create and clean up its own test data, not depend on any pre-existing records.

## 9. Submitting your work

- Work on a new branch in your fork, not `main`.
- Commit and push to your fork.
- Open a Pull Request from your fork back to `aidepartmentrah-pixel/HCopilot` when you're ready for review.

---

If anything above doesn't go smoothly, you can paste this whole document into a Claude (or similar AI assistant) session and ask it to walk you through each step and help troubleshoot as you go.

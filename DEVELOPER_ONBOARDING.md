# HCopilot — Developer Setup Guide (Docker)

Hussein,

Since you delivered HCopilot, we've made two major changes to the project that you should know about before picking development back up:

1. **The data layer moved from CSV files to a real Microsoft SQL Server database.** Every feature that used to read/write CSV files under `backend/datasets/` now goes through SQLAlchemy models and Alembic migrations (`backend/db/`, `backend/alembic/`).
2. **The whole application is now Dockerized** — backend, frontend, and SQL Server all run as containers, defined in `docker-compose.yml` at the repo root. This is now the standard way to run the project, in development and in production.

The repository is public: `https://github.com/aidepartmentrah-pixel/HCopilot`. You don't have write access to it directly — fork it, do your work in your fork, and open a Pull Request back to us when you're ready. We'll review and merge from there.

## 1. Fork and clone

1. Go to `https://github.com/aidepartmentrah-pixel/HCopilot` and click **Fork**.
2. Clone your fork locally:
   ```
   git clone https://github.com/HusseinZein235/HCopilot.git
   cd HCopilot
   ```

## 2. Prerequisite

- **Docker Desktop**, installed and running. That's the only thing you need installed on your machine — Python, SQL Server, and all dependencies run inside the containers themselves.

## 3. Configure the environment

Copy the template and fill in a real password:

```
cp .env.example .env
```

Open `.env` and replace both `change-me-to-a-strong-password` values with a
real password. It needs to be 8+ characters with at least 3 of: uppercase,
lowercase, digit, symbol — SQL Server will reject anything weaker.

## 4. Build and start everything

```
docker compose build
docker compose up -d
```

This builds the backend and frontend images from the `Dockerfile`s in the
repo, then starts four containers in order: `sqlserver` → `db-init` (builds
the database schema via Alembic, then exits — this is expected, not a
crash) → `backend` → `frontend`.

Check everything came up healthy:
```
docker compose ps
```
`sqlserver`, `backend`, and `frontend` should all show `healthy`. `db-init`
should show `Exited (0)`.

## 5. About data — please read this before assuming something's broken

**The actual hospital data is intentionally not in this repository.** The CSV files that used to hold patients, staff, beds, and wards, and the historical dataset used to train the forecasting model, are excluded via `.gitignore` for size and privacy reasons — they always have been, since your original commit. `db-init` looks for them automatically on startup, but since they don't exist in your clone, it will simply find nothing to load.

After `docker compose up`, your database will have empty tables, except for a few things the application seeds automatically the first time it runs:
- A default `admin` / `admin` login
- Default shift definitions (morning/night)
- Default rotation groups (Group 1/Group 2)

Everything else — wards, beds, doctors, nurses, patients — will be empty until you either:
- Create test records yourself through the app's own Settings pages, or
- Ask us for a sanitized sample dataset if you need bulk data to test something specific.

This is expected, not a bug in your setup.

## 6. Use the app

Open `http://localhost:8082` in a browser (or whatever `FRONTEND_PORT` you set in `.env`). Log in with `admin` / `admin`.

## 7. Day-to-day commands

| What | Command |
|---|---|
| View logs | `docker compose logs -f backend` (or `frontend`, `sqlserver`) |
| Restart after a code change | `docker compose up -d --build backend` |
| Stop everything | `docker compose down` |
| Stop and wipe the database too | `docker compose down -v` |

## 8. Running the test suite

```
docker compose exec backend pytest tests/
```

This should pass in full against your empty-but-schema-complete database — it's designed to create and clean up its own test data, not depend on any pre-existing records.

## 9. Submitting your work

- Work on a new branch in your fork, not `main`.
- Commit and push to your fork.
- Open a Pull Request from your fork back to `aidepartmentrah-pixel/HCopilot` when you're ready for review.

---

If anything above doesn't go smoothly, you can paste this whole document into a Claude (or similar AI assistant) session and ask it to walk you through each step and help troubleshoot as you go.

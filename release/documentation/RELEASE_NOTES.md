# Release Notes — HCopilot 1.0.0 (first Docker release)

## What this release is

The first Dockerized, offline-deployable release of HCopilot. Prior to
this, HCopilot ran directly on a workstation via `python app.py`, reading
and writing CSV files with no real database.

This release follows two prior stages of work:
- **Stage 1**: migrated all operational data (Users, Doctors, Nurses,
  Shifts, Groups, Wards, EDbeds, DailyPatients, LogPatients, and 6
  relation tables) from CSV files to Microsoft SQL Server via a
  SQLAlchemy ORM layer and Alembic migrations.
- **Stage 2**: retrained the flow-prediction XGBoost model sourcing its
  training data (425,022 historical ED stays, 3,287 days of weather) from
  SQL Server instead of static CSV files.
- **Stage 3 (this release)**: packaged the application as Docker images
  (backend, frontend, SQL Server, and a one-shot database-init service)
  with an offline install/update/backup/restore workflow.

## What's included

- `hcopilot-backend:1.0.0` — FastAPI + Alembic + the SQL Server data layer.
- `hcopilot-frontend:1.0.0` — nginx serving the static frontend and
  reverse-proxying `/api/*` to the backend.
- `mcr.microsoft.com/mssql/server:2022-latest` — included in this release
  so the offline server doesn't need it pre-staged separately.
- `db-init` (reuses the backend image with a different command) — on
  first start: creates the database, builds the schema, then transports
  the hospital's real existing lookup/configuration data (ward layout,
  bed numbers, staff roster) and the ML historical training data into SQL
  Server. Safe to re-run — every step is idempotent.

## Code changes made specifically for this release

- **Fixed a real pre-existing bug**: the frontend hardcoded
  `http://localhost:8090` as an absolute API URL across 19 of ~24 JS
  files (~86 occurrences). This meant the app only ever worked correctly
  when accessed from the same machine running the backend — any other
  hospital workstation would have silently failed on every API call. All
  occurrences now use relative paths, which work correctly whether the
  frontend and backend are one container or two, and correctly through
  the nginx reverse proxy from a different origin/port than the backend.
- Added a `GET /health` endpoint to the backend (didn't exist before) for
  container healthchecks.
- Made the frontend static-file mount in `app.py` conditional on the
  folder existing, so the backend image works standalone (API-only)
  without needing the frontend files copied into it.

## Testing performed (this session, against a real running stack)

- `docker compose build` — both images build successfully.
- Full stack `docker compose up` — all 4 services reach healthy/completed
  state in the correct dependency order (sqlserver → db-init → backend →
  frontend).
- **Data migration verified at the value level, not just row counts**:
  independently recounted every CSV file, cross-checked against direct
  SQL queries against the running container, and spot-checked real
  records (bed numbers 101/102/103/2071/`CHARIOT-26`, doctor "Dr. John",
  patient 10000003's full clinical record) — all matched exactly.
- Login, ward creation, bed creation, and bed listing tested through the
  actual nginx reverse-proxy path (not directly against the backend port)
  to validate the hardcoded-URL fix under realistic conditions.
- Restart test (`docker compose restart backend`) and full stop/start
  cycle — data persisted correctly both times; `db-init` correctly
  detected it was already at the target schema/data state on the second
  run and made no changes (idempotency confirmed, not assumed).
- **Two real bugs found and fixed during testing** (not just during
  writing):
  1. The first version of `db-init` only ran `alembic upgrade head`,
     which produces a schema with no data. A fresh deployment would have
     started with zero wards, beds, doctors, nurses, or patients — an
     operator would have had to manually re-enter the hospital's entire
     ED configuration. Fixed by wiring `migrate_csv_to_mssql.py` and
     `import_ml_historical_data.py` into `db-init`, and by no longer
     excluding the source CSVs from the backend image.
  2. `backup_database.sh`/`restore_database.sh` initially failed: the
     `-i <path>` argument to `sqlcmd` resolves inside the container, not
     on the host, and no path there matched. Fixed by piping the `.sql`
     file through stdin instead. Separately, the backup also failed with
     "WITH COMPRESSION is not supported on Express Edition" — the
     `sqlserver` container runs SQL Server Express, which doesn't support
     backup compression. Fixed by removing that option.
  3. Backup and restore were then re-tested for real: a full backup
     (11,914 pages, ~98MB) was taken, and a full restore from that backup
     file was performed against the live stack — confirmed the
     application returned to a healthy state with the correct data
     (24 beds, 18 doctors) afterward.
  4. The frontend container's `HEALTHCHECK` used `wget http://localhost/`,
     which resolves `localhost` to `::1` (IPv6) inside the container —
     nginx's plain `listen 80;` only binds IPv4, so the healthcheck failed
     with "Connection refused" and Docker reported the container
     `(unhealthy)` even though it was correctly serving every real request
     the whole time (confirmed via direct `curl` through the mapped port
     throughout). Fixed by pointing the healthcheck at `127.0.0.1`
     instead of `localhost`.
  5. **Found during a real offline install attempt (RAH Lab, OR-LAB
     machine)**: `compose/.env` was created from the template but the
     placeholder `REPLACE_WITH_STRONG_PASSWORD` was left in place for both
     `MSSQL_SA_PASSWORD` and `DATABASE_PASSWORD`. That string satisfies
     only 2 of the 4 character classes SQL Server's password policy
     requires, so SQL Server rejected it — the healthcheck then failed
     repeatedly with `Login failed for user 'sa'`, and the install aborted
     with the opaque `dependency failed to start: container ... sqlserver
     ... is unhealthy` message, giving no indication the real cause was
     the password. Fixed by adding an explicit check at the top of
     `install_offline.sh` that fails immediately with a clear message if
     the placeholder is still present, or if either password fails basic
     complexity validation — before Docker is touched at all. See
     `TROUBLESHOOTING.md` for the recovery steps if you already hit this
     (the stale, partially-initialized data volume must be removed before
     retrying — fixing `.env` alone is not sufficient).

## Known limitations

- `Patients.csv` (the ~38MB historical patient-intake sampler used by the
  Simulation feature's "sample a random patient" button) was never
  available in the environment this release was built in, and is not
  included. That specific button will 404 until this file is sourced and
  added in a future release; nothing else depends on it.
- The default `admin`/`admin` login is seeded automatically and must be
  changed after first install (see `VALIDATION_CHECKLIST.md`).

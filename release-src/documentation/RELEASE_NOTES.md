# Release Notes — HCopilot 1.0.1

## What's new in 1.0.1

Rebuilt on top of a pull request from the original developer (Hussein)
that added four features, plus one regression it introduced and this
release's own fix, plus new test coverage for all of it:

- **Discharge destination**: `DailyPatients`/`LogPatients` gained a
  `destination` column ("Home" or "Hospital Department[: <name>]"),
  validated server-side and settable from both the scheduling and
  unurgent discharge endpoints.
- **Bed history / admission ward tracking**: every bed a patient
  occupies during a stay is now appended to a `bed_history` trail, and
  the *first* bed's ward is stamped as `admission_ward_id`/
  `admission_ward_name` — used to attribute a discharge to the right
  ward even after later bed moves.
- **Daily ward census** (`/api/ward-census/today`, `/history`,
  `/snapshot`): a permanent, once-per-day snapshot of active +
  discharged patients per ward, computed automatically by a new
  background scheduler (immediate on startup, hourly refresh, and a
  00:05 daily finalize-yesterday job) and also triggerable manually.
- **Date-filterable daily analysis report** (`/api/daily-analysis/report`):
  combines patient arrivals/discharges/demographics/acuity/complaints/
  wait-time/length-of-stay/destination breakdowns, a day-over-day
  comparison, per-ward census, and per-doctor/per-nurse patient load
  (live "active" + permanently archived "ended") into one endpoint for
  a single selected date.
- **Permanent staff/assignment history**: deleting a doctor or nurse
  now archives their record into `DoctorLog`/`NurseLog` first, and every
  patient<->doctor/patient<->nurse link is archived into
  `PatientDoctorLog`/`PatientNurseLog` before being removed (on
  discharge, reassignment, manual unassignment, or staff deletion) — so
  "who treated which patient" survives independently of the live
  roster, which is what the daily-analysis report's staff-load figures
  are built on.
- Patient add/modify now requires `name`, `gender`, `arrival_time`,
  `pain`, and `chiefcomplaint` (previously optional) and rejects a
  negative `age` — matching validation the frontend's own add-patient
  form already enforced client-side, now also enforced server-side.

### Regression found and fixed in this release

The incoming pull request's `docker-compose.yml` change accidentally
dropped `python scripts/import_ml_historical_data.py` from `db-init`'s
command (kept `migrate_csv_to_mssql.py` but not the historical ML
dataset import). A fresh install from that state would have built a
schema with no `HistoricalEdStays`/`DailyWeather` data, breaking the
flow-prediction feature entirely. Restored both scripts to `db-init`'s
command.

While investigating, also hardened `import_ml_historical_data.py`
itself: it previously called `pd.read_csv()` directly with no existence
check, so it crashed outright on any fresh clone missing the (gitignored)
source CSVs, instead of skipping gracefully the way
`migrate_csv_to_mssql.py` already did. Fixed to match that pattern.

### Test coverage added in this release

Added end-to-end coverage for every feature above that shipped without
tests: ward census snapshot/history round-trip, the daily-analysis
report's shape and day-over-day comparison, discharge destination
validation and round-trip (including verifying `bed_history` and that
doctor/nurse links show up as archived "ended_patients"), and the new
required-field/negative-age patient validation. Updated four pre-existing
tests whose "add patient" setup payloads predated the required-field
tightening and would otherwise now fail with 422.

All 64 backend tests pass against this release's images.

### Installer/updater hardening (applies to both 1.0.0 and 1.0.1)

Backported from the same offline-install hardening pass done on the
sibling STT-SCHEDULE project:

- `compose/.env.offline.template` now ships a real, working default
  password (`NewPassword2004`) for `MSSQL_SA_PASSWORD`/`DATABASE_PASSWORD`
  instead of a placeholder — `install_offline.sh` auto-copies the
  template to `.env` on first run, so a fresh install completes in one
  command with no manual editing required.
- Both `install_offline.sh` and `update_offline.sh` now self-heal their
  own executable permissions at startup (protects against FAT32/USB
  transfers stripping the executable bit — a real recurring issue for
  DVD/USB-based offline releases).
- `update_offline.sh` now prints the current `BACKEND_PORT`/
  `FRONTEND_PORT`/`DATABASE_PORT` before updating, warns (non-fatally)
  if any of them is held by something outside this app's own Compose
  project, and uses `docker compose up -d --force-recreate` instead of
  plain `up -d` — guards against a container that failed to start on a
  previous run (e.g. due to a port conflict) surviving as a stale,
  improperly-networked object across a later, successful update attempt.

See `TROUBLESHOOTING.md`/`VALIDATION_CHECKLIST.md` in this same
`documentation/` folder for the updated guidance that goes with these
changes — in particular, remember to rotate the shipped default
password before real hospital go-live; shipping a working default for
installer convenience is not the same as using it in production.

### Deployment mechanism rewrite (still 1.0.1 — application code unchanged)

The application images are unchanged from the 1.0.1 build above. What
changed is how `install_offline.sh`/`update_offline.sh` deploy them,
brought in line with the RAH Application Release & Deployment Standard:

- **Persistent install directory.** The app now installs to
  `/opt/rah/apps/hcopilot/`, separate from the release folder it was
  installed from. Previously everything (`.env`, backups, the Compose
  project) lived inside the release folder itself, which meant an update
  from a genuinely separate release folder had no `.env` to find — this is
  now fixed.
- **No more shipped default password.** `MSSQL_SA_PASSWORD`/
  `DATABASE_PASSWORD` are generated fresh (24 random alphanumeric
  characters) on first install instead of shipping `NewPassword2004` in
  the template. No rotation step is needed before go-live anymore.
- **`release-src/` is now the single editable source** for every script,
  the Compose template, and this documentation — `release/<version>/` is
  a generated, gitignored build output assembled by
  `release-src/build_release.sh`, never hand-edited directly.
- Day-2 operational scripts and the backup/restore SQL are copied into
  `/opt/rah/apps/hcopilot/scripts/` and `.../database/` on every
  install/update, so they remain usable after the release folder is
  archived.
- `update_offline.sh` now backs up the database automatically (no manual
  confirmation prompt) and merges in any newly-required `.env` variables
  without touching existing values.
- Added best-effort DBeaver connection registration
  (`provision_dbeaver.sh`) on both install and update — **not yet verified
  against a real DBeaver install**, see that script's header comment.

---

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

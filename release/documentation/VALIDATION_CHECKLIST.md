# Validation Checklist — HCopilot

Run through this after every install and every update, before declaring the
deployment operational.

## Containers

- [ ] `docker compose ps` shows all 4 services (`sqlserver`, `db-init`,
      `backend`, `frontend`) — `db-init` shows `Exited (0)`, all others
      show `Up` and `(healthy)`.

## Database — schema and lookup/configuration data

- [ ] `db-init` logs show a row-count parity report ending with all lines
      marked `OK` (`docker compose logs db-init`) — this confirms the
      hospital's real ward/bed/staff data, not a blank template, was
      transported correctly.
- [ ] `docker compose exec sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "<password>" -C -d HCopilotDB -Q "SELECT COUNT(*) FROM EDbeds;"`
      returns the expected real bed count (24 as of this release).
- [ ] `HistoricalEdStays`/`DailyWeather` are populated (425022 / 3287 rows
      as of this release) — required for the Flow Prediction feature.

## Backend / Frontend

- [ ] `http://<server-ip>:<FRONTEND_PORT>/` loads the frontend.
- [ ] Log in with `admin` / `admin` succeeds.
- [ ] **Changed the default admin password** — do not leave it as `admin`
      on anything but a first-boot test.
- [ ] Beds Display page loads and shows real bed numbers/wards (not empty).
- [ ] Statistics page loads without a "Failed to fetch" error.
- [ ] Flow Prediction page loads a forecast without a "Cannot read
      properties of undefined" error.
- [ ] Assigning a patient to a bed and discharging them both succeed
      (confirms `backend` ↔ `sqlserver` read/write connectivity, not just
      read-only health checks).

## Persistence

- [ ] `docker compose restart backend` — data is still present afterward.
- [ ] Full `docker compose stop` then `docker compose start` — all
      services recover to healthy and data is intact (this specifically
      tests the named-volume persistence, not just an in-memory restart).

## Backup/restore

- [ ] `../scripts/backup_database.sh` completes and produces a `.bak` file
      under `release/compose/backups/`.
- [ ] (Optional but recommended before going live) A test restore from
      that backup succeeds and the application remains healthy afterward.

## Security basics

- [ ] `compose/.env` is not world-readable (`chmod 600 .env` if needed)
      and was not copied via an unapproved transfer method.
- [ ] `MSSQL_SA_PASSWORD`/`DATABASE_PASSWORD` are real random values, not
      left as any documentation placeholder.
- [ ] The default `admin`/`admin` login has been changed.
- [ ] SQL Server's port is only reachable from where it needs to be —
      don't expose it more broadly than required for GUI DB tools.

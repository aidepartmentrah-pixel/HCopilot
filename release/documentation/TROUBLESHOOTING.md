# Troubleshooting — HCopilot

## Install fails immediately: "dependency failed to start: container ... sqlserver ... is unhealthy"

**Confirmed root cause in the field**: `compose/.env` still had the
placeholder text `REPLACE_WITH_STRONG_PASSWORD` left in `MSSQL_SA_PASSWORD`/
`DATABASE_PASSWORD` (from `.env.offline.template`). That string is all
uppercase letters and underscores — only 2 of the 4 character classes SQL
Server's password policy requires (needs 3 of: uppercase, lowercase, digit,
symbol) — so SQL Server's own setup step rejects it. The healthcheck then
fails every time with `Login failed for user 'sa'`, and Compose gives up
waiting and aborts the whole install with this confusing message, days
after the actual cause (a copy-paste step that was skipped).

Current versions of `install_offline.sh` catch this instantly with a clear
error before touching Docker at all — if you're seeing the confusing
version instead, you're on an older copy of the script; get the latest
release.

**If you're already stuck in this state**, fixing `.env` alone is not
enough — SQL Server only applies `MSSQL_SA_PASSWORD` the very first time it
sees a truly empty data volume. The failed attempt already created and
partially initialized that volume, so retrying without wiping it first
reproduces the exact same login failure. Fix in this order:

```bash
cd release/compose
docker compose down -v      # removes the broken volume too — required, not optional
```

Then edit `compose/.env` and replace **both** placeholder lines with a
real password meeting the complexity rule above, confirm with
`cat compose/.env` that no `REPLACE_WITH_STRONG_PASSWORD` text remains,
and re-run `../scripts/install_offline.sh`.

## `db-init` container exits with an error / `backend` never starts

```bash
cd release/compose
docker compose logs db-init
```

Common causes:
- **Wrong `MSSQL_SA_PASSWORD`** in `.env` — must match what `sqlserver`
  was first created with (SQL Server only sets the `sa` password from
  `MSSQL_SA_PASSWORD` on the container's very first start; changing `.env`
  afterward does not change it — see "I need to change the sa password"
  below).
- **`sqlserver` not healthy yet** — `db-init` waits for the healthcheck;
  if the host is slow, wait longer before assuming failure.
- **Password doesn't meet SQL Server's complexity policy** — needs 8+
  characters and at least 3 of: uppercase, lowercase, digit, symbol.

## "Error loading statistics" / "Error loading predictions" / any "Failed to fetch" in the browser

Almost always means the stack isn't actually running yet (mid-restart,
mid-update, or just not started) — the browser tab was open before/after
the containers were unavailable. Check:

```bash
cd release/compose
docker compose ps
```

All four services should show `Up` (`sqlserver`/`backend` should say
`healthy`, `db-init` should say `Exited (0)`). If everything is up and you
still see this, check `docker compose logs backend` for an actual error.

## "Cannot read properties of undefined (reading 'map')" specifically on the Flow Prediction page

This means `/api/flow-prediction/predict` (or `/historical`) returned an
error response instead of real predictions, most likely a 404 because
`HistoricalEdStays`/`DailyWeather` are empty. Check:

```bash
docker compose exec sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "<sa password>" -C \
  -Q "SELECT COUNT(*) FROM HistoricalEdStays; SELECT COUNT(*) FROM DailyWeather;"
```

Both should show non-zero counts (425022 and 3287 respectively, for the
data as of this release). If they're `0`, `db-init` didn't run
`import_ml_historical_data.py` successfully — check
`docker compose logs db-init` for the reason, and re-run it manually if
needed:

```bash
docker compose exec backend python scripts/import_ml_historical_data.py
```

## Beds/wards/staff show up empty on a fresh install

This means `migrate_csv_to_mssql.py` didn't run or didn't find data.
Check `docker compose logs db-init` for a row-count parity report — every
line should say `OK`. If a table shows a mismatch or the whole step is
missing from the log, re-run it manually:

```bash
docker compose exec backend python scripts/migrate_csv_to_mssql.py
```

## A container shows `(unhealthy)`

```bash
docker inspect --format='{{json .State.Health}}' <container-name>
```

Shows the last few healthcheck attempts and their output — usually enough
to diagnose without digging further.

## I need to change the `sa` password after first install

SQL Server only reads `MSSQL_SA_PASSWORD` on the container's first-ever
start. To change it afterward:

```bash
docker compose exec sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "<old password>" -C \
  -Q "ALTER LOGIN sa WITH PASSWORD = '<new password>'"
```

Then update `MSSQL_SA_PASSWORD`/`DATABASE_PASSWORD` in `.env` to match
(needed for future backup/restore commands).

## Backup fails with "WITH COMPRESSION is not supported on Express Edition"

Already fixed in this release's `database/backup_database.sql` — the
SQL Server container runs the free Express edition, which doesn't support
backup compression. If you've customized that script, remove
`COMPRESSION` from the `WITH` clause.

## Nothing works and I want to start over (fresh database)

**Destroys all data**, including the hospital's real ward/bed/staff
configuration that was loaded on first install. Only do this on a
fresh/test install, never on a server holding real records:

```bash
cd release/compose
docker compose down -v   # -v removes the sqlserver data volume too
docker compose up -d
```

# Install Offline — HCopilot

For an IT employee installing this on the offline Debian Docker host for
the first time. Every command below is exact — copy/paste it as written.

## What you need before starting

- This release folder, copied onto the offline server (via the hospital's
  approved DVD/USB transfer procedure). It can go anywhere — `/tmp`,
  `/media/usb`, your home directory — its location does not matter and it
  is disposable once installation succeeds.
- Docker Engine already installed and running on the offline server.

That's it — no manual `.env` editing required. `install_offline.sh`
generates a fresh, random database password automatically on first run and
writes it into the persistent install's `.env` — there is no shipped
default password to remember or rotate.

## Where this actually gets installed

Unlike earlier releases, HCopilot does **not** run out of this release
folder. `install_offline.sh` creates one persistent, stable install
directory and everything the running application depends on lives there:

```
/opt/rah/apps/hcopilot/
├── compose/            docker-compose.yml (this release's version) + .env (persistent, generated once)
├── database/           backup/restore SQL, refreshed on every install/update
├── scripts/            day-2 operations: start/stop/logs/backup/restore/verify/DBeaver
├── backups/            SQL Server .bak files — survives release-folder cleanup
├── INSTALLED_VERSION
└── DEPLOYMENT_HISTORY.log
```

Once installation finishes, **this release folder is no longer needed** —
you can archive or delete it. Day-2 operations should be run from
`/opt/rah/apps/hcopilot/scripts/`, not from this release folder.

(Testing/engineering only: set `HCOPILOT_INSTALL_ROOT` before running any
script to install somewhere other than `/opt/rah/apps/hcopilot/`. Never do
this for a real hospital install.)

## Important: this first install includes real hospital data

Unlike a blank template, this release's Docker images already contain
HCopilot's actual existing configuration and history — real ward names,
bed numbers, staff roster, active/discharged patients, and the historical
data used by the flow-prediction model. The `db-init` service transports
all of this into the new database automatically on first start (see
`VALIDATION_CHECKLIST.md` to confirm it landed correctly). Nothing needs to
be manually re-entered.

If you are instead using this release as a **generic template for a
different hospital**, you should not run the default first install as-is —
talk to RAH Lab about producing a blank-data variant first.

## Step 1 — Run the installer

```bash
cd release/<version>
./scripts/install_offline.sh
```

This single command:
1. Creates `/opt/rah/apps/hcopilot/` and generates a random database
   password into its persistent `.env`.
2. Installs the day-2 operational scripts there.
3. Loads the Docker images (`docker-images/*.tar`) — no internet or Docker
   Hub access required.
4. Starts the stack: `sqlserver` → `db-init` (creates the database, builds
   the schema via Alembic, loads the real lookup/configuration/historical
   data) → `backend` → `frontend`.
5. Runs `verify_installation.sh` automatically.
6. Registers the database connection in DBeaver (best-effort — if it can't
   find your DBeaver install, it prints the connection details instead so
   you can add it by hand in under a minute).

Expected output ends with:
```
==> Installation verified — application is healthy.
...
 Installation complete.
```

## Step 2 — First login

Open `http://<offline-server-IP>:<FRONTEND_PORT>/` in a browser (default
port `8082` unless you changed it in `.env`).

Log in with `admin` / `admin` (seeded automatically by the backend on
first startup if no users exist) and **change this password immediately**
via Settings → Accounts.

## If something fails

See `TROUBLESHOOTING.md`.

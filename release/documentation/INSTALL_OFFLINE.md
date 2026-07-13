# Install Offline — HCopilot

For an IT employee installing this on the offline Debian Docker host for
the first time. Every command below is exact — copy/paste it as written.

## What you need before starting

- This release folder, copied onto the offline server (via the hospital's
  approved DVD/USB transfer procedure).
- Docker Engine already installed and running on the offline server.
- A filled-in `.env` file — copy `compose/.env.offline.template` to
  `compose/.env` and fill in real passwords. **Do not use the sample
  values from this documentation in production.**

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

## Step 1 — Load the Docker images

```bash
cd release
./scripts/load_images.sh
```

Expected output ends with:
```
==> All images loaded.
```

This reads `docker-images/*.tar` and loads them into the local Docker
Engine with `docker load` — no internet or Docker Hub access required.

## Step 2 — Start the stack

```bash
./scripts/start_stack.sh
```

This runs `docker compose up -d` using `compose/docker-compose.yml` and
your `compose/.env`. It will:
1. Start `sqlserver` and wait for its healthcheck.
2. Run `db-init` once: creates the database, builds the schema (Alembic
   migrations), then loads the real lookup/configuration/historical data —
   exits 0 on success.
3. Start `backend` once `db-init` completes successfully.
4. Start `frontend` (nginx) once `backend` is healthy — this is the only
   port exposed to hospital workstations.

## Step 3 — Verify

```bash
./scripts/verify_installation.sh
```

Expected output ends with:
```
==> Installation verified — application is healthy.
```

This checks: all containers are `Up` (and `healthy` where a healthcheck
exists), the database has real data in it, the backend responds on
`/health`, and the frontend can reach the backend through its own reverse
proxy.

## Step 4 — First login

Open `http://<offline-server-IP>:<FRONTEND_PORT>/` in a browser (default
port `8082` unless you changed it in `.env`).

Log in with `admin` / `admin` (seeded automatically by the backend on
first startup if no users exist) and **change this password immediately**
via Settings → Accounts.

## If something fails

See `TROUBLESHOOTING.md`.

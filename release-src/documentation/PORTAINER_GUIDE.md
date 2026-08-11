# Portainer Deployment Guide — HCopilot

For operators who prefer managing this stack through Portainer's web UI
instead of the command line.

**Prefer `./scripts/install_offline.sh`/`update_offline.sh` (see
`INSTALL_OFFLINE.md`/`UPDATE_OFFLINE.md`) when possible** — those scripts
generate the database password, install everything to the persistent
`/opt/rah/apps/hcopilot/` location, register the DBeaver connection, and
record deployment history automatically. Deploying through Portainer
bypasses all of that: you'll need to generate/track the password yourself,
this stack won't live at the standard persistent path, and you're
responsible for keeping backups/DBeaver/history in sync by hand. Use this
guide only when a GUI-managed stack is specifically what you want.

## Prerequisite

Portainer CE is already installed on the offline server. This guide
assumes it's reachable at `https://<server-ip>:9443`.

## Step 1 — Confirm images are loaded

Images must be loaded via `./scripts/load_images.sh` (or manually,
`docker load -i release/docker-images/<name>.tar` for each file)
**before** creating the stack — Portainer cannot pull them from Docker Hub
on an offline server.

In Portainer: **Images** (left sidebar) → confirm you see
`hcopilot-backend:1.0.1`, `hcopilot-frontend:1.0.1`, and
`mcr.microsoft.com/mssql/server:2022-latest` listed.

## Step 2 — Create the stack

1. **Stacks** → **Add stack**.
2. Name it `hcopilot`.
3. **Web editor** → paste the contents of `release/compose/docker-compose.yml`.
4. Under **Environment variables**, add every variable from your filled-in
   `.env` (`MSSQL_SA_PASSWORD`, `DATABASE_NAME`, `DATABASE_USER`,
   `DATABASE_PASSWORD`, `DATABASE_PORT`, `BACKEND_PORT`, `FRONTEND_PORT`) —
   either paste them one by one, or use Portainer's "Load variables from
   .env file" upload option if your version supports it.
5. Click **Deploy the stack**.

## Step 3 — Watch it come up

**Stacks** → `hcopilot` → you'll see all 4 containers. `db-init`
will show as **Exited (0)** once it finishes — that's success, not a
failure. It's a one-shot job that builds the database schema and loads
the hospital's existing lookup/configuration/historical data, then exits.
If it shows a non-zero exit code, click it → **Logs** to see why.

## Step 4 — View logs

**Containers** → click a container name → **Logs** tab. Useful ones:
`hcopilot-backend-1`, `hcopilot-db-init-1`.

## Step 5 — Restart / stop services

**Containers** → select checkbox(es) → **Restart** / **Stop** at the top
of the list. Or manage the whole stack at once from **Stacks** →
`hcopilot` → **Stop this stack** / **Start this stack**.

## Step 6 — Confirm SQL Server is running

**Containers** → `hcopilot-sqlserver-1` → status should read
**running (healthy)**. If it says **running (unhealthy)** or **starting**
for more than a minute, click into **Logs** to check for a startup error
(usually a password complexity issue on first boot — SQL Server requires
8+ characters with at least 3 of: uppercase, lowercase, digit, symbol).

## Updating via Portainer

**Stacks** → `hcopilot` → **Editor** tab → if the compose file itself
changed, paste the new version → **Update the stack**. If only image
contents changed (same compose file, new build), instead: **Images** →
remove the old `hcopilot-backend`/`hcopilot-frontend` images → load the
new `.tar` files → **Stacks** → `hcopilot` → **Update the stack** with
**Re-pull image** enabled.

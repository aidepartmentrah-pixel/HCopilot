#!/usr/bin/env bash
# backup_database.sh — full HCopilotDB backup, written host-side under the
# persistent install directory (survives container/volume recreation AND
# release-folder cleanup).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

require_existing_install
compose_cd

: "${DATABASE_NAME:?DATABASE_NAME is required (set in $INSTALL_ENV_FILE)}"
: "${MSSQL_SA_PASSWORD:?MSSQL_SA_PASSWORD is required (set in $INSTALL_ENV_FILE)}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="/var/opt/mssql/backup/${DATABASE_NAME}_${TIMESTAMP}.bak"

# The backup volume is bind-mounted from the host, which Docker creates
# root-owned by default -- but SQL Server's own process inside the
# container runs as the unprivileged `mssql` user (same UID-mismatch bug
# class already documented for pgAdmin and Voice Project's SQL Server —
# see docs/development/application-validation-lessons.md — hitting this
# specific directory for the first time here, since backup was never
# actually run for real before now). Fixed from inside the container via
# a root exec, not by chowning a host path whose real resolved location
# has already proven unreliable to predict from outside (see the
# docker compose cp comment below).
docker compose exec -T -u root sqlserver chown mssql:mssql /var/opt/mssql/backup

# -i takes a path resolved INSIDE the container, and database/*.sql is not
# mounted there — pipe it through stdin instead (sqlcmd reads from stdin
# when no -i/-Q is given). Reads from $RELEASE_DIR (the currently-running
# Release's own immutable copy), not $INSTALL_ROOT — the .sql file doesn't
# change between versions and needs no install/update-time copy step, and
# reading it from RELEASE_DIR means backup works even for a deployment
# whose original install predates this file being packaged at all.
docker compose exec -T sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C \
  -v DB_NAME="$DATABASE_NAME" -v BACKUP_PATH="$BACKUP_FILE" \
  < "$RELEASE_DIR/database/backup_database.sql"

log "Backup written inside container at ${BACKUP_FILE}"

# RAH_BACKUP_OUTPUT_PATH is the durable, Platform-owned artifact location
# (config.backups_path/<slug>/<timestamp>/database.dump — outside the
# replaceable app deployment entirely, per the Backup Isolation Rule).
# Pulled directly from the container by its own internal path via `docker
# compose cp`, deliberately NOT via a computed host-side bind-mount path:
# the compose file's own backup-volume convention has changed at least
# once already (`./backups` vs `../backups`, a real, separately-found
# discrepancy between what's baked into an already-running deployment and
# what's in the current source tree), so trusting a host-path convention
# here would silently break for exactly the deployment histories this
# script most needs to handle correctly.
if [ -n "${RAH_BACKUP_OUTPUT_PATH:-}" ]; then
  mkdir -p "$(dirname "$RAH_BACKUP_OUTPUT_PATH")"
  docker compose cp "sqlserver:${BACKUP_FILE}" "$RAH_BACKUP_OUTPUT_PATH"
  log "Copied to Platform-owned backup location: $RAH_BACKUP_OUTPUT_PATH"
fi

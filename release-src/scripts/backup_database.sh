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

HOST_BACKUP_FILE="$INSTALL_BACKUPS_DIR/${DATABASE_NAME}_${TIMESTAMP}.bak"
log "Backup written inside container at ${BACKUP_FILE}"
log "On the host, this is under $INSTALL_BACKUPS_DIR (bind-mounted — see compose/docker-compose.yml)"

# RAH_BACKUP_OUTPUT_PATH is the durable, Platform-owned artifact location
# (config.backups_path/<slug>/<timestamp>/database.dump — outside the
# replaceable app deployment entirely, per the Backup Isolation Rule).
# HOST_BACKUP_FILE above is only this script's own transient working copy;
# Platform checks for the artifact at RAH_BACKUP_OUTPUT_PATH specifically,
# so it must be copied there for the backup to be recorded as real.
if [ -n "${RAH_BACKUP_OUTPUT_PATH:-}" ]; then
  mkdir -p "$(dirname "$RAH_BACKUP_OUTPUT_PATH")"
  cp "$HOST_BACKUP_FILE" "$RAH_BACKUP_OUTPUT_PATH"
  log "Copied to Platform-owned backup location: $RAH_BACKUP_OUTPUT_PATH"
fi

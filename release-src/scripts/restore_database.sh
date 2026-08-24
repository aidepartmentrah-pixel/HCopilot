#!/usr/bin/env bash
# restore_database.sh — restores HCopilotDB from a .bak file.
# Reads the source from $RAH_BACKUP_SOURCE_PATH (set by Platform's
# recovery.py to the real, durable artifact under config.backups_path —
# outside the app's own deployment entirely, per the Backup Isolation
# Rule) — Platform's run_script() only ever passes environment variables,
# never positional arguments, so a CLI-argument convention here would
# fail every real Platform-driven restore unconditionally.
# WARNING: overwrites the current database. Stops the backend first.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

: "${RAH_BACKUP_SOURCE_PATH:?RAH_BACKUP_SOURCE_PATH is required (set by the Platform restore operation)}"
: "${DATABASE_NAME:?DATABASE_NAME is required (set in $INSTALL_ENV_FILE)}"
: "${MSSQL_SA_PASSWORD:?MSSQL_SA_PASSWORD is required (set in $INSTALL_ENV_FILE)}"

require_existing_install
compose_cd

[ -f "$RAH_BACKUP_SOURCE_PATH" ] || die "$RAH_BACKUP_SOURCE_PATH not found."

# RAH_BACKUP_SOURCE_PATH lives under Platform's own config.backups_path,
# which the sqlserver container has no bind mount into at all. Copy it
# into $INSTALL_BACKUPS_DIR first -- that directory IS bind-mounted into
# the sqlserver container at /var/opt/mssql/backup (see
# compose/docker-compose.yml) -- so sqlcmd can reach it by a
# container-internal path the same way backup_database.sh already does.
mkdir -p "$INSTALL_BACKUPS_DIR"
BACKUP_FILENAME="restore_$(date +%Y%m%d_%H%M%S).bak"
cp "$RAH_BACKUP_SOURCE_PATH" "$INSTALL_BACKUPS_DIR/$BACKUP_FILENAME"
CONTAINER_BACKUP_PATH="/var/opt/mssql/backup/${BACKUP_FILENAME}"

log "This will REPLACE the current ${DATABASE_NAME} database. Stopping backend first..."
docker compose stop backend

# -i takes a path resolved INSIDE the container, and database/*.sql is not
# mounted there — pipe it through stdin instead. Reads from $RELEASE_DIR
# (the currently-running Release's own immutable copy), not $INSTALL_ROOT
# — see backup_database.sh's own comment for why.
docker compose exec -T sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C \
  -v DB_NAME="$DATABASE_NAME" -v BACKUP_PATH="$CONTAINER_BACKUP_PATH" \
  < "$RELEASE_DIR/database/restore_database.sql"

log "Restore complete. Restarting backend..."
docker compose start backend
log "Done. Run scripts/verify_installation.sh to confirm."

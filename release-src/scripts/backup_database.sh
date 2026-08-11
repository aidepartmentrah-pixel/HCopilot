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
# mounted there — pipe the host-side .sql file through stdin instead (sqlcmd
# reads from stdin when no -i/-Q is given).
docker compose exec -T sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C \
  -v DB_NAME="$DATABASE_NAME" -v BACKUP_PATH="$BACKUP_FILE" \
  < "$INSTALL_ROOT/database/backup_database.sql"

log "Backup written inside container at ${BACKUP_FILE}"
log "On the host, this is under $INSTALL_BACKUPS_DIR (bind-mounted — see compose/docker-compose.yml)"

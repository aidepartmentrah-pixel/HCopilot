#!/usr/bin/env bash
# backup_database.sh — full HCopilotDB backup to ./backups/ (host-side,
# survives container recreation).
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RELEASE_DIR/compose"
[ -f .env ] && { set -a; source .env; set +a; }

: "${DATABASE_NAME:?DATABASE_NAME is required (set in compose/.env)}"
: "${MSSQL_SA_PASSWORD:?MSSQL_SA_PASSWORD is required (set in compose/.env)}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="/var/opt/mssql/backup/${DATABASE_NAME}_${TIMESTAMP}.bak"

# -i takes a path resolved INSIDE the container, and database/*.sql is not
# mounted there — pipe the host-side .sql file through stdin instead (sqlcmd
# reads from stdin when no -i/-Q is given).
docker compose exec -T sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C \
  -v DB_NAME="$DATABASE_NAME" -v BACKUP_PATH="$BACKUP_FILE" \
  < ../database/backup_database.sql

echo "==> Backup written inside container at ${BACKUP_FILE}"
echo "==> On the host, this is under release/compose/backups/ (bind-mounted — see compose/docker-compose.yml)"

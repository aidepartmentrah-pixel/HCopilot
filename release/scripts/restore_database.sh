#!/usr/bin/env bash
# restore_database.sh — restores HCopilotDB from a .bak file.
# Usage: ./restore_database.sh /path/on/host/to/backup.bak
# WARNING: overwrites the current database. Stops the backend first.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <path-to-backup-on-host>" >&2
  exit 1
fi

HOST_BACKUP_PATH="$1"
RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RELEASE_DIR/compose"
[ -f .env ] && { set -a; source .env; set +a; }

: "${DATABASE_NAME:?DATABASE_NAME is required (set in compose/.env)}"
: "${MSSQL_SA_PASSWORD:?MSSQL_SA_PASSWORD is required (set in compose/.env)}"

if [ ! -f "$HOST_BACKUP_PATH" ]; then
  echo "ERROR: $HOST_BACKUP_PATH not found on host." >&2
  exit 1
fi

# release/compose/backups/ on the host is bind-mounted to /var/opt/mssql/backup inside the
# sqlserver container (see compose/docker-compose.yml) — translate the path.
BACKUP_FILENAME="$(basename "$HOST_BACKUP_PATH")"
CONTAINER_BACKUP_PATH="/var/opt/mssql/backup/${BACKUP_FILENAME}"

echo "==> This will REPLACE the current ${DATABASE_NAME} database. Stopping backend first..."
docker compose stop backend

# -i takes a path resolved INSIDE the container, and database/*.sql is not
# mounted there — pipe the host-side .sql file through stdin instead.
docker compose exec -T sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C \
  -v DB_NAME="$DATABASE_NAME" -v BACKUP_PATH="$CONTAINER_BACKUP_PATH" \
  < ../database/restore_database.sql

echo "==> Restore complete. Restarting backend..."
docker compose start backend
echo "==> Done. Run scripts/verify_installation.sh to confirm."

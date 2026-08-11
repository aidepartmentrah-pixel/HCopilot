#!/usr/bin/env bash
# verify_installation.sh — post-install/post-update health check, run
# against the persistent install directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

require_existing_install
compose_cd

echo "==> Container status:"
docker compose ps
echo

FAIL=0

echo "==> Checking database is reachable and has data..."
if docker compose exec -T sqlserver /opt/mssql-tools18/bin/sqlcmd \
     -S localhost -d "${DATABASE_NAME:-HCopilotDB}" -U sa -P "${MSSQL_SA_PASSWORD:?MSSQL_SA_PASSWORD not set}" -C \
     -Q "SELECT COUNT(*) AS DoctorCount FROM Doctors; SELECT COUNT(*) AS BedCount FROM EDbeds;"; then
  echo "==> Database checks OK."
else
  echo "==> DATABASE CHECKS FAILED." >&2
  FAIL=1
fi
echo

echo "==> Checking backend health..."
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${BACKEND_PORT:-8090}/health" | grep -q "200"; then
  echo "==> Backend is reachable and healthy."
else
  echo "==> BACKEND HEALTH CHECK FAILED." >&2
  FAIL=1
fi

echo "==> Checking frontend is reachable..."
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${FRONTEND_PORT:-8082}/" | grep -q "200"; then
  echo "==> Frontend is reachable."
else
  echo "==> FRONTEND CHECK FAILED." >&2
  FAIL=1
fi

echo "==> Checking frontend can reach the backend through its own proxy..."
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${FRONTEND_PORT:-8082}/api/beds/list" | grep -q "200"; then
  echo "==> Frontend -> backend proxy path OK."
else
  echo "==> FRONTEND PROXY CHECK FAILED." >&2
  FAIL=1
fi

echo "==> Checking install directory independence markers..."
[ -f "$INSTALL_ENV_FILE" ] && echo "==> Persistent .env present at $INSTALL_ENV_FILE." || { echo "==> Persistent .env MISSING." >&2; FAIL=1; }
[ -f "$INSTALL_VERSION_FILE" ] && echo "==> Installed version recorded: $(cat "$INSTALL_VERSION_FILE")." || echo "==> (No INSTALLED_VERSION file yet — expected during a first-time install run.)"

if [ "$FAIL" -eq 0 ]; then
  echo "==> Installation verified — application is healthy."
else
  echo "==> One or more checks failed — see documentation/TROUBLESHOOTING.md." >&2
  exit 1
fi

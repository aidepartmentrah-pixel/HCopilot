#!/usr/bin/env bash
# install_offline.sh — first-time installation entry point for the offline
# Debian Docker host. Local files only — never touches the internet.
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> HCopilot offline installation"
echo

if [ ! -f "$RELEASE_DIR/compose/.env" ]; then
  echo "ERROR: compose/.env not found." >&2
  echo "Copy compose/.env.offline.template to compose/.env and fill in real values, then re-run this script." >&2
  exit 1
fi

# Fail fast with a clear message instead of a confusing container-orchestration
# error 10+ minutes later. Without this check, a forgotten placeholder
# password causes SQL Server's own healthcheck to fail with an opaque
# "Login failed for user 'sa'" and Compose reports "dependency failed to
# start: container ... is unhealthy" — giving no hint the real cause was the
# password (confirmed against a real failed install during Stage 3 testing).
if grep -q "REPLACE_WITH_STRONG_PASSWORD" "$RELEASE_DIR/compose/.env"; then
  echo "ERROR: compose/.env still contains the placeholder password." >&2
  echo "Edit compose/.env and replace REPLACE_WITH_STRONG_PASSWORD with a real, strong password (both MSSQL_SA_PASSWORD and DATABASE_PASSWORD) before running this script." >&2
  exit 1
fi

# SQL Server itself requires 8+ characters and at least 3 of: uppercase,
# lowercase, digit, symbol. Checking this here — rather than letting SQL
# Server discover it — avoids the exact same confusing failure mode for any
# real-but-weak password an operator might choose.
_check_password_complexity() {
  local var_name="$1" pw="$2" classes=0
  [ ${#pw} -ge 8 ] || { echo "ERROR: $var_name must be at least 8 characters." >&2; return 1; }
  [[ "$pw" =~ [A-Z] ]] && classes=$((classes + 1))
  [[ "$pw" =~ [a-z] ]] && classes=$((classes + 1))
  [[ "$pw" =~ [0-9] ]] && classes=$((classes + 1))
  [[ "$pw" =~ [^a-zA-Z0-9] ]] && classes=$((classes + 1))
  if [ "$classes" -lt 3 ]; then
    echo "ERROR: $var_name does not meet SQL Server's password complexity policy." >&2
    echo "Needs at least 3 of: uppercase letter, lowercase letter, digit, symbol." >&2
    return 1
  fi
}

set -a; source "$RELEASE_DIR/compose/.env"; set +a
_check_password_complexity "MSSQL_SA_PASSWORD" "${MSSQL_SA_PASSWORD:-}" || exit 1
_check_password_complexity "DATABASE_PASSWORD" "${DATABASE_PASSWORD:-}" || exit 1

echo "==> Step 1/3: Loading Docker images from release/docker-images/..."
"$RELEASE_DIR/scripts/load_images.sh"
echo

echo "==> Step 2/3: Starting the stack (this installs the database and transports"
echo "    the hospital's lookup/configuration data and ML training history on first run)..."
"$RELEASE_DIR/scripts/start_stack.sh"

echo "==> Waiting for containers to settle (30s)..."
sleep 30
echo

echo "==> Step 3/3: Verifying installation..."
"$RELEASE_DIR/scripts/verify_installation.sh"

echo
echo "==> Installation complete."
echo "==> Open http://<this-server-IP>:<FRONTEND_PORT>/ in a browser (default port 8082)."
echo "==> Log in with admin / admin and change the password immediately — see documentation/VALIDATION_CHECKLIST.md."

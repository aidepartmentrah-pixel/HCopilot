#!/usr/bin/env bash
# provision_dbeaver.sh — best-effort registration of the HCopilot SQL Server
# connection in the operator's local DBeaver CE install (see RAH Application
# Release & Deployment Standard §5.8/§8.6).
#
# KNOWN LIMITATION (documented rather than silently claimed to work): DBeaver
# stores saved passwords in an encrypted per-workspace credentials store.
# Reproducing that encryption without a live, verified DBeaver install to
# test against would risk writing something DBeaver can't read — so this
# script only ever ADDS the connection (host/port/db/user), never touches an
# existing entry, and leaves "save password" off. The operator enters the
# password once from $INSTALL_ENV_FILE; DBeaver remembers it after that for
# the session per its own normal behavior.
#
# If DBeaver's workspace can't be found (not installed, different version,
# different path), this script exits non-zero and the caller (install/update)
# treats that as a non-fatal warning — the connection info is printed either
# way so the operator can add it by hand in under a minute.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

require_existing_install
[ -f "$INSTALL_ENV_FILE" ] && { set -a; source "$INSTALL_ENV_FILE"; set +a; }

CONN_NAME="HCopilot (${APP_SLUG})"
CONN_HOST="localhost"
CONN_PORT="${DATABASE_PORT:-1433}"
CONN_DB="${DATABASE_NAME:-HCopilotDB}"
CONN_USER="${DATABASE_USER:-sa}"

print_manual_info() {
  cat <<EOF
==> DBeaver connection info (add manually: Database -> New Database Connection -> SQL Server):
      Name:     ${CONN_NAME}
      Host:     ${CONN_HOST}
      Port:     ${CONN_PORT}
      Database: ${CONN_DB}
      User:     ${CONN_USER}
      Password: see ${INSTALL_ENV_FILE} (DATABASE_PASSWORD)
      Trust server certificate: yes
EOF
}

# Known DBeaver CE workspace layout as of DBeaver 26.x (see RAH-OIP Lab
# Environment Reference §4 — DBeaver CE 26.1.2). Checked in order; first
# match wins.
CANDIDATE_DIRS=(
  "$HOME/.local/share/DBeaverData/workspace6/General/.dbeaver"
  "$HOME/.local/share/DBeaverData/workspace6/.dbeaver"
)

DBEAVER_DIR=""
for d in "${CANDIDATE_DIRS[@]}"; do
  if [ -d "$d" ]; then DBEAVER_DIR="$d"; break; fi
done

if [ -z "$DBEAVER_DIR" ]; then
  warn "DBeaver workspace not found under \$HOME/.local/share/DBeaverData — is DBeaver installed for this user?"
  print_manual_info
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  warn "python3 not available on this host — cannot safely edit DBeaver's data-sources.json (hand-rolled JSON editing risks corrupting it)."
  print_manual_info
  exit 1
fi

DS_FILE="$DBEAVER_DIR/data-sources.json"
CRED_FILE="$DBEAVER_DIR/credentials-config.json"

python3 "$SCRIPT_DIR/_dbeaver_register.py" \
  --data-sources-file "$DS_FILE" \
  --name "$CONN_NAME" \
  --host "$CONN_HOST" \
  --port "$CONN_PORT" \
  --database "$CONN_DB" \
  --user "$CONN_USER" \
&& log "DBeaver connection '${CONN_NAME}' registered (or already present) in $DS_FILE." \
&& print_manual_info \
|| { warn "Automatic DBeaver registration failed — see message above."; print_manual_info; exit 1; }

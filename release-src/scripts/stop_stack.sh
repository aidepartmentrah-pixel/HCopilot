#!/usr/bin/env bash
# stop_stack.sh — stops the stack without removing volumes (data preserved).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

require_existing_install
compose_cd

docker compose down
log "Stack stopped. The hcopilot_sqlserver_data volume was NOT removed."

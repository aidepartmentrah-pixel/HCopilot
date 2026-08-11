#!/usr/bin/env bash
# start_stack.sh — starts the full stack via Docker Compose, against the
# persistent install directory (not this release folder).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

require_existing_install
compose_cd

docker compose up -d
log "Stack starting. Run scripts/verify_installation.sh once containers report healthy."

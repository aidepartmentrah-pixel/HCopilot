#!/usr/bin/env bash
# stop_stack.sh — stops the stack without removing volumes (data preserved).
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RELEASE_DIR/compose"

docker compose down
echo "==> Stack stopped. The hcopilot_sqlserver_data volume was NOT removed."

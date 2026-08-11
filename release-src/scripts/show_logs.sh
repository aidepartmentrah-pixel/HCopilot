#!/usr/bin/env bash
# show_logs.sh — tails logs for all services, or one service if named.
# Usage: ./show_logs.sh [sqlserver|db-init|backend|frontend]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

require_existing_install
compose_cd

if [ "$#" -ge 1 ]; then
  docker compose logs -f --tail=200 "$1"
else
  docker compose logs -f --tail=200
fi

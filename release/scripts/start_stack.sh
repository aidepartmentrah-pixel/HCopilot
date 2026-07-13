#!/usr/bin/env bash
# start_stack.sh — starts the full stack via Docker Compose.
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RELEASE_DIR/compose"

if [ ! -f .env ]; then
  echo "ERROR: compose/.env not found. Copy .env.offline.template to .env and fill in real values first." >&2
  exit 1
fi

docker compose up -d
echo "==> Stack starting. Run scripts/verify_installation.sh once containers report healthy."

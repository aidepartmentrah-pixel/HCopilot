#!/usr/bin/env bash
# update_offline.sh — updates an existing installation to a new release.
# Preserves the database (named volume untouched).
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> HCopilot offline update"
echo
echo "==> Before continuing, have you backed up the database? (scripts/backup_database.sh)"
read -r -p "    Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted. Run scripts/backup_database.sh first."
  exit 1
fi

echo "==> Step 1/3: Loading new Docker images..."
"$RELEASE_DIR/scripts/load_images.sh"
echo

echo "==> Step 2/3: New Alembic migrations (if any) run automatically via db-init"
echo "    when the stack restarts below — existing data is preserved, never recreated."
echo "    Check this release's RELEASE_NOTES.md for anything requiring manual attention."
read -r -p "    Press Enter once you've reviewed RELEASE_NOTES.md: "
echo

echo "==> Step 3/3: Restarting the stack with the new images..."
cd "$RELEASE_DIR/compose"
docker compose up -d

echo "==> Waiting for containers to settle (20s)..."
sleep 20
"$RELEASE_DIR/scripts/verify_installation.sh"

echo "==> Update complete."

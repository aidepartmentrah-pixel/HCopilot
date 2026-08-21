#!/usr/bin/env bash
# update_offline.sh — updates the existing persistent installation
# ($INSTALL_ROOT) to this release's version. Designed to be run from a
# SEPARATE, freshly-transferred release folder — it never assumes anything
# was manually carried over from the previous release folder. Preserves
# .env, generated credentials, backups, and the database (named volume
# untouched, migrations only).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

chmod +x "$RELEASE_DIR"/scripts/*.sh 2>/dev/null || true

echo "==> HCopilot offline update (release $RELEASE_VERSION)"
echo "==> Install target: $INSTALL_ROOT"
echo

require_existing_install

PREVIOUS_VERSION="unknown"
[ -f "$INSTALL_VERSION_FILE" ] && PREVIOUS_VERSION="$(cat "$INSTALL_VERSION_FILE")"
log "Currently installed: $PREVIOUS_VERSION  ->  Updating to: $RELEASE_VERSION"
if [ "$PREVIOUS_VERSION" = "$RELEASE_VERSION" ]; then
  warn "The installed version already matches this release ($RELEASE_VERSION). Continuing will still reload images and restart the stack."
fi
echo

log "Step 1/8: Backing up the database before making any changes (using the currently-installed backup tooling)..."
"$INSTALL_ROOT/scripts/backup_database.sh"
echo

log "Step 2/8: Applying this release's Compose definition..."
cp "$RELEASE_DIR/compose/docker-compose.yml" "$INSTALL_COMPOSE_DIR/docker-compose.yml"

log "Step 3/8: Reconciling persistent configuration (existing values are never overwritten)..."
# Only ADD keys that are new in this release's template and missing from the
# existing persistent .env — never touch a key that already has a value.
# Per §3.3/§6.3: production .env is deployment-owned state, not something a
# new release template gets to replace.
ADDED=0
while IFS='=' read -r key value; do
  case "$key" in ''|'#'*) continue ;; esac
  if ! grep -q "^${key}=" "$INSTALL_ENV_FILE" 2>/dev/null; then
    if [ "$value" = "__GENERATE_ME__" ]; then
      value="$(generate_password)"
    fi
    echo "${key}=${value}" >> "$INSTALL_ENV_FILE"
    log "  Added new required variable: $key"
    ADDED=1
  fi
done < "$RELEASE_DIR/configuration/.env.offline.template"
[ "$ADDED" -eq 0 ] && log "  No new configuration variables introduced by this release."
echo

log "Step 4/8: Refreshing persistent operational scripts and database resources..."
cp "$RELEASE_DIR"/database/*.sql "$INSTALL_ROOT/database/"
cp "$RELEASE_DIR"/scripts/_common.sh \
   "$RELEASE_DIR"/scripts/start_stack.sh \
   "$RELEASE_DIR"/scripts/stop_stack.sh \
   "$RELEASE_DIR"/scripts/show_logs.sh \
   "$RELEASE_DIR"/scripts/backup_database.sh \
   "$RELEASE_DIR"/scripts/restore_database.sh \
   "$RELEASE_DIR"/scripts/verify_installation.sh \
   "$RELEASE_DIR"/scripts/provision_dbeaver.sh \
   "$RELEASE_DIR"/scripts/_dbeaver_register.py \
   "$INSTALL_ROOT/scripts/"
chmod +x "$INSTALL_ROOT"/scripts/*.sh 2>/dev/null || true

compose_cd
BACKEND_PORT="${BACKEND_PORT:-8090}"
FRONTEND_PORT="${FRONTEND_PORT:-8082}"
DATABASE_PORT="${DATABASE_PORT:-1433}"
log "Current ports — backend:${BACKEND_PORT} frontend:${FRONTEND_PORT} database:${DATABASE_PORT}"

# Non-fatal: warn if a port is bound by something outside this app's own
# Compose project. A normal update always finds its own stack already
# holding these ports — that's expected, not a conflict — so only a port
# held by a container OUTSIDE this project (or a non-Docker process) is
# reported.
_warn_port_conflicts() {
  local our_containers port name
  our_containers="$(docker compose ps -q 2>/dev/null || true)"
  for pair in "backend:$BACKEND_PORT" "frontend:$FRONTEND_PORT" "database:$DATABASE_PORT"; do
    name="${pair%%:*}"; port="${pair##*:}"
    if (echo > "/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1; then
      local holder
      holder="$(docker ps -q --filter "publish=$port" 2>/dev/null | head -n1 || true)"
      if [ -n "$holder" ] && ! grep -q "$holder" <<< "$our_containers"; then
        warn "port $port ($name) is held by a container outside this app's own stack."
      elif [ -z "$holder" ]; then
        warn "port $port ($name) is in use by a non-Docker process."
      fi
    fi
  done
}
_warn_port_conflicts

log "Step 5/8: Loading new Docker images..."
"$RELEASE_DIR/scripts/load_images.sh"
echo

log "Step 6/8: Restarting the stack with the new images (Alembic migrations run"
echo "    automatically via db-init — existing data is preserved, never recreated)."
echo "    Check $RELEASE_DIR/documentation/RELEASE_NOTES.md for anything requiring manual attention."
docker compose up -d --force-recreate

log "Waiting for containers to settle (20s)..."
sleep 20

log "Step 7/8: Verifying updated deployment..."
"$INSTALL_ROOT/scripts/verify_installation.sh"

log "Step 8/8: Reconciling operator database access and recording history..."
"$INSTALL_ROOT/scripts/provision_dbeaver.sh" || warn "DBeaver connection provisioning failed or was skipped — see the printed connection info above, or documentation/INSTALL_OFFLINE.md."

echo "$RELEASE_VERSION" > "$INSTALL_VERSION_FILE"
echo "$(date -Iseconds)  update  ${PREVIOUS_VERSION} -> ${RELEASE_VERSION}  success" >> "$INSTALL_ROOT/DEPLOYMENT_HISTORY.log"

echo
echo "=================================================================="
echo " Update complete ($PREVIOUS_VERSION -> $RELEASE_VERSION). Existing data was preserved."
echo
echo " Open:      http://<this-server-IP>:${FRONTEND_PORT}"
echo " This release folder ($RELEASE_DIR) can now be archived/removed."
echo "=================================================================="

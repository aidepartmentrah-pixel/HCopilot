#!/usr/bin/env bash
# install_offline.sh — first-time installation entry point for the offline
# Debian Docker host. Local files only — never touches the internet.
#
# Establishes the ONE persistent install directory at $INSTALL_ROOT
# (default /opt/rah/apps/hcopilot/), separate from this release folder, and
# copies the day-2 operational scripts (start/stop/logs/backup/restore/
# verify/DBeaver) there too — so after install, this release folder is not
# needed for routine operation and can be archived. See
# documentation/INSTALL_OFFLINE.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

chmod +x "$RELEASE_DIR"/scripts/*.sh 2>/dev/null || true

echo "==> HCopilot offline installation (release $RELEASE_VERSION)"
echo "==> Install target: $INSTALL_ROOT"
echo

if [ -f "$INSTALL_ENV_FILE" ]; then
  die "An installation already exists at $INSTALL_ROOT. Use scripts/update_offline.sh instead — install_offline.sh never runs against an existing deployment."
fi

log "Step 1/7: Creating persistent install directory..."
mkdir -p "$INSTALL_COMPOSE_DIR" "$INSTALL_BACKUPS_DIR" "$INSTALL_ROOT/database" "$INSTALL_ROOT/scripts"

log "Step 2/7: Installing this release's Compose definition and generating persistent configuration..."
cp "$RELEASE_DIR/compose/docker-compose.yml" "$INSTALL_COMPOSE_DIR/docker-compose.yml"

GENERATED_PASSWORD="$(generate_password)"
sed -e "s/__GENERATE_ME__/${GENERATED_PASSWORD}/g" \
    "$RELEASE_DIR/compose/.env.offline.template" > "$INSTALL_ENV_FILE"
chmod 600 "$INSTALL_ENV_FILE"
log "Generated a new database password and wrote it to $INSTALL_ENV_FILE (mode 600)."

log "Step 3/7: Installing persistent operational scripts and database resources into $INSTALL_ROOT..."
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

log "Step 4/7: Loading Docker images from $RELEASE_DIR/docker-images/..."
"$RELEASE_DIR/scripts/load_images.sh"
echo

log "Step 5/7: Starting the stack (this installs the database and transports"
echo "    the hospital's lookup/configuration data and ML training history on first run)..."
"$INSTALL_ROOT/scripts/start_stack.sh"

log "Waiting for containers to settle (30s)..."
sleep 30
echo

log "Step 6/7: Verifying installation..."
"$INSTALL_ROOT/scripts/verify_installation.sh"

echo "$RELEASE_VERSION" > "$INSTALL_VERSION_FILE"
echo "$(date -Iseconds)  install  ${RELEASE_VERSION}  success" >> "$INSTALL_ROOT/DEPLOYMENT_HISTORY.log"

log "Step 7/7: Registering the database connection in DBeaver..."
"$INSTALL_ROOT/scripts/provision_dbeaver.sh" || warn "DBeaver connection provisioning failed or was skipped — see the printed connection info above, or documentation/INSTALL_OFFLINE.md."

echo
echo "=================================================================="
echo " Installation complete."
echo
echo " Installed at:  $INSTALL_ROOT"
echo " Day-2 operations (start/stop/logs/backup/restore/verify) now live at:"
echo "   $INSTALL_ROOT/scripts/"
echo " Open:  http://<this-server-IP>:<FRONTEND_PORT>/ (default port 8082)"
echo " Log in with admin / admin and change the password immediately."
echo " Database password was generated and saved to:"
echo "   $INSTALL_ENV_FILE"
echo " This release folder ($RELEASE_DIR) can now be archived/removed —"
echo " the running deployment does not depend on it."
echo "=================================================================="

#!/usr/bin/env bash
# _common.sh — shared context sourced by every lifecycle script. Resolves
# the release folder (wherever this copy happens to be run from) and the
# ONE persistent install directory (independent of release version/folder
# name) so install/update/backup/logs/etc. all agree on the same paths.
#
# Per RAH Application Release & Deployment Standard §3.1: canonical live
# deployment root is /opt/rah/apps/<app-slug>/. Override with
# HCOPILOT_INSTALL_ROOT only for engineering/validation testing — never in
# a real hospital install.
set -euo pipefail

APP_SLUG="hcopilot"
INSTALL_ROOT="${HCOPILOT_INSTALL_ROOT:-/opt/rah/apps/${APP_SLUG}}"
INSTALL_COMPOSE_DIR="${INSTALL_ROOT}/compose"
INSTALL_BACKUPS_DIR="${INSTALL_ROOT}/backups"
INSTALL_ENV_FILE="${INSTALL_COMPOSE_DIR}/.env"
INSTALL_VERSION_FILE="${INSTALL_ROOT}/INSTALLED_VERSION"

# The release folder this script was launched from — disposable staging
# material, never the app's operational identity (§2.2, §2.4). Scripts must
# resolve this from their own location, not assume a fixed absolute path,
# so the same release works from a DVD mount, /tmp, or anywhere else.
RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_VERSION="$(basename "$RELEASE_DIR")"

log()  { echo "==> $*"; }
warn() { echo "WARNING: $*" >&2; }
die()  { echo "ERROR: $*" >&2; exit 1; }

# Generates a password safe for: .env / shell / YAML / SQL Server connection
# strings / ODBC connection strings. Alphanumerics only, deliberately
# excludes quotes, backticks, $, ;, spaces, and other characters known to
# break one of those contexts — see RAH Application Release & Deployment
# Standard §5.5 (no universal character-policy, just avoid known breakage).
generate_password() {
  # /dev/urandom -> strip to alnum -> 24 chars. SQL Server also requires at
  # least one upper, one lower, one digit; a 24-char random alnum string
  # satisfies that with overwhelming probability, so no retry loop is
  # implemented here.
  #
  # `|| true` is required, not decorative: head -c 24 closes its input the
  # instant it has read 24 bytes, so tr gets SIGPIPE on its next write
  # (exit 141) essentially every time. Under this script's `set -o
  # pipefail`, that 141 becomes the exit status of the whole pipeline, and
  # under `set -e` that kills the caller immediately — confirmed to
  # reproduce on every single run, not intermittently. `|| true` on the
  # pipeline (not on `head` alone) absorbs exactly that expected SIGPIPE
  # without masking a genuine failure of `tr`/`head` reading real errors,
  # since command substitution still captures stdout regardless of the
  # pipeline's exit code.
  tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c 24 || true
}

require_existing_install() {
  [ -f "$INSTALL_ENV_FILE" ] || die \
    "No existing installation found at $INSTALL_ROOT (missing $INSTALL_ENV_FILE). Run install_offline.sh from a release first."
}

compose_cd() {
  cd "$INSTALL_COMPOSE_DIR" || die "Install directory not found: $INSTALL_COMPOSE_DIR"
  [ -f .env ] && { set -a; source .env; set +a; }
}

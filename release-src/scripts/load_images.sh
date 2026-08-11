#!/usr/bin/env bash
# load_images.sh — loads every pre-built image tar from THIS release into
# the local Docker Engine. No internet/Docker Hub access required. This is
# inherently a release-time operation (the tars only exist in the release
# folder), unlike the other lifecycle scripts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

IMAGES_DIR="$RELEASE_DIR/docker-images"

if ! ls "$IMAGES_DIR"/*.tar >/dev/null 2>&1; then
  die "no .tar files found in $IMAGES_DIR"
fi

for tarfile in "$IMAGES_DIR"/*.tar; do
  log "Loading $(basename "$tarfile")..."
  docker load -i "$tarfile"
done

log "All images loaded."
docker images | grep -E "hcopilot|mssql/server" || true

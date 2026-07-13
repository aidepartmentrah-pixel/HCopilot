#!/usr/bin/env bash
# load_images.sh — loads every pre-built image tar into the local Docker
# Engine. No internet/Docker Hub access required.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
IMAGES_DIR="$RELEASE_DIR/docker-images"

if ! ls "$IMAGES_DIR"/*.tar >/dev/null 2>&1; then
  echo "ERROR: no .tar files found in $IMAGES_DIR" >&2
  exit 1
fi

for tarfile in "$IMAGES_DIR"/*.tar; do
  echo "==> Loading $(basename "$tarfile")..."
  docker load -i "$tarfile"
done

echo "==> All images loaded."
docker images | grep -E "hcopilot|mssql/server" || true

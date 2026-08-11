#!/usr/bin/env bash
# build_release.sh — assembles release/<version>/ from this release-src/
# template plus freshly built Docker images. This is the ONLY place a
# versioned release folder should be produced from — never hand-copy
# release/<old-version>/ to create the next one, or release-src/ and the
# release folders will drift apart again.
#
# Usage: release-src/build_release.sh <version>
# Example: release-src/build_release.sh 1.0.2
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <version>  (e.g. $0 1.0.2)" >&2
  exit 1
fi
VERSION="$1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$REPO_ROOT/release/$VERSION"

if [ -d "$OUT_DIR" ]; then
  echo "ERROR: $OUT_DIR already exists. Published releases are immutable — use a new version number." >&2
  exit 1
fi

echo "==> Building HCopilot release $VERSION into $OUT_DIR"

mkdir -p "$OUT_DIR"/{compose,database,documentation,scripts,docker-images,checksums}

echo "==> Copying release template (compose/database/documentation/scripts) from release-src/..."
sed "s/__APP_VERSION__/${VERSION}/g" "$SCRIPT_DIR/compose/docker-compose.yml" > "$OUT_DIR/compose/docker-compose.yml"
cp "$SCRIPT_DIR/compose/.env.offline.template" "$OUT_DIR/compose/.env.offline.template"
cp -r "$SCRIPT_DIR"/database/. "$OUT_DIR/database/"
cp -r "$SCRIPT_DIR"/documentation/. "$OUT_DIR/documentation/"
cp "$SCRIPT_DIR"/scripts/*.sh "$SCRIPT_DIR"/scripts/*.py "$OUT_DIR/scripts/" 2>/dev/null || true
chmod +x "$OUT_DIR"/scripts/*.sh

echo "==> Building application images..."
docker build -t "hcopilot-backend:${VERSION}" -f "$REPO_ROOT/backend/Dockerfile" "$REPO_ROOT/backend"
docker build -t "hcopilot-frontend:${VERSION}" -f "$REPO_ROOT/frontend/Dockerfile" "$REPO_ROOT/frontend"

echo "==> Exporting images to $OUT_DIR/docker-images/..."
docker save -o "$OUT_DIR/docker-images/backend.tar" "hcopilot-backend:${VERSION}"
docker save -o "$OUT_DIR/docker-images/frontend.tar" "hcopilot-frontend:${VERSION}"
if docker image inspect mcr.microsoft.com/mssql/server:2022-latest >/dev/null 2>&1; then
  docker save -o "$OUT_DIR/docker-images/sqlserver.tar" mcr.microsoft.com/mssql/server:2022-latest
else
  echo "WARNING: mcr.microsoft.com/mssql/server:2022-latest not present locally — skipped sqlserver.tar. Pull it once (docker pull mcr.microsoft.com/mssql/server:2022-latest) and re-run if this release needs to include it." >&2
fi

echo "==> Generating checksums..."
( cd "$OUT_DIR" && find . -type f ! -path './checksums/*' -exec sha256sum {} \; > checksums/release_hashes.txt )

echo
echo "=================================================================="
echo " Release $VERSION built at $OUT_DIR"
echo " (release/ is gitignored — this folder is not tracked; archive it"
echo " separately per the RAH Release Archive policy before transfer.)"
echo "=================================================================="

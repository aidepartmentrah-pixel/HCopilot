# Update Offline — HCopilot

For updating an existing HCopilot installation to a newer release. This
preserves all production data — the database is never recreated.

## Before you start

1. **Back up the database** — see `BACKUP_RESTORE.md`. Do not skip this.
2. Read this release's `RELEASE_NOTES.md` for anything version-specific
   (new environment variables, manual steps, known issues).

## Steps

```bash
cd release
./scripts/update_offline.sh
```

This script:
1. Prompts you to confirm you've backed up the database.
2. Loads the new Docker images (`load_images.sh`).
3. Reminds you to check `RELEASE_NOTES.md` for anything requiring manual
   attention before continuing.
4. Restarts the stack with the new images (`docker compose up -d`).
5. Runs `verify_installation.sh` automatically.

New Alembic migrations (schema changes) run automatically via `db-init`
when the stack restarts — existing data is preserved, not recreated. If a
release ever needs a manual data step beyond this, it will be called out
explicitly in that release's `RELEASE_NOTES.md`.

## If the update fails

Stop and restore from the backup taken in step 1 — see
`BACKUP_RESTORE.md` → "Restoring a backup". Then see `TROUBLESHOOTING.md`
before attempting the update again.

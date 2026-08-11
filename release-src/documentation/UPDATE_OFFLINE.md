# Update Offline — HCopilot

For updating an existing HCopilot installation (`/opt/rah/apps/hcopilot/`)
to a newer release. This preserves all production data, the persistent
`.env`/credentials, and DBeaver registration — nothing needs to be manually
carried over from the previous release folder.

## Before you start

- Transfer the new release to the offline server as its **own separate
  folder**, next to (not inside/over) the previous one — e.g.
  `release/1.0.1/` and `release/1.0.2/` side by side, or on separate
  DVD/USB media. `update_offline.sh` finds the existing installation at
  `/opt/rah/apps/hcopilot/` on its own; it does not need the old release
  folder to still be present.
- Read this release's `RELEASE_NOTES.md` for anything version-specific
  (new environment variables, manual steps, known issues).

## Steps

```bash
cd release/<new-version>
./scripts/update_offline.sh
```

This single command:
1. Backs up the database automatically (using the currently-installed
   backup tooling) — you do not need to run this yourself first.
2. Applies this release's Compose definition to the persistent install.
3. Reconciles `.env`: adds any new variables this release introduces,
   never touches a value that's already set.
4. Refreshes the persistent day-2 scripts (`/opt/rah/apps/hcopilot/scripts/`)
   and database SQL resources to this release's versions.
5. Loads the new Docker images (`load_images.sh`).
6. Restarts the stack with the new images
   (`docker compose up -d --force-recreate`) — new Alembic migrations
   (schema changes) run automatically via `db-init`; existing data is
   preserved, never recreated.
7. Runs `verify_installation.sh` automatically.
8. Re-registers/repairs the DBeaver connection and appends this update to
   `/opt/rah/apps/hcopilot/DEPLOYMENT_HISTORY.log`.

If a release ever needs a manual data step beyond this, it will be called
out explicitly in that release's `RELEASE_NOTES.md`.

## If the update fails

The pre-update backup from step 1 is under
`/opt/rah/apps/hcopilot/backups/` — restore from it, see
`BACKUP_RESTORE.md` → "Restoring a backup". Then see `TROUBLESHOOTING.md`
before attempting the update again.

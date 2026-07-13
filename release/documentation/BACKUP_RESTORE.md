# Backup & Restore — HCopilot

## Taking a backup

```bash
cd release
./scripts/backup_database.sh
```

This runs a full `BACKUP DATABASE` inside the `sqlserver` container and
writes a timestamped `.bak` file. The file lands inside the container at
`/var/opt/mssql/backup/`, which is bind-mounted to `release/compose/backups/`
on the host — **the backup survives even if the container or its data
volume is deleted**, because it lives on the host filesystem, not inside
the container.

Expected output ends with something like:
```
BACKUP DATABASE successfully processed 11914 pages in 0.9 seconds (106.9 MB/sec).
==> Backup written inside container at /var/opt/mssql/backup/HCopilotDB_20260709_092027.bak
==> On the host, this is under release/compose/backups/
```

Copy the `.bak` file off the server to separate media/storage regularly —
a bind mount on the same disk protects against container/volume mistakes,
not against the whole server failing.

**Note on SQL Server edition**: the backup does not use compression. The
SQL Server container runs the free Express edition, and backup compression
is an Enterprise/Standard-only feature — Express rejects it outright. This
means `.bak` files are larger than a compressed backup would be, but this
is expected and correct for this deployment.

## Restoring a backup

**Warning: this replaces the current database entirely.** Only do this if
you mean to discard everything since the backup was taken.

```bash
cd release
./scripts/restore_database.sh release/compose/backups/HCopilotDB_20260709_092027.bak
```

This script:
1. Stops the `backend` container (so nothing writes to the database mid-restore).
2. Runs `RESTORE DATABASE ... WITH REPLACE` inside the `sqlserver` container.
3. Restarts the `backend` container.

Expected output ends with:
```
RESTORE DATABASE successfully processed 11914 pages in 0.6 seconds (161.9 MB/sec).
==> Restore complete. Restarting backend...
==> Done. Run scripts/verify_installation.sh to confirm.
```

Run `./scripts/verify_installation.sh` afterward to confirm the application
is healthy and the restored data is reachable.

## Backup schedule recommendation

At minimum: before every update (`update_offline.sh` prompts for this
automatically), and on a regular schedule appropriate to how often patient
data changes (daily is reasonable for an active ED).

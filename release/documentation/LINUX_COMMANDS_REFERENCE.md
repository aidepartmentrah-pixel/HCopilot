# Linux Commands Reference — HCopilot

Every command an operator needs for day-to-day operation of this stack, in
one place. Run these from inside `release/compose/` unless noted.

| What | Command |
|---|---|
| See what's running | `docker compose ps` |
| Start everything | `../scripts/start_stack.sh` (or `docker compose up -d`) |
| Stop everything | `../scripts/stop_stack.sh` (or `docker compose down`) |
| View logs, all services | `../scripts/show_logs.sh` (or `docker compose logs -f`) |
| View logs, one service | `docker compose logs -f backend` |
| Restart one service | `docker compose restart backend` |
| Check container health | `docker compose ps` — look at the `STATUS` column for `(healthy)` |
| Back up the database | `../scripts/backup_database.sh` |
| Restore the database | `../scripts/restore_database.sh <path-to-.bak>` |
| Verify everything | `../scripts/verify_installation.sh` |
| Free disk space check | `df -h` |
| Docker disk usage | `docker system df` |
| See loaded images | `docker images` |
| See volumes | `docker volume ls` |

## Reading logs for a specific problem

```bash
# Did the database install and data transport correctly?
docker compose logs db-init

# Is the backend connecting to the database?
docker compose logs backend | grep -i "database\|sql"

# Is nginx correctly proxying to the backend?
docker compose logs frontend
```

## Querying the database directly (for spot-checks)

```bash
docker compose exec sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "<sa password from .env>" -C -d HCopilotDB \
  -Q "SELECT COUNT(*) FROM Doctors; SELECT COUNT(*) FROM EDbeds;"
```

## Copying a file off the server (for backups, etc.)

Per hospital security policy, only the approved DVD/USB transfer procedure
should move data off the offline server — do not improvise network copy
methods (`scp`/`rsync` to an outside host) without IT approval.

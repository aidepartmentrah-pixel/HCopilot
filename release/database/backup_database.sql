/*
  backup_database.sql
  Full backup of HCopilotDB to a .bak file. Run via sqlcmd with scripting
  variables so server/database/path stay configurable:

    sqlcmd -S localhost -U sa -P $(MSSQL_SA_PASSWORD) -C \
           -v DB_NAME="$(DATABASE_NAME)" -v BACKUP_PATH="/var/opt/mssql/backup/HCopilotDB_$(date +%Y%m%d_%H%M%S).bak" \
           -i backup_database.sql

  Runs as "sa", not the application's DATABASE_USER — BACKUP DATABASE needs
  db_backupoperator or higher.

  BACKUP_PATH lands inside the sqlserver container's /var/opt/mssql/backup,
  which docker-compose.yml bind-mounts to ./backups on the host — the file
  survives container/volume recreation.
*/

:setvar DB_NAME "HCopilotDB"
:setvar BACKUP_PATH "/var/opt/mssql/backup/HCopilotDB.bak"

-- No COMPRESSION: the docker-compose.yml sqlserver service runs MSSQL_PID=Express,
-- and backup compression is an Enterprise/Standard-only feature — Express
-- rejects it with "BACKUP DATABASE WITH COMPRESSION is not supported on
-- Express Edition" (confirmed against a real Express container during
-- Stage 3 testing). If a future deployment upgrades to Standard/Enterprise,
-- COMPRESSION can be added back to shrink the .bak file.
BACKUP DATABASE [$(DB_NAME)]
TO DISK = N'$(BACKUP_PATH)'
WITH FORMAT, INIT, NAME = N'$(DB_NAME)-Full', SKIP, NOREWIND, NOUNLOAD, STATS = 10;
GO

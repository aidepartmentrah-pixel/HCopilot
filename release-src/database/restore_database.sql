/*
  restore_database.sql
  Restores HCopilotDB from a .bak file produced by backup_database.sql.
  WITH REPLACE — this overwrites whatever database currently exists at
  DB_NAME. Confirm you actually want to replace the current database before
  running this (see documentation/BACKUP_RESTORE.md).

    sqlcmd -S localhost -U sa -P $(MSSQL_SA_PASSWORD) -C \
           -v DB_NAME="$(DATABASE_NAME)" -v BACKUP_PATH="/var/opt/mssql/backup/HCopilotDB.bak" \
           -i restore_database.sql

  Runs as "sa" — RESTORE DATABASE requires sysadmin/dbcreator-level rights
  regardless of db_owner status on the target database.

  If the logical file names in the .bak differ from a fresh install, first run:
    RESTORE FILELISTONLY FROM DISK = N'$(BACKUP_PATH)';
  and adjust with MOVE clauses as needed.
*/

-- No default :setvar here on purpose -- see backup_database.sql's own
-- comment: sqlcmd's :setvar unconditionally overrides a value already
-- passed via -v, so a hardcoded default here would silently discard the
-- caller's real BACKUP_PATH. DB_NAME/BACKUP_PATH must always be supplied
-- via -v by the caller (see the header comment above).

ALTER DATABASE [$(DB_NAME)] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
GO

RESTORE DATABASE [$(DB_NAME)]
FROM DISK = N'$(BACKUP_PATH)'
WITH REPLACE, RECOVERY, STATS = 10;
GO

ALTER DATABASE [$(DB_NAME)] SET MULTI_USER;
GO

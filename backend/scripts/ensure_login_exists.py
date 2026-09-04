# =============================================================================
# scripts/ensure_login_exists.py — First-installation dedicated SQL login
# =============================================================================
#
# HCopilot used to run entirely as SQL Server's built-in `sa` login — a real
# gap (every app in the fleet sharing the same all-powerful admin account
# instead of one scoped to its own database) closed by the Consistent
# Database Identity work. This creates HCopilot's own dedicated login
# (DATABASE_USER, e.g. "hcopilot_user") the first time the database exists
# but the login doesn't yet, scoped to db_owner on HCopilot's own database
# only — no server-level rights, no CREATE DATABASE, matching the shape
# already used for PFMS's real production login (HCAT_Insight).
#
# Must run as `sa` (the only login that can CREATE LOGIN) — after
# ensure_database_exists.py (the target database must already exist) and
# before alembic/anything else that needs to connect as the new login.
#
# Run from backend/:  .venv\Scripts\python.exe scripts\ensure_login_exists.py
# =============================================================================

import os
import sys

import pyodbc
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

_DRIVER = os.getenv("DATABASE_DRIVER", "ODBC Driver 18 for SQL Server")
_SERVER = os.getenv("DATABASE_SERVER", "localhost")
_PORT = os.getenv("DATABASE_PORT", "1433")
_DATABASE = os.getenv("DATABASE_NAME", "HCopilotDB")
_TRUST_CERT = os.getenv("DATABASE_TRUST_SERVER_CERTIFICATE", "yes")

# Deliberately not DATABASE_USER/DATABASE_PASSWORD: those name the new,
# dedicated login this script is about to create, which doesn't exist yet.
# Only `sa` can CREATE LOGIN — a SQL Server server-level operation.
_SA_PASSWORD = os.getenv("MSSQL_SA_PASSWORD", "")
_NEW_LOGIN = os.getenv("DATABASE_USER", "")
_NEW_LOGIN_PASSWORD = os.getenv("DATABASE_PASSWORD", "")


def _connection_string(database: str) -> str:
    return (
        f"DRIVER={{{_DRIVER}}};"
        f"SERVER={_SERVER},{_PORT};"
        f"DATABASE={database};"
        f"UID=sa;PWD={_SA_PASSWORD};"
        f"TrustServerCertificate={_TRUST_CERT};"
    )


def main():
    if not _NEW_LOGIN or not _NEW_LOGIN_PASSWORD:
        raise SystemExit("DATABASE_USER and DATABASE_PASSWORD must both be set — cannot create a login with no name/password.")

    master_conn = pyodbc.connect(_connection_string("master"), timeout=30, autocommit=True)
    try:
        cur = master_conn.cursor()
        cur.execute("SELECT name FROM sys.server_principals WHERE name = ?", _NEW_LOGIN)
        if cur.fetchone() is None:
            print(f"Creating SQL Server login '{_NEW_LOGIN}'...")
            # CHECK_POLICY = OFF: a service login never interactively
            # changes its password, so Windows password-expiration policy
            # would eventually lock this account out for no real reason —
            # same real fleet precedent as Voice Project's own
            # 001_create_database.sql. The password itself is still a real,
            # Platform-generated secret meeting SQL Server's complexity
            # requirements at creation time (see installation.py's own
            # _generate_secret_value).
            # Real, live-found bug: CREATE LOGIN's WITH PASSWORD clause does
            # not accept a parameterized value at all -- SQL Server rejects
            # a `?`/sp_executesql placeholder here with "Incorrect syntax
            # near '@P1'" (102), unlike an ordinary DML statement. The
            # password must be a literal in the SQL text; single quotes are
            # doubled (T-SQL's own literal-escaping convention) rather than
            # trusted as injection-safe just because this password is
            # always alphanumeric today.
            escaped_password = _NEW_LOGIN_PASSWORD.replace("'", "''")
            cur.execute(f"CREATE LOGIN [{_NEW_LOGIN}] WITH PASSWORD = '{escaped_password}', CHECK_POLICY = OFF")
            print(f"Login '{_NEW_LOGIN}' created.")
        else:
            print(f"Login '{_NEW_LOGIN}' already exists, skipping.")
    finally:
        master_conn.close()

    db_conn = pyodbc.connect(_connection_string(_DATABASE), timeout=30, autocommit=True)
    try:
        cur = db_conn.cursor()
        cur.execute("SELECT name FROM sys.database_principals WHERE name = ?", _NEW_LOGIN)
        if cur.fetchone() is None:
            print(f"Creating database user '{_NEW_LOGIN}' in '{_DATABASE}', granting db_owner...")
            cur.execute(f"CREATE USER [{_NEW_LOGIN}] FOR LOGIN [{_NEW_LOGIN}]")
            # db_owner, not a narrower role: this same login runs Alembic's
            # DDL migrations (db-init) as well as the backend's own runtime
            # CRUD — see docs/decisions/database-identity-convention.md.
            cur.execute(f"ALTER ROLE db_owner ADD MEMBER [{_NEW_LOGIN}]")
            print(f"User '{_NEW_LOGIN}' created and granted db_owner on '{_DATABASE}'.")
        else:
            print(f"Database user '{_NEW_LOGIN}' already exists in '{_DATABASE}', skipping.")
    finally:
        db_conn.close()


if __name__ == "__main__":
    main()

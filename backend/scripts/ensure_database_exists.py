# =============================================================================
# scripts/ensure_database_exists.py — First-installation database bootstrap
# =============================================================================
#
# Alembic can create every table, but it can't create the database itself —
# SQL Server requires CREATE DATABASE to run before anything can connect to
# it. This connects to the server's `master` database (always present) and
# creates the target database if it doesn't exist yet, so a brand new SQL
# Server container (no prior HCopilotDB) can be bootstrapped automatically by
# db-init before `alembic upgrade head` runs.
#
# Run from backend/:  .venv\Scripts\python.exe scripts\ensure_database_exists.py
# =============================================================================

import os
import sys
import urllib.parse

import pyodbc
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

_DRIVER   = os.getenv("DATABASE_DRIVER", "ODBC Driver 18 for SQL Server")
_SERVER   = os.getenv("DATABASE_SERVER", "localhost")
_PORT     = os.getenv("DATABASE_PORT", "1433")
_DATABASE = os.getenv("DATABASE_NAME", "HCopilotDB")
_USER     = os.getenv("DATABASE_USER", "sa")
_PASSWORD = os.getenv("DATABASE_PASSWORD", "")
_TRUST_CERT = os.getenv("DATABASE_TRUST_SERVER_CERTIFICATE", "yes")

_master_connection_string = (
    f"DRIVER={{{_DRIVER}}};"
    f"SERVER={_SERVER},{_PORT};"
    f"DATABASE=master;"
    f"UID={_USER};PWD={_PASSWORD};"
    f"TrustServerCertificate={_TRUST_CERT};"
)


def main():
    conn = pyodbc.connect(_master_connection_string, timeout=30, autocommit=True)
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sys.databases WHERE name = ?", _DATABASE)
        if cur.fetchone() is not None:
            print(f"Database '{_DATABASE}' already exists, skipping.")
            return
        print(f"Creating database '{_DATABASE}'...")
        cur.execute(f"CREATE DATABASE [{_DATABASE}]")
        print(f"Database '{_DATABASE}' created.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

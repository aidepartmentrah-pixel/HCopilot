# =============================================================================
# db/session.py — SQL Server engine and session factory
# =============================================================================
#
# All connection details come from environment variables (see .env.example),
# never hardcoded, per RAH Lab's Docker/environment-variable policy.
#
# Manager classes stay zero-arg constructible: each public method opens its
# own `with SessionLocal() as session:` block, mirroring the previous
# "open CSV, mutate, write CSV" per-call pattern so no router changes are
# needed for the CSV -> SQL Server migration.
# =============================================================================

import os
import urllib.parse
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

_DRIVER   = os.getenv("DATABASE_DRIVER", "ODBC Driver 18 for SQL Server")
_SERVER   = os.getenv("DATABASE_SERVER", "localhost")
_PORT     = os.getenv("DATABASE_PORT", "1433")
_DATABASE = os.getenv("DATABASE_NAME", "HCopilotDB")
_USER     = os.getenv("DATABASE_USER", "sa")
_PASSWORD = os.getenv("DATABASE_PASSWORD", "")
_TRUST_CERT = os.getenv("DATABASE_TRUST_SERVER_CERTIFICATE", "yes")

_odbc_connection_string = (
    f"DRIVER={{{_DRIVER}}};"
    f"SERVER={_SERVER},{_PORT};"
    f"DATABASE={_DATABASE};"
    f"UID={_USER};PWD={_PASSWORD};"
    f"TrustServerCertificate={_TRUST_CERT};"
)

_SQLALCHEMY_URL = "mssql+pyodbc:///?odbc_connect=" + urllib.parse.quote_plus(_odbc_connection_string)

engine = create_engine(_SQLALCHEMY_URL, fast_executemany=True, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

Base = declarative_base()

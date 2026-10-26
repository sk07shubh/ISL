"""Persistent storage for live-test results; SQLite locally, PostgreSQL in production."""
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "backend" / "data"
DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
USE_POSTGRES = bool(DATABASE_URL)

if os.environ.get("VERCEL") and not USE_POSTGRES:
    raise RuntimeError(
        "DATABASE_URL is required on Vercel so live-test records are stored persistently. "
        "Connect a PostgreSQL database and set DATABASE_URL."
    )

DEFAULT_DB = DATA / "isl.db"
DB_PATH = Path(os.environ.get("ISL_DB", DEFAULT_DB))
MODEL_DIR = ROOT / "model"

SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS live_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tester TEXT NOT NULL, created_at TEXT NOT NULL, note TEXT,
  lighting TEXT, distance TEXT, signer_type TEXT
);
CREATE TABLE IF NOT EXISTS live_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL REFERENCES live_tests(id) ON DELETE CASCADE,
  target TEXT NOT NULL, predicted TEXT, confidence REAL, margin REAL, top_label TEXT, top_conf REAL,
  elapsed_ms INTEGER, hand_size REAL, brightness REAL
);
"""

POSTGRES_SCHEMA = """
CREATE TABLE IF NOT EXISTS live_tests (
  id BIGSERIAL PRIMARY KEY, tester TEXT NOT NULL, created_at TEXT NOT NULL, note TEXT,
  lighting TEXT, distance TEXT, signer_type TEXT
);
CREATE TABLE IF NOT EXISTS live_attempts (
  id BIGSERIAL PRIMARY KEY, test_id BIGINT NOT NULL REFERENCES live_tests(id) ON DELETE CASCADE,
  target TEXT NOT NULL, predicted TEXT, confidence DOUBLE PRECISION, margin DOUBLE PRECISION,
  top_label TEXT, top_conf DOUBLE PRECISION, elapsed_ms INTEGER, hand_size DOUBLE PRECISION,
  brightness DOUBLE PRECISION
);
"""

def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class _Connection:
    """Small adapter so existing SQL can use SQLite-style ? placeholders on either DB."""
    def __init__(self, connection, postgres: bool):
        self._connection = connection
        self._postgres = postgres

    def _sql(self, sql: str) -> str:
        return sql.replace("?", "%s") if self._postgres else sql

    def execute(self, sql, params=()):
        return self._connection.execute(self._sql(sql), params)

    def executemany(self, sql, params):
        return self._connection.executemany(self._sql(sql), params)

    def executescript(self, sql):
        for statement in sql.split(";"):
            if statement.strip():
                self.execute(statement)

    def commit(self):
        self._connection.commit()

    def close(self):
        self._connection.close()


@contextmanager
def db():
    if USE_POSTGRES:
        import psycopg
        from psycopg.rows import dict_row

        raw = psycopg.connect(DATABASE_URL, row_factory=dict_row, connect_timeout=10)
        con = _Connection(raw, postgres=True)
    else:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        raw = sqlite3.connect(DB_PATH, timeout=30)
        raw.row_factory = sqlite3.Row
        raw.execute("PRAGMA foreign_keys = ON")
        con = _Connection(raw, postgres=False)
    try:
        yield con
        con.commit()
    finally:
        con.close()


def _migrate(con):
    if USE_POSTGRES:
        migrations = {
            "live_tests": {"signer_type": "TEXT", "lighting": "TEXT", "distance": "TEXT"},
            "live_attempts": {
                "top_label": "TEXT", "top_conf": "DOUBLE PRECISION", "elapsed_ms": "INTEGER",
                "hand_size": "DOUBLE PRECISION", "brightness": "DOUBLE PRECISION",
            },
        }
        for table, cols in migrations.items():
            rows = con.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND table_name = ?",
                (table,),
            ).fetchall()
            have = {row["column_name"] for row in rows}
            for name, decl in cols.items():
                if name not in have:
                    con.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
    else:
        migrations = {
            "live_tests": {"signer_type": "TEXT", "lighting": "TEXT", "distance": "TEXT"},
            "live_attempts": {
                "top_label": "TEXT", "top_conf": "REAL", "elapsed_ms": "INTEGER",
                "hand_size": "REAL", "brightness": "REAL",
            },
        }
        for table, cols in migrations.items():
            have = {row[1] for row in con.execute(f"PRAGMA table_info({table})")}
            for name, decl in cols.items():
                if name not in have:
                    con.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")


def init_db():
    with db() as con:
        con.executescript(POSTGRES_SCHEMA if USE_POSTGRES else SQLITE_SCHEMA)
        _migrate(con)

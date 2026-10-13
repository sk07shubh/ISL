"""SQLite for live-test results only (no training data, no video, no names)."""
import sqlite3, os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "backend" / "data"
DB_PATH = Path(os.environ.get("ISL_DB", DATA / "isl.db"))
MODEL_DIR = ROOT / "model"

SCHEMA = """
CREATE TABLE IF NOT EXISTS live_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tester TEXT NOT NULL, created_at TEXT NOT NULL, note TEXT);
CREATE TABLE IF NOT EXISTS live_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL REFERENCES live_tests(id) ON DELETE CASCADE,
  target TEXT NOT NULL, predicted TEXT, confidence REAL, margin REAL);
"""

def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

@contextmanager
def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        yield con
        con.commit()
    finally:
        con.close()

# columns added after the first release; existing databases are upgraded in place
NEW_TEST_COLS = {"signer_type": "TEXT", "lighting": "TEXT", "distance": "TEXT"}   # signer_type is unused (kept so old databases still open)
NEW_ATTEMPT_COLS = {"top_label": "TEXT", "top_conf": "REAL", "elapsed_ms": "INTEGER", "hand_size": "REAL", "brightness": "REAL"}


def _migrate(con):
    for table, cols in (("live_tests", NEW_TEST_COLS), ("live_attempts", NEW_ATTEMPT_COLS)):
        have = {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
        for name, decl in cols.items():
            if name not in have:
                con.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")


def init_db():
    with db() as con:
        con.executescript(SCHEMA)
        _migrate(con)

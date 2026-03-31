"""SQLite persistence layer for the Disruption Monitor.

Tables:
    scan_records   — log of every scan run (mode, source, timestamp, item count)
    events         — canonical event registry (lifecycle: active → watching → archived)
    event_snapshots — full event payload per scan (immutable history)
    tickets        — user-created action items linked to events
    event_edits    — audit trail for user overrides of AI-generated fields

S3 Persistence:
    When DB_S3_BUCKET is set (AWS Lambda), the SQLite DB is synced to/from S3:
    - On cold start: download DB from S3 to /tmp/ (if it exists)
    - After every write: upload DB back to S3
    This gives cross-invocation persistence without needing DynamoDB or EFS.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import settings

logger = logging.getLogger(__name__)

DB_PATH = Path(settings.db_path) if hasattr(settings, "db_path") else Path("disruption_monitor.db")

# ── S3 Persistence Layer ────────────────────────────────────────
_s3_client = None
_s3_initialized = False


def _get_s3_client():
    """Lazy-init boto3 S3 client."""
    global _s3_client
    if _s3_client is None:
        import boto3
        _s3_client = boto3.client("s3", region_name=settings.aws_region)
    return _s3_client


def _s3_download_db() -> bool:
    """Download DB from S3 to local path. Returns True if downloaded."""
    global _s3_initialized
    if _s3_initialized or not settings.has_s3_persistence:
        return False

    _s3_initialized = True
    try:
        from botocore.exceptions import ClientError
        client = _get_s3_client()
        # Check if object exists first (avoids download_file's opaque errors)
        try:
            client.head_object(Bucket=settings.db_s3_bucket, Key=settings.db_s3_key)
        except ClientError as e:
            if e.response["Error"]["Code"] in ("404", "NoSuchKey"):
                print(f"[SC Hub] No existing DB in S3 (s3://{settings.db_s3_bucket}/{settings.db_s3_key}) — will create fresh")
                return False
            raise
        client.download_file(settings.db_s3_bucket, settings.db_s3_key, str(DB_PATH))
        size_kb = DB_PATH.stat().st_size // 1024
        print(f"[SC Hub] Downloaded DB from S3 ({size_kb}KB) — s3://{settings.db_s3_bucket}/{settings.db_s3_key}")
        return True
    except Exception as exc:
        print(f"[SC Hub] S3 DB download failed: {exc} — starting fresh")
        return False


def _s3_upload_db() -> None:
    """Upload DB to S3 after writes.

    Checkpoints the WAL first so all data is in the main DB file.
    """
    if not settings.has_s3_persistence:
        return
    try:
        # Checkpoint WAL into the main DB file before uploading
        ckpt = sqlite3.connect(str(DB_PATH))
        ckpt.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        ckpt.close()

        client = _get_s3_client()
        client.upload_file(str(DB_PATH), settings.db_s3_bucket, settings.db_s3_key)
    except Exception as exc:
        print(f"[SC Hub] S3 DB upload failed: {exc}")


# Download on module load (Lambda cold start)
_s3_download_db()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS scan_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id     TEXT NOT NULL,
    mode        TEXT NOT NULL CHECK (mode IN ('disruptions', 'geopolitical', 'trade')),
    source      TEXT NOT NULL DEFAULT 'sample',
    status      TEXT NOT NULL DEFAULT 'completed',
    item_count  INTEGER NOT NULL DEFAULT 0,
    started_at  TEXT NOT NULL,
    completed_at TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
    id              TEXT PRIMARY KEY,
    mode            TEXT NOT NULL CHECK (mode IN ('disruptions', 'geopolitical', 'trade')),
    event_title     TEXT NOT NULL,
    severity        TEXT NOT NULL,
    region          TEXT,
    lat             REAL,
    lng             REAL,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'watching', 'archived')),
    first_seen      TEXT NOT NULL,
    last_seen       TEXT NOT NULL,
    scan_count      INTEGER NOT NULL DEFAULT 1,
    payload         TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    TEXT NOT NULL REFERENCES events(id),
    scan_id     TEXT NOT NULL,
    payload     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    TEXT NOT NULL REFERENCES events(id),
    owner       TEXT,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'blocked', 'done')),
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_edits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL REFERENCES events(id),
    field           TEXT NOT NULL,
    original_value  TEXT NOT NULL,
    edited_value    TEXT NOT NULL,
    edited_by       TEXT NOT NULL DEFAULT 'jh',
    edited_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_mode ON events(mode);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
CREATE INDEX IF NOT EXISTS idx_scan_records_mode ON scan_records(mode);
CREATE INDEX IF NOT EXISTS idx_event_snapshots_event ON event_snapshots(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
"""


def _init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA)


@contextmanager
def get_db():
    """Yield a sqlite3 connection with row_factory set to Row.

    After a successful commit, syncs DB to S3 if changes were made
    (detected via SQLite's total_changes counter).
    """
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        _init_db(conn)
        changes_before = conn.total_changes
        yield conn
        conn.commit()
        # Sync to S3 only if rows were actually modified
        if conn.total_changes > changes_before:
            _s3_upload_db()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── Scan records ───────────────────────────────────────────────


def save_scan_record(
    scan_id: str,
    mode: str,
    source: str,
    item_count: int,
    started_at: str,
    completed_at: str | None = None,
    status: str = "completed",
) -> None:
    with get_db() as conn:
        conn.execute(
            """INSERT INTO scan_records (scan_id, mode, source, status, item_count, started_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (scan_id, mode, source, status, item_count, started_at, completed_at),
        )


def get_latest_scan(mode: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM scan_records WHERE mode = ? ORDER BY id DESC LIMIT 1",
            (mode,),
        ).fetchone()
        return dict(row) if row else None


def get_scan_history(mode: str | None = None, limit: int = 50) -> list[dict]:
    with get_db() as conn:
        if mode:
            rows = conn.execute(
                "SELECT * FROM scan_records WHERE mode = ? ORDER BY id DESC LIMIT ?",
                (mode, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM scan_records ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]


# ── Events ─────────────────────────────────────────────────────


def _extract_title(payload: dict, mode: str) -> str:
    """Extract the display title from an event payload."""
    if mode == "geopolitical":
        return payload.get("risk", payload.get("event", "Unknown"))
    return payload.get("event", payload.get("risk", "Unknown"))


def _extract_severity(payload: dict, mode: str) -> str:
    if mode == "geopolitical":
        return payload.get("risk_level", "Medium")
    return payload.get("severity", "Medium")


def upsert_event(event_id: str, mode: str, payload: dict, scan_id: str) -> bool:
    """Insert or update an event. Returns True if new, False if updated."""
    now = datetime.now(timezone.utc).isoformat()
    title = _extract_title(payload, mode)
    severity = _extract_severity(payload, mode)
    region = payload.get("region", "")
    lat = payload.get("lat", 0.0)
    lng = payload.get("lng", 0.0)
    payload_json = json.dumps(payload, default=str)

    with get_db() as conn:
        existing = conn.execute("SELECT id, scan_count FROM events WHERE id = ?", (event_id,)).fetchone()

        if existing:
            conn.execute(
                """UPDATE events
                   SET event_title = ?, severity = ?, region = ?, lat = ?, lng = ?,
                       last_seen = ?, scan_count = scan_count + 1,
                       payload = ?, updated_at = ?
                   WHERE id = ?""",
                (title, severity, region, lat, lng, now, payload_json, now, event_id),
            )
            # Save snapshot
            conn.execute(
                "INSERT INTO event_snapshots (event_id, scan_id, payload) VALUES (?, ?, ?)",
                (event_id, scan_id, payload_json),
            )
            return False
        else:
            conn.execute(
                """INSERT INTO events (id, mode, event_title, severity, region, lat, lng,
                                       status, first_seen, last_seen, scan_count, payload)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 1, ?)""",
                (event_id, mode, title, severity, region, lat, lng, now, now, payload_json),
            )
            conn.execute(
                "INSERT INTO event_snapshots (event_id, scan_id, payload) VALUES (?, ?, ?)",
                (event_id, scan_id, payload_json),
            )
            return True


def get_events(
    mode: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """Get events with their full payload."""
    with get_db() as conn:
        conditions = []
        params: list[Any] = []
        if mode:
            conditions.append("mode = ?")
            params.append(mode)
        if status:
            conditions.append("status = ?")
            params.append(status)

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params.append(limit)

        rows = conn.execute(
            f"SELECT * FROM events {where} ORDER BY updated_at DESC LIMIT ?",
            params,
        ).fetchall()

        results = []
        for row in rows:
            event = json.loads(row["payload"])
            # Overlay lifecycle fields from DB (source of truth)
            event["status"] = row["status"]
            event["first_seen"] = row["first_seen"]
            event["last_seen"] = row["last_seen"]
            event["scan_count"] = row["scan_count"]
            results.append(event)
        return results


def get_event(event_id: str) -> dict | None:
    """Get a single event by ID."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        if not row:
            return None
        event = json.loads(row["payload"])
        event["status"] = row["status"]
        event["first_seen"] = row["first_seen"]
        event["last_seen"] = row["last_seen"]
        event["scan_count"] = row["scan_count"]
        return event


def update_event_status(event_id: str, status: str) -> bool:
    """Update event lifecycle status. Returns True if event existed."""
    with get_db() as conn:
        cursor = conn.execute(
            "UPDATE events SET status = ?, updated_at = ? WHERE id = ?",
            (status, datetime.now(timezone.utc).isoformat(), event_id),
        )
        return cursor.rowcount > 0


def get_events_for_mode(mode: str) -> list[dict]:
    """Get all active/watching events for a mode (used to build scan results)."""
    return get_events(mode=mode, status=None)


# ── Tickets ────────────────────────────────────────────────────


def create_ticket(event_id: str, owner: str | None = None, notes: str | None = None) -> int:
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO tickets (event_id, owner, notes) VALUES (?, ?, ?)",
            (event_id, owner, notes),
        )
        return cursor.lastrowid


def update_ticket(ticket_id: int, owner: str | None = None, status: str | None = None, notes: str | None = None) -> bool:
    updates = []
    params: list[Any] = []
    if owner is not None:
        updates.append("owner = ?")
        params.append(owner)
    if status is not None:
        updates.append("status = ?")
        params.append(status)
    if notes is not None:
        updates.append("notes = ?")
        params.append(notes)
    if not updates:
        return False
    updates.append("updated_at = ?")
    params.append(datetime.now(timezone.utc).isoformat())
    params.append(ticket_id)

    with get_db() as conn:
        cursor = conn.execute(
            f"UPDATE tickets SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        return cursor.rowcount > 0


def get_tickets(event_id: str | None = None) -> list[dict]:
    with get_db() as conn:
        if event_id:
            rows = conn.execute("SELECT * FROM tickets WHERE event_id = ? ORDER BY created_at DESC", (event_id,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM tickets ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]


# ── Event edits (audit trail) ─────────────────────────────────


def save_event_edit(event_id: str, field: str, original_value: str, edited_value: str, edited_by: str = "jh") -> None:
    with get_db() as conn:
        conn.execute(
            "INSERT INTO event_edits (event_id, field, original_value, edited_value, edited_by) VALUES (?, ?, ?, ?, ?)",
            (event_id, field, original_value, edited_value, edited_by),
        )


def get_event_edits(event_id: str) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM event_edits WHERE event_id = ? ORDER BY edited_at DESC",
            (event_id,),
        ).fetchall()
        return [dict(r) for r in rows]


# ── Timeline ──────────────────────────────────────────────────


def get_timeline_data(days: int = 30) -> list[dict]:
    """Return daily risk summary from event_snapshots for the last N days.

    Each entry: {date, event_count, critical_count, high_count, affected_sites_count}
    """
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
                DATE(es.created_at) as date,
                es.event_id,
                es.payload
            FROM event_snapshots es
            WHERE es.created_at >= datetime('now', ?)
            ORDER BY date ASC
            """,
            (f"-{days} days",),
        ).fetchall()

    # Group by date and count severities
    from collections import defaultdict
    daily: dict[str, dict] = defaultdict(lambda: {
        "event_count": 0,
        "critical_count": 0,
        "high_count": 0,
        "affected_sites_count": 0,
        "_seen_events": set(),
    })

    for row in rows:
        date_str = row["date"]
        raw_payload = row["payload"]
        if not raw_payload:
            continue
        payload = json.loads(raw_payload)
        event_id = payload.get("id", "")
        day = daily[date_str]

        # Avoid double-counting same event on same day
        if event_id in day["_seen_events"]:
            continue
        day["_seen_events"].add(event_id)

        day["event_count"] += 1

        severity = (
            payload.get("severity")
            or payload.get("risk_level", "Medium")
        )
        if severity == "Critical":
            day["critical_count"] += 1
        elif severity == "High":
            day["high_count"] += 1

        affected = payload.get("affected_sites", [])
        if isinstance(affected, list):
            day["affected_sites_count"] += len(affected)

    # Build sorted output, dropping internal _seen_events
    result = []
    for date_str in sorted(daily.keys()):
        d = daily[date_str]
        result.append({
            "date": date_str,
            "event_count": d["event_count"],
            "critical_count": d["critical_count"],
            "high_count": d["high_count"],
            "affected_sites_count": d["affected_sites_count"],
        })

    return result


# ── Stats ──────────────────────────────────────────────────────


def get_db_stats() -> dict:
    """Get database statistics for the health endpoint."""
    with get_db() as conn:
        event_count = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        scan_count = conn.execute("SELECT COUNT(*) FROM scan_records").fetchone()[0]
        ticket_count = conn.execute("SELECT COUNT(*) FROM tickets").fetchone()[0]
        active_events = conn.execute("SELECT COUNT(*) FROM events WHERE status = 'active'").fetchone()[0]
        return {
            "events": event_count,
            "active_events": active_events,
            "scans": scan_count,
            "tickets": ticket_count,
        }

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
import time
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
                logger.info("No existing DB in S3 (s3://%s/%s) -- will create fresh", settings.db_s3_bucket, settings.db_s3_key)
                return False
            raise
        client.download_file(settings.db_s3_bucket, settings.db_s3_key, str(DB_PATH))
        size_kb = DB_PATH.stat().st_size // 1024
        logger.info("Downloaded DB from S3 (%dKB) -- s3://%s/%s", size_kb, settings.db_s3_bucket, settings.db_s3_key)
        return True
    except Exception as exc:
        logger.warning("S3 DB download failed: %s -- starting fresh", exc)
        return False


def _s3_upload_db() -> None:
    """Upload DB to S3 after writes.

    Checkpoints the WAL first so all data is in the main DB file.
    """
    if not settings.has_s3_persistence:
        return
    try:
        from ..services.metrics import emit_count, emit_metric

        t0 = time.monotonic()

        # Checkpoint WAL into the main DB file before uploading
        ckpt = sqlite3.connect(str(DB_PATH))
        ckpt.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        ckpt.close()

        client = _get_s3_client()
        client.upload_file(str(DB_PATH), settings.db_s3_bucket, settings.db_s3_key)

        elapsed_ms = (time.monotonic() - t0) * 1000
        emit_metric("s3.sync_upload_ms", round(elapsed_ms, 1), unit="Milliseconds")
    except Exception as exc:
        try:
            from ..services.metrics import emit_count
            emit_count("s3.sync_failure")
        except Exception:
            pass
        logger.error("S3 DB upload failed: %s", exc)


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
    due_date    TEXT,
    priority    TEXT CHECK (priority IS NULL OR priority IN ('critical', 'high', 'normal', 'low')),
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

CREATE TABLE IF NOT EXISTS supplier_relationships (
    site_id         TEXT NOT NULL,
    supplier_name   TEXT NOT NULL,
    supplier_country TEXT NOT NULL,
    business_area   TEXT,
    company_country TEXT,
    category_l1     TEXT,
    category_l2     TEXT,
    item_description TEXT,
    spend_sek       REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (site_id, supplier_name, category_l1)
);

CREATE INDEX IF NOT EXISTS idx_events_mode ON events(mode);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
CREATE INDEX IF NOT EXISTS idx_scan_records_mode ON scan_records(mode);
CREATE INDEX IF NOT EXISTS idx_event_snapshots_event ON event_snapshots(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
CREATE TABLE IF NOT EXISTS site_code_map (
    site_code       TEXT PRIMARY KEY,
    site_description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerted_events (
    event_id    TEXT PRIMARY KEY,
    alerted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_feedback (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    TEXT NOT NULL,
    outcome     TEXT NOT NULL CHECK (outcome IN ('true_positive', 'false_positive', 'missed')),
    actual_impact TEXT,
    feedback_by TEXT DEFAULT 'unknown',
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_feedback_event ON event_feedback(event_id);

CREATE INDEX IF NOT EXISTS idx_supplier_rel_site ON supplier_relationships(site_id);
CREATE INDEX IF NOT EXISTS idx_supplier_rel_country ON supplier_relationships(supplier_country);
CREATE INDEX IF NOT EXISTS idx_supplier_rel_supplier ON supplier_relationships(supplier_name);
"""


def _init_db() -> None:
    """Initialize the database schema once at module load time."""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        conn.executescript(_SCHEMA)
        # Migrate existing DBs: add due_date and priority columns to tickets if missing
        cols = {row[1] for row in conn.execute("PRAGMA table_info(tickets)").fetchall()}
        if "due_date" not in cols:
            conn.execute("ALTER TABLE tickets ADD COLUMN due_date TEXT")
        if "priority" not in cols:
            conn.execute("ALTER TABLE tickets ADD COLUMN priority TEXT")
        conn.commit()
    finally:
        conn.close()


# Initialize schema once at module load (after S3 download if applicable)
_init_db()


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


def create_ticket(
    event_id: str,
    owner: str | None = None,
    notes: str | None = None,
    due_date: str | None = None,
    priority: str | None = None,
) -> int:
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO tickets (event_id, owner, notes, due_date, priority) VALUES (?, ?, ?, ?, ?)",
            (event_id, owner, notes, due_date, priority),
        )
        return cursor.lastrowid


def update_ticket(
    ticket_id: int,
    owner: str | None = None,
    status: str | None = None,
    notes: str | None = None,
    due_date: str | None = None,
    priority: str | None = None,
) -> bool:
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
    if due_date is not None:
        updates.append("due_date = ?")
        params.append(due_date)
    if priority is not None:
        updates.append("priority = ?")
        params.append(priority)
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


def get_overdue_tickets() -> list[dict]:
    """Get all tickets that are past their due date and not done."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT * FROM tickets
               WHERE due_date IS NOT NULL
                 AND due_date < datetime('now')
                 AND status != 'done'
               ORDER BY due_date ASC""",
        ).fetchall()
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


# ── Supplier relationships ────────────────────────────────────


def get_site_suppliers(site_id: str) -> list[dict]:
    """Get all suppliers for a factory, with spend as percentage of site total.

    Never returns raw spend figures -- only percentages.
    """
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
                sr.supplier_name,
                sr.supplier_country,
                sr.category_l1,
                sr.category_l2,
                sr.spend_sek * 100.0 / NULLIF(site_total.total_spend, 0) AS spend_pct
            FROM supplier_relationships sr
            JOIN (
                SELECT site_id, SUM(spend_sek) AS total_spend
                FROM supplier_relationships
                WHERE site_id = ?
            ) site_total ON sr.site_id = site_total.site_id
            WHERE sr.site_id = ?
            ORDER BY sr.spend_sek DESC
            """,
            (site_id, site_id),
        ).fetchall()
        return [
            {
                "supplier_name": r["supplier_name"],
                "country": r["supplier_country"],
                "category_l1": r["category_l1"],
                "category_l2": r["category_l2"],
                "spend_pct": round(r["spend_pct"], 2) if r["spend_pct"] else 0.0,
            }
            for r in rows
        ]


def get_site_suppliers_by_country(site_id: str) -> list[dict]:
    """Get supplier spend aggregated by country for a site, as percentages."""
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
                sr.supplier_country,
                COUNT(DISTINCT sr.supplier_name) AS supplier_count,
                SUM(sr.spend_sek) * 100.0 / NULLIF(site_total.total_spend, 0) AS spend_pct,
                GROUP_CONCAT(DISTINCT sr.category_l2) AS categories
            FROM supplier_relationships sr
            JOIN (
                SELECT site_id, SUM(spend_sek) AS total_spend
                FROM supplier_relationships
                WHERE site_id = ?
            ) site_total ON sr.site_id = site_total.site_id
            WHERE sr.site_id = ?
            GROUP BY sr.supplier_country
            ORDER BY spend_pct DESC
            """,
            (site_id, site_id),
        ).fetchall()
        return [
            {
                "country": r["supplier_country"],
                "supplier_count": r["supplier_count"],
                "spend_pct": round(r["spend_pct"], 2) if r["spend_pct"] else 0.0,
                "categories": [c for c in (r["categories"] or "").split(",") if c],
            }
            for r in rows
        ]


def get_suppliers_by_country(country: str) -> list[dict]:
    """Get all supplier-site links for a supplier country, spend as pct of each site total."""
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
                sr.site_id,
                sr.supplier_name,
                sr.supplier_country,
                sr.category_l1,
                sr.category_l2,
                sr.spend_sek * 100.0 / NULLIF(site_total.total_spend, 0) AS spend_pct
            FROM supplier_relationships sr
            JOIN (
                SELECT site_id, SUM(spend_sek) AS total_spend
                FROM supplier_relationships
                GROUP BY site_id
            ) site_total ON sr.site_id = site_total.site_id
            WHERE sr.supplier_country = ?
            ORDER BY sr.site_id, sr.spend_sek DESC
            """,
            (country,),
        ).fetchall()
        return [
            {
                "site_id": r["site_id"],
                "supplier_name": r["supplier_name"],
                "country": r["supplier_country"],
                "category_l1": r["category_l1"],
                "category_l2": r["category_l2"],
                "spend_pct": round(r["spend_pct"], 2) if r["spend_pct"] else 0.0,
            }
            for r in rows
        ]


def get_supplier_concentration() -> list[dict]:
    """Get concentration risk scores per site using HHI by country spend.

    HHI = sum of squared market shares (0-10000). Higher = more concentrated.
    Returns normalized score 0-100 where 100 = single-country dependency.
    """
    with get_db() as conn:
        # Get spend share per country per site
        rows = conn.execute(
            """
            SELECT
                sr.site_id,
                sr.supplier_country,
                SUM(sr.spend_sek) * 100.0 / NULLIF(site_total.total_spend, 0) AS country_share_pct,
                COUNT(DISTINCT sr.supplier_name) AS supplier_count
            FROM supplier_relationships sr
            JOIN (
                SELECT site_id, SUM(spend_sek) AS total_spend
                FROM supplier_relationships
                GROUP BY site_id
            ) site_total ON sr.site_id = site_total.site_id
            GROUP BY sr.site_id, sr.supplier_country
            ORDER BY sr.site_id
            """,
        ).fetchall()

    # Compute HHI per site
    from collections import defaultdict
    site_data: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        site_data[r["site_id"]].append({
            "country": r["supplier_country"],
            "share_pct": r["country_share_pct"] or 0.0,
            "supplier_count": r["supplier_count"],
        })

    results = []
    for site_id, countries in site_data.items():
        # HHI = sum of (share%)^2, max = 10000 (single country at 100%)
        hhi = sum((c["share_pct"] ** 2) for c in countries)
        # Normalize to 0-100 score
        concentration_score = round(hhi / 100, 1)
        total_suppliers = sum(c["supplier_count"] for c in countries)
        top = max(countries, key=lambda c: c["share_pct"])
        results.append({
            "site_id": site_id,
            "concentration_score": min(concentration_score, 100.0),
            "hhi": round(hhi, 1),
            "total_suppliers": total_suppliers,
            "country_count": len(countries),
            "top_country": top["country"],
            "top_country_spend_pct": round(top["share_pct"], 1),
        })

    results.sort(key=lambda x: -x["concentration_score"])
    return results


def get_exposed_factories(region: str) -> list[dict]:
    """Cross-reference: which factories source from a region with active disruptions?

    Joins supplier_relationships with events table to find factories exposed
    to active disruptions via their supplier countries.
    """
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT
                sr.site_id,
                sr.supplier_country,
                COUNT(DISTINCT sr.supplier_name) AS supplier_count,
                SUM(sr.spend_sek) * 100.0 / NULLIF(site_total.total_spend, 0) AS exposed_spend_pct,
                e.id AS event_id,
                e.event_title,
                e.severity
            FROM supplier_relationships sr
            JOIN (
                SELECT site_id, SUM(spend_sek) AS total_spend
                FROM supplier_relationships
                GROUP BY site_id
            ) site_total ON sr.site_id = site_total.site_id
            JOIN events e ON (
                e.region LIKE '%' || sr.supplier_country || '%'
                OR sr.supplier_country LIKE '%' || e.region || '%'
            )
            WHERE e.status = 'active'
              AND sr.supplier_country LIKE '%' || ? || '%'
            GROUP BY sr.site_id, sr.supplier_country, e.id
            ORDER BY exposed_spend_pct DESC
            """,
            (region,),
        ).fetchall()
        return [
            {
                "site_id": r["site_id"],
                "supplier_country": r["supplier_country"],
                "supplier_count": r["supplier_count"],
                "exposed_spend_pct": round(r["exposed_spend_pct"], 2) if r["exposed_spend_pct"] else 0.0,
                "event_id": r["event_id"],
                "event_title": r["event_title"],
                "severity": r["severity"],
            }
            for r in rows
        ]


def get_supplier_country_spend_shares() -> list[dict]:
    """Get spend share per supplier country as percentage of total global spend.

    Returns list of {country, spend_pct, supplier_count, site_count} sorted by spend desc.
    Never returns raw spend — only percentages.
    """
    with get_db() as conn:
        rows = conn.execute("""
            SELECT
                sr.supplier_country,
                SUM(sr.spend_sek) * 100.0 / NULLIF(t.total, 0) AS spend_pct,
                COUNT(DISTINCT sr.supplier_name) AS supplier_count,
                COUNT(DISTINCT sr.site_id) AS site_count
            FROM supplier_relationships sr
            CROSS JOIN (SELECT SUM(spend_sek) AS total FROM supplier_relationships) t
            GROUP BY sr.supplier_country
            ORDER BY spend_pct DESC
        """).fetchall()
        return [
            {
                "country": r[0],
                "spend_pct": round(r[1] or 0, 2),
                "supplier_count": r[2],
                "site_count": r[3],
            }
            for r in rows
        ]


def get_supplier_relationship_stats() -> dict:
    """Get basic stats about loaded supplier relationships."""
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM supplier_relationships").fetchone()[0]
        suppliers = conn.execute("SELECT COUNT(DISTINCT supplier_name) FROM supplier_relationships").fetchone()[0]
        sites = conn.execute("SELECT COUNT(DISTINCT site_id) FROM supplier_relationships").fetchone()[0]
        countries = conn.execute("SELECT COUNT(DISTINCT supplier_country) FROM supplier_relationships").fetchone()[0]
        return {
            "total_relationships": total,
            "unique_suppliers": suppliers,
            "unique_sites": sites,
            "supplier_countries": countries,
        }


def resolve_site_code(display_name: str) -> str | None:
    """Resolve a frontend display name (e.g. 'Gothenburg') to an operational unit code (e.g. '109G').

    Tries exact match on site_code first, then fuzzy match on site_description.
    Returns the site_code if found, None otherwise.
    """
    with get_db() as conn:
        # Direct match (caller already has the code)
        row = conn.execute(
            "SELECT site_code FROM site_code_map WHERE site_code = ?", (display_name,)
        ).fetchone()
        if row:
            return row[0]

        # Case-insensitive partial match on description
        row = conn.execute(
            "SELECT site_code FROM site_code_map WHERE LOWER(site_description) LIKE ?",
            (f"%{display_name.lower()}%",),
        ).fetchone()
        if row:
            return row[0]

        # Try matching individual words (e.g. "Beijing - Nankou" -> "NANKOU")
        for word in display_name.split():
            if len(word) < 3:
                continue
            row = conn.execute(
                "SELECT site_code FROM site_code_map WHERE LOWER(site_description) LIKE ?",
                (f"%{word.lower()}%",),
            ).fetchone()
            if row:
                return row[0]

    return None


# ── Alerted events (Telegram dedup) ──────────────────────────


def is_event_alerted(event_id: str) -> bool:
    """Check if a Telegram alert has already been sent for this event."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT 1 FROM alerted_events WHERE event_id = ?", (event_id,)
        ).fetchone()
        return row is not None


def mark_event_alerted(event_id: str) -> None:
    """Record that a Telegram alert was sent for this event."""
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO alerted_events (event_id) VALUES (?)",
            (event_id,),
        )


def get_all_alerted_event_ids() -> set[str]:
    """Load all alerted event IDs from DB (used to prime the in-memory cache)."""
    with get_db() as conn:
        rows = conn.execute("SELECT event_id FROM alerted_events").fetchall()
        return {row["event_id"] for row in rows}


def clear_alerted_events() -> None:
    """Clear all alerted event records (for testing)."""
    with get_db() as conn:
        conn.execute("DELETE FROM alerted_events")


def get_alerted_event_count() -> int:
    """Return the number of alerted events in the DB."""
    with get_db() as conn:
        return conn.execute("SELECT COUNT(*) FROM alerted_events").fetchone()[0]


# ── Stats ──────────────────────────────────────────────────────


def save_event_feedback(
    event_id: str,
    outcome: str,
    actual_impact: str | None = None,
    feedback_by: str = "unknown",
) -> int:
    """Save user feedback on event accuracy. Returns the new feedback row ID."""
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO event_feedback (event_id, outcome, actual_impact, feedback_by) VALUES (?, ?, ?, ?)",
            (event_id, outcome, actual_impact, feedback_by),
        )
        return cursor.lastrowid


def get_event_feedback(event_id: str) -> list[dict]:
    """Get all feedback entries for a specific event."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM event_feedback WHERE event_id = ? ORDER BY created_at DESC",
            (event_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_feedback_stats() -> dict:
    """Get aggregate feedback stats: counts per outcome and precision percentage."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT outcome, COUNT(*) as cnt FROM event_feedback GROUP BY outcome",
        ).fetchall()
        counts = {r["outcome"]: r["cnt"] for r in rows}
        tp = counts.get("true_positive", 0)
        fp = counts.get("false_positive", 0)
        missed = counts.get("missed", 0)
        total = tp + fp + missed
        precision_pct = round((tp / (tp + fp)) * 100, 1) if (tp + fp) > 0 else None
        return {
            "total": total,
            "true_positive_count": tp,
            "false_positive_count": fp,
            "missed_count": missed,
            "precision_pct": precision_pct,
        }


def get_weekly_summary(days: int = 7) -> dict:
    """Build a Monday-morning weekly summary from the events and tickets tables.

    Returns severity snapshot, new/escalated/resolved events, overdue tickets,
    top regions, and week-over-week delta.
    """
    with get_db() as conn:
        cutoff = f"-{days} days"

        # ── New events: first_seen within the window ──
        new_rows = conn.execute(
            "SELECT * FROM events WHERE first_seen >= datetime('now', ?) ORDER BY first_seen DESC",
            (cutoff,),
        ).fetchall()

        # ── Resolved (archived) events: updated_at within the window & status=archived ──
        resolved_rows = conn.execute(
            "SELECT * FROM events WHERE status = 'archived' AND updated_at >= datetime('now', ?) ORDER BY updated_at DESC",
            (cutoff,),
        ).fetchall()

        # ── Escalated events: severity went up during this period.
        # We detect by looking at snapshots: if the latest snapshot has a higher severity
        # than a previous snapshot within the window.
        escalated_rows: list[sqlite3.Row] = []
        sev_order = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
        candidate_events = conn.execute(
            """SELECT DISTINCT es.event_id
               FROM event_snapshots es
               WHERE es.created_at >= datetime('now', ?)""",
            (cutoff,),
        ).fetchall()
        for row in candidate_events:
            eid = row["event_id"]
            snapshots = conn.execute(
                """SELECT payload, created_at FROM event_snapshots
                   WHERE event_id = ? ORDER BY created_at ASC""",
                (eid,),
            ).fetchall()
            if len(snapshots) < 2:
                continue
            first_payload = json.loads(snapshots[0]["payload"])
            last_payload = json.loads(snapshots[-1]["payload"])
            first_sev = first_payload.get("severity") or first_payload.get("risk_level", "Medium")
            last_sev = last_payload.get("severity") or last_payload.get("risk_level", "Medium")
            if sev_order.get(last_sev, 0) > sev_order.get(first_sev, 0):
                evt_row = conn.execute("SELECT * FROM events WHERE id = ?", (eid,)).fetchone()
                if evt_row:
                    escalated_rows.append(evt_row)

        # ── Severity snapshot of all active events ──
        all_active = conn.execute(
            "SELECT severity FROM events WHERE status IN ('active', 'watching')"
        ).fetchall()
        severity_snapshot: dict[str, int] = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        for r in all_active:
            sev = r["severity"]
            if sev in severity_snapshot:
                severity_snapshot[sev] += 1

        # ── Overdue tickets ──
        overdue_rows = conn.execute(
            """SELECT t.*, e.event_title FROM tickets t
               LEFT JOIN events e ON t.event_id = e.id
               WHERE t.due_date IS NOT NULL
                 AND t.due_date < datetime('now')
                 AND t.status != 'done'
               ORDER BY t.due_date ASC""",
        ).fetchall()

        # ── Top regions ──
        region_rows = conn.execute(
            "SELECT region, COUNT(*) as cnt FROM events WHERE status IN ('active', 'watching') GROUP BY region ORDER BY cnt DESC"
        ).fetchall()
        top_regions = [{"region": r["region"], "event_count": r["cnt"]} for r in region_rows if r["region"]]

        # ── Week-over-week delta ──
        prev_cutoff = f"-{days * 2} days"
        prev_new = conn.execute(
            "SELECT COUNT(*) FROM events WHERE first_seen >= datetime('now', ?) AND first_seen < datetime('now', ?)",
            (prev_cutoff, cutoff),
        ).fetchone()[0]
        prev_resolved = conn.execute(
            "SELECT COUNT(*) FROM events WHERE status = 'archived' AND updated_at >= datetime('now', ?) AND updated_at < datetime('now', ?)",
            (prev_cutoff, cutoff),
        ).fetchone()[0]
        prev_active = conn.execute(
            """SELECT COUNT(*) FROM events
               WHERE first_seen < datetime('now', ?)
                 AND (status IN ('active', 'watching') OR (status = 'archived' AND updated_at >= datetime('now', ?)))""",
            (cutoff, cutoff),
        ).fetchone()[0]

        cur_new = len(new_rows)
        cur_resolved = len(resolved_rows)
        cur_active = sum(severity_snapshot.values())

        def _delta(cur: int, prev: int) -> str:
            diff = cur - prev
            return f"+{diff}" if diff >= 0 else str(diff)

        # ── Build event payloads ──
        def _event_payload(row: sqlite3.Row) -> dict:
            event = json.loads(row["payload"])
            event["status"] = row["status"]
            event["first_seen"] = row["first_seen"]
            event["last_seen"] = row["last_seen"]
            event["scan_count"] = row["scan_count"]
            return event

        # ── Period dates ──
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        period_from = (now - timedelta(days=days)).strftime("%Y-%m-%d")
        period_to = now.strftime("%Y-%m-%d")

        headline_parts = []
        if cur_new:
            headline_parts.append(f"{cur_new} new event{'s' if cur_new != 1 else ''}")
        if len(escalated_rows):
            headline_parts.append(f"{len(escalated_rows)} escalated")
        if cur_resolved:
            headline_parts.append(f"{cur_resolved} resolved")
        headline = ", ".join(headline_parts) + " this week" if headline_parts else "No changes this week"

        return {
            "period": {"from": period_from, "to": period_to},
            "headline": headline,
            "severity_snapshot": severity_snapshot,
            "new_events": [_event_payload(r) for r in new_rows],
            "escalated_events": [_event_payload(r) for r in escalated_rows],
            "resolved_events": [_event_payload(r) for r in resolved_rows],
            "overdue_tickets": [dict(r) for r in overdue_rows],
            "top_regions": top_regions,
            "week_over_week_delta": {
                "new": _delta(cur_new, prev_new),
                "resolved": _delta(cur_resolved, prev_resolved),
                "active_total": _delta(cur_active, prev_active),
            },
        }


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

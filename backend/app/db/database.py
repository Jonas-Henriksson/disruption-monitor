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
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
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
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    archived_severity INTEGER,
    resurfaced_at     TEXT
);

CREATE TABLE IF NOT EXISTS event_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    TEXT NOT NULL REFERENCES events(id),
    scan_id     TEXT NOT NULL,
    payload     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS tickets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    TEXT NOT NULL REFERENCES events(id),
    owner       TEXT,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'blocked', 'done')),
    notes       TEXT,
    due_date    TEXT,
    priority    TEXT CHECK (priority IS NULL OR priority IN ('critical', 'high', 'normal', 'low')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS event_edits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL REFERENCES events(id),
    field           TEXT NOT NULL,
    original_value  TEXT NOT NULL,
    edited_value    TEXT NOT NULL,
    edited_by       TEXT NOT NULL DEFAULT 'jh',
    edited_at       TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
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
    alerted_at  TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
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

CREATE TABLE IF NOT EXISTS actions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL REFERENCES events(id),
    action_type     TEXT NOT NULL CHECK (action_type IN (
        'activate_backup_supplier', 'increase_safety_stock', 'reroute_shipment',
        'contact_supplier', 'monitor_situation', 'escalate_to_leadership',
        'file_insurance_claim', 'activate_bcp', 'custom'
    )),
    title           TEXT NOT NULL DEFAULT '',
    description     TEXT,
    assignee_hint   TEXT,
    priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal', 'low')),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'dismissed')),
    due_date        TEXT,
    source          TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual', 'template')),
    assignee_email  TEXT,
    assignee_name   TEXT,
    created_by_email TEXT,
    created_by_name TEXT,
    completion_note TEXT,
    evidence_url    TEXT,
    completed_at    TEXT,
    completed_by_email TEXT,
    completed_by_name TEXT,
    dismissed_reason TEXT,
    dismissed_at    TEXT,
    dismissed_by_email TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE INDEX IF NOT EXISTS idx_actions_event ON actions(event_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);

CREATE INDEX IF NOT EXISTS idx_supplier_rel_site ON supplier_relationships(site_id);
CREATE INDEX IF NOT EXISTS idx_supplier_rel_country ON supplier_relationships(supplier_country);
CREATE INDEX IF NOT EXISTS idx_supplier_rel_supplier ON supplier_relationships(supplier_name);

CREATE TABLE IF NOT EXISTS itsm_sync_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    TEXT NOT NULL,
    action      TEXT NOT NULL CHECK (action IN ('create_ticket', 'update_ticket', 'sync_status', 'list_tickets')),
    payload_json TEXT NOT NULL DEFAULT '{}',
    status      TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'stub')),
    provider    TEXT NOT NULL DEFAULT 'stub',
    external_id TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE INDEX IF NOT EXISTS idx_itsm_sync_log_event ON itsm_sync_log(event_id);
CREATE INDEX IF NOT EXISTS idx_itsm_sync_log_action ON itsm_sync_log(action);

CREATE TABLE IF NOT EXISTS evolution_summaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL REFERENCES events(id),
    period_type     TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    period_start    TEXT NOT NULL,
    period_end      TEXT NOT NULL,
    severity_values TEXT NOT NULL DEFAULT '[]',
    phase_label     TEXT,
    phase_number    INTEGER DEFAULT 1,
    key_developments TEXT NOT NULL DEFAULT '[]',
    exposure_delta  TEXT DEFAULT '',
    forward_outlook TEXT DEFAULT '',
    narrative       TEXT DEFAULT '',
    generated_by    TEXT NOT NULL DEFAULT 'fallback',
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);
CREATE INDEX IF NOT EXISTS idx_evolution_event ON evolution_summaries(event_id, period_type, period_start);
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
        # Migrate existing DBs: add evolution columns to events if missing
        event_cols = {row[1] for row in conn.execute("PRAGMA table_info(events)").fetchall()}
        if "archived_severity" not in event_cols:
            conn.execute("ALTER TABLE events ADD COLUMN archived_severity INTEGER")
        if "resurfaced_at" not in event_cols:
            conn.execute("ALTER TABLE events ADD COLUMN resurfaced_at TEXT")
        if "assessment" not in event_cols:
            conn.execute("ALTER TABLE events ADD COLUMN assessment TEXT")
        # Migration: add new action columns (idempotent)
        _new_action_cols = [
            ("source", "TEXT NOT NULL DEFAULT 'ai'"),
            ("assignee_email", "TEXT"),
            ("assignee_name", "TEXT"),
            ("created_by_email", "TEXT"),
            ("created_by_name", "TEXT"),
            ("completion_note", "TEXT"),
            ("evidence_url", "TEXT"),
            ("completed_at", "TEXT"),
            ("completed_by_email", "TEXT"),
            ("completed_by_name", "TEXT"),
            ("dismissed_reason", "TEXT"),
            ("dismissed_at", "TEXT"),
            ("dismissed_by_email", "TEXT"),
        ]
        for col_name, col_type in _new_action_cols:
            try:
                conn.execute(f"ALTER TABLE actions ADD COLUMN {col_name} {col_type}")
            except Exception:
                pass  # Column already exists
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

_supply_graph_cache: dict | None = None


def _enrich_supply_chain_if_missing(event: dict) -> None:
    """Lazily enrich event with supplier input_details from SUPPLY_GRAPH.

    Only runs if the event has affected_sites but no input_details yet.
    Uses lazy import to avoid circular dependency with scanner module.
    """
    if event.get("input_details") and event.get("routing_context"):
        return

    affected_sites = event.get("affected_sites", [])
    if not affected_sites:
        return

    global _supply_graph_cache
    if _supply_graph_cache is None:
        from ..data import SUPPLY_GRAPH
        _supply_graph_cache = SUPPLY_GRAPH

    all_inputs: list[dict] = []
    routing_reasons: list[str] = []
    seen_inputs: set[str] = set()

    for site in affected_sites:
        site_name = site.get("name", "")
        graph_entry = _supply_graph_cache.get(site_name)
        if not graph_entry:
            continue
        bu = graph_entry.get("bu", "")
        for inp in graph_entry.get("input_details", []):
            key = f"{site_name}|{inp.get('name', '')}"
            if key not in seen_inputs:
                seen_inputs.add(key)
                all_inputs.append({**inp, "factory": site_name, "bu": bu})
        sup_countries = graph_entry.get("sup", [])
        if sup_countries:
            routing_reasons.append(
                f"{site_name} ({bu}) sources from {', '.join(sup_countries[:4])}"
                + (f" +{len(sup_countries) - 4} more" if len(sup_countries) > 4 else "")
            )

    # Region/country fallback if no direct site matches in graph
    # Skip for broad/vague regions to avoid matching every factory.
    BROAD_REGIONS = {"Europe", "Americas", "Global", "Middle East", "Africa", "Asia", "APAC"}

    if not all_inputs:
        event_region = event.get("region", "")
        event_country = event.get("country", "") or event_region

        # Only do supplier-country matching for specific countries
        is_broad = event_region in BROAD_REGIONS and (event_country in BROAD_REGIONS or not event_country)
        if not is_broad:
            for factory_name, graph_entry in _supply_graph_cache.items():
                sup_countries = graph_entry.get("sup", [])
                if event_country in sup_countries or event_region in sup_countries:
                    bu = graph_entry.get("bu", "")
                    for inp in graph_entry.get("input_details", []):
                        key = f"{factory_name}|{inp.get('name', '')}"
                        if key not in seen_inputs:
                            seen_inputs.add(key)
                            all_inputs.append({**inp, "factory": factory_name, "bu": bu})
                    if sup_countries:
                        routing_reasons.append(
                            f"{factory_name} ({bu}) sources from {event_country or event_region}"
                        )

    # ── Hop 2: Downstream exposure ──────────────────────────────
    from ..data import REVERSE_GRAPH
    downstream: list[dict] = []
    seen_downstream: set[str] = set()
    hop1_factories = {inp.get("factory") for inp in all_inputs if inp.get("factory")}

    for factory_name in hop1_factories:
        graph_entry = _supply_graph_cache.get(factory_name)
        if not graph_entry:
            continue
        for sup_country in graph_entry.get("sup", []):
            for peer in REVERSE_GRAPH.get(sup_country, []):
                peer_name = peer["factory"]
                if peer_name in hop1_factories or peer_name in seen_downstream:
                    continue
                seen_downstream.add(peer_name)
                downstream.append({
                    "factory": peer_name,
                    "bu": peer["bu"],
                    "shared_country": sup_country,
                    "shared_inputs": peer["inputs"],
                    "hop": 2,
                })
            if len(downstream) >= 20:
                break
        if len(downstream) >= 20:
            break

    if downstream:
        event["downstream_exposure"] = downstream[:20]

    if all_inputs:
        all_inputs.sort(key=lambda x: (x.get("tier", 3), not x.get("sole_source", False)))
        event["input_details"] = all_inputs[:15]  # Cap at 15
    if routing_reasons:
        event["routing_context"] = routing_reasons[:10]  # Cap at 10


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
    """Insert or update an event. Returns True if new, False if updated.

    If the event is archived and the new severity score exceeds
    archived_severity, the event is resurrected to 'active'.
    """
    now = datetime.now(timezone.utc).isoformat()
    title = _extract_title(payload, mode)
    severity = _extract_severity(payload, mode)
    region = payload.get("region", "")
    lat = payload.get("lat", 0.0)
    lng = payload.get("lng", 0.0)
    payload_json = json.dumps(payload, default=str)

    # Extract severity score for resurrection comparison
    cs = payload.get("computed_severity") or {}
    new_score = cs.get("score", 0) if isinstance(cs, dict) else 0

    with get_db() as conn:
        existing = conn.execute(
            "SELECT id, scan_count, status, archived_severity FROM events WHERE id = ?",
            (event_id,),
        ).fetchone()

        if existing:
            # Check for archive resurrection
            resurrect = False
            if existing["status"] == "archived":
                archived_sev = existing["archived_severity"] or 0
                if new_score > archived_sev:
                    resurrect = True

            if resurrect:
                conn.execute(
                    """UPDATE events
                       SET event_title = ?, severity = ?, region = ?, lat = ?, lng = ?,
                           last_seen = ?, scan_count = scan_count + 1,
                           payload = ?, updated_at = ?,
                           status = 'active', resurfaced_at = ?
                       WHERE id = ?""",
                    (title, severity, region, lat, lng, now, payload_json, now, now, event_id),
                )
            else:
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
    max_age_hours: int | None = None,
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
        if max_age_hours is not None:
            conditions.append("updated_at >= datetime('now', ?)")
            params.append(f"-{max_age_hours} hours")

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
            event["archived_severity"] = row["archived_severity"] if "archived_severity" in row.keys() else None
            event["resurfaced_at"] = row["resurfaced_at"] if "resurfaced_at" in row.keys() else None
            if "assessment" in row.keys() and row["assessment"]:
                event["assessment"] = row["assessment"]
            _enrich_supply_chain_if_missing(event)
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
        event["archived_severity"] = row["archived_severity"] if "archived_severity" in row.keys() else None
        event["resurfaced_at"] = row["resurfaced_at"] if "resurfaced_at" in row.keys() else None
        if "assessment" in row.keys() and row["assessment"]:
            event["assessment"] = row["assessment"]
        _enrich_supply_chain_if_missing(event)
        return event


def save_event_assessment(event_id: str, assessment: str) -> None:
    """Store a pre-computed risk assessment for an event."""
    with get_db() as conn:
        conn.execute(
            "UPDATE events SET assessment = ? WHERE id = ?",
            (assessment, event_id),
        )


def get_active_event_summaries(mode: str) -> list[dict]:
    """Lightweight query for dedup matching — returns id, title, region, lat, lng only."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, event_title, region, lat, lng FROM events "
            "WHERE mode = ? AND status IN ('active', 'watching')",
            (mode,),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "event": r["event_title"],
                "risk": r["event_title"],  # geopolitical mode uses 'risk' key
                "region": r["region"] or "Global",
                "lat": r["lat"],
                "lng": r["lng"],
            }
            for r in rows
        ]


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


def get_active_events_all_modes() -> list[dict]:
    """Get all active/watching events across every mode with _mode tag.

    Used by cross-mode dedup to find related events.
    """
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, mode, payload FROM events WHERE status IN ('active', 'watching')"
        ).fetchall()
        results = []
        for row in rows:
            event = json.loads(row["payload"])
            event["_mode"] = row["mode"]
            results.append(event)
        return results


def update_event_related_events(event_id: str, related_events: list[dict]) -> bool:
    """Patch the payload of an event to include a related_events field.

    Returns True if the event was found and updated.
    """
    with get_db() as conn:
        row = conn.execute("SELECT payload FROM events WHERE id = ?", (event_id,)).fetchone()
        if not row:
            return False
        payload = json.loads(row["payload"])
        payload["related_events"] = related_events
        conn.execute(
            "UPDATE events SET payload = ?, updated_at = ? WHERE id = ?",
            (json.dumps(payload, default=str), datetime.now(timezone.utc).isoformat(), event_id),
        )
        return True


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
                 AND due_date < datetime('now', 'utc')
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
            WHERE es.created_at >= datetime('now', 'utc', ?)
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


# ── Event retention / cleanup ─────────────────────────────────


def cleanup_old_events(days: int = 90) -> int:
    """Delete archived events older than *days* and all their related records.

    Only removes events with status='archived' whose updated_at is older than
    the cutoff. Active and watching events are never deleted.

    Returns the number of events deleted.
    """
    cutoff = f"-{days} days"
    with get_db() as conn:
        # Find archived events older than cutoff
        rows = conn.execute(
            "SELECT id FROM events WHERE status = 'archived' AND updated_at < datetime('now', 'utc', ?)",
            (cutoff,),
        ).fetchall()
        event_ids = [r["id"] for r in rows]

        if not event_ids:
            return 0

        placeholders = ",".join("?" * len(event_ids))

        # Delete related records first (foreign-key safe order)
        conn.execute(f"DELETE FROM event_snapshots WHERE event_id IN ({placeholders})", event_ids)
        conn.execute(f"DELETE FROM tickets WHERE event_id IN ({placeholders})", event_ids)
        conn.execute(f"DELETE FROM actions WHERE event_id IN ({placeholders})", event_ids)
        conn.execute(f"DELETE FROM event_edits WHERE event_id IN ({placeholders})", event_ids)
        conn.execute(f"DELETE FROM alerted_events WHERE event_id IN ({placeholders})", event_ids)
        conn.execute(f"DELETE FROM itsm_sync_log WHERE event_id IN ({placeholders})", event_ids)
        conn.execute(f"DELETE FROM evolution_summaries WHERE event_id IN ({placeholders})", event_ids)

        # Delete the events themselves
        conn.execute(f"DELETE FROM events WHERE id IN ({placeholders})", event_ids)

        logger.info("Cleaned up %d archived events older than %d days", len(event_ids), days)
        return len(event_ids)


# ── Evolution summaries ──────────────────────────────────────────


def save_evolution_summary(summary: dict) -> int:
    """Insert an evolution summary. Returns the row ID."""
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO evolution_summaries
               (event_id, period_type, period_start, period_end, severity_values,
                phase_label, phase_number, key_developments, exposure_delta,
                forward_outlook, narrative, generated_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                summary["event_id"],
                summary["period_type"],
                summary["period_start"],
                summary["period_end"],
                summary["severity_values"],
                summary.get("phase_label", ""),
                summary.get("phase_number", 1),
                summary["key_developments"],
                summary.get("exposure_delta", ""),
                summary.get("forward_outlook", ""),
                summary.get("narrative", ""),
                summary.get("generated_by", "fallback"),
            ),
        )
        return cursor.lastrowid


def get_evolution_summaries(
    event_id: str, period_type: str | None = None, limit: int = 100
) -> list[dict]:
    """Get evolution summaries for an event, optionally filtered by period type."""
    with get_db() as conn:
        if period_type:
            rows = conn.execute(
                """SELECT * FROM evolution_summaries
                   WHERE event_id = ? AND period_type = ?
                   ORDER BY period_start ASC LIMIT ?""",
                (event_id, period_type, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM evolution_summaries
                   WHERE event_id = ?
                   ORDER BY period_start ASC LIMIT ?""",
                (event_id, limit),
            ).fetchall()
        return [dict(r) for r in rows]


def get_latest_evolution_summary(event_id: str) -> dict | None:
    """Get the most recent evolution summary for an event (any period type)."""
    with get_db() as conn:
        row = conn.execute(
            """SELECT * FROM evolution_summaries
               WHERE event_id = ?
               ORDER BY id DESC LIMIT 1""",
            (event_id,),
        ).fetchone()
        return dict(row) if row else None


def delete_evolution_summaries(event_id: str, period_type: str | None = None) -> int:
    """Delete evolution summaries. Used by compression and cleanup."""
    with get_db() as conn:
        if period_type:
            cursor = conn.execute(
                "DELETE FROM evolution_summaries WHERE event_id = ? AND period_type = ?",
                (event_id, period_type),
            )
        else:
            cursor = conn.execute(
                "DELETE FROM evolution_summaries WHERE event_id = ?",
                (event_id,),
            )
        return cursor.rowcount


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
            "SELECT * FROM events WHERE first_seen >= datetime('now', 'utc', ?) ORDER BY first_seen DESC",
            (cutoff,),
        ).fetchall()

        # ── Resolved (archived) events: updated_at within the window & status=archived ──
        resolved_rows = conn.execute(
            "SELECT * FROM events WHERE status = 'archived' AND updated_at >= datetime('now', 'utc', ?) ORDER BY updated_at DESC",
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
               WHERE es.created_at >= datetime('now', 'utc', ?)""",
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
                 AND t.due_date < datetime('now', 'utc')
                 AND t.status != 'done'
               ORDER BY t.due_date ASC""",
        ).fetchall()

        # ── Overdue actions ──
        overdue_action_rows = conn.execute(
            """SELECT a.*, e.event_title FROM actions a
               LEFT JOIN events e ON a.event_id = e.id
               WHERE a.due_date IS NOT NULL
                 AND a.due_date < datetime('now', 'utc')
                 AND a.status NOT IN ('completed', 'dismissed')
               ORDER BY a.due_date ASC""",
        ).fetchall()

        # ── Top regions ──
        region_rows = conn.execute(
            "SELECT region, COUNT(*) as cnt FROM events WHERE status IN ('active', 'watching') GROUP BY region ORDER BY cnt DESC"
        ).fetchall()
        top_regions = [{"region": r["region"], "event_count": r["cnt"]} for r in region_rows if r["region"]]

        # ── Week-over-week delta ──
        prev_cutoff = f"-{days * 2} days"
        prev_new = conn.execute(
            "SELECT COUNT(*) FROM events WHERE first_seen >= datetime('now', 'utc', ?) AND first_seen < datetime('now', 'utc', ?)",
            (prev_cutoff, cutoff),
        ).fetchone()[0]
        prev_resolved = conn.execute(
            "SELECT COUNT(*) FROM events WHERE status = 'archived' AND updated_at >= datetime('now', 'utc', ?) AND updated_at < datetime('now', 'utc', ?)",
            (prev_cutoff, cutoff),
        ).fetchone()[0]
        prev_active = conn.execute(
            """SELECT COUNT(*) FROM events
               WHERE first_seen < datetime('now', 'utc', ?)
                 AND (status IN ('active', 'watching') OR (status = 'archived' AND updated_at >= datetime('now', 'utc', ?)))""",
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
            "overdue_actions": [dict(r) for r in overdue_action_rows],
            "top_regions": top_regions,
            "week_over_week_delta": {
                "new": _delta(cur_new, prev_new),
                "resolved": _delta(cur_resolved, prev_resolved),
                "active_total": _delta(cur_active, prev_active),
                "severity": {
                    sev: _delta(
                        severity_snapshot.get(sev, 0),
                        0,  # Previous-period severity not tracked yet
                    )
                    for sev in ("Critical", "High", "Medium", "Low")
                },
            },
        }


def get_event_severity_history(event_id: str) -> list[dict]:
    """Return severity history for an event from its snapshots.

    Each entry: {scan_id, severity, score, timestamp}
    """
    with get_db() as conn:
        rows = conn.execute(
            """SELECT scan_id, payload, created_at
               FROM event_snapshots
               WHERE event_id = ?
               ORDER BY created_at ASC""",
            (event_id,),
        ).fetchall()

    result = []
    for row in rows:
        payload = json.loads(row["payload"])
        severity = payload.get("severity") or payload.get("risk_level", "Medium")
        score = payload.get("severity_score") or payload.get("score", None)
        result.append({
            "scan_id": row["scan_id"],
            "severity": severity,
            "score": score,
            "timestamp": row["created_at"],
        })
    return result


def get_scan_metrics() -> dict:
    """Return structured scan metrics for the COO dashboard.

    Includes per-mode totals (24h, 7d), average duration, events per scan,
    false positive rate, and last successful scan per mode.
    """
    with get_db() as conn:
        modes = ("disruptions", "geopolitical", "trade")
        by_mode: dict[str, dict] = {}

        for mode in modes:
            # Counts: last 24h and last 7d
            count_24h = conn.execute(
                "SELECT COUNT(*) FROM scan_records WHERE mode = ? AND created_at >= datetime('now', 'utc', '-1 day')",
                (mode,),
            ).fetchone()[0]
            count_7d = conn.execute(
                "SELECT COUNT(*) FROM scan_records WHERE mode = ? AND created_at >= datetime('now', 'utc', '-7 days')",
                (mode,),
            ).fetchone()[0]

            # Average duration (started_at to completed_at)
            duration_rows = conn.execute(
                """SELECT started_at, completed_at FROM scan_records
                   WHERE mode = ? AND started_at IS NOT NULL AND completed_at IS NOT NULL
                   ORDER BY id DESC LIMIT 50""",
                (mode,),
            ).fetchall()
            durations = []
            for dr in duration_rows:
                try:
                    from datetime import datetime as _dt
                    start = _dt.fromisoformat(dr["started_at"].replace("Z", "+00:00"))
                    end = _dt.fromisoformat(dr["completed_at"].replace("Z", "+00:00"))
                    durations.append((end - start).total_seconds())
                except (ValueError, TypeError):
                    pass
            avg_duration_seconds = round(sum(durations) / len(durations), 1) if durations else None

            # Average events per scan (last 50 scans)
            avg_row = conn.execute(
                "SELECT AVG(item_count) FROM (SELECT item_count FROM scan_records WHERE mode = ? ORDER BY id DESC LIMIT 50)",
                (mode,),
            ).fetchone()
            avg_events_per_scan = round(avg_row[0], 1) if avg_row[0] is not None else 0.0

            # Last successful scan
            last_scan = conn.execute(
                "SELECT scan_id, completed_at, source, item_count FROM scan_records WHERE mode = ? AND status = 'completed' ORDER BY id DESC LIMIT 1",
                (mode,),
            ).fetchone()
            last_successful = None
            if last_scan:
                last_successful = {
                    "scan_id": last_scan["scan_id"],
                    "completed_at": last_scan["completed_at"],
                    "source": last_scan["source"],
                    "item_count": last_scan["item_count"],
                }

            by_mode[mode] = {
                "scans_24h": count_24h,
                "scans_7d": count_7d,
                "avg_duration_seconds": avg_duration_seconds,
                "avg_events_per_scan": avg_events_per_scan,
                "last_successful_scan": last_successful,
            }

        # False positive rate from feedback
        feedback_stats = get_feedback_stats()

        return {
            "by_mode": by_mode,
            "total_scans_24h": sum(m["scans_24h"] for m in by_mode.values()),
            "total_scans_7d": sum(m["scans_7d"] for m in by_mode.values()),
            "false_positive_rate_pct": (
                round(feedback_stats["false_positive_count"] / (feedback_stats["true_positive_count"] + feedback_stats["false_positive_count"]) * 100, 1)
                if (feedback_stats["true_positive_count"] + feedback_stats["false_positive_count"]) > 0
                else None
            ),
            "feedback_stats": feedback_stats,
        }


def get_db_stats() -> dict:
    """Get database statistics for the health endpoint."""
    with get_db() as conn:
        event_count = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        scan_count = conn.execute("SELECT COUNT(*) FROM scan_records").fetchone()[0]
        ticket_count = conn.execute("SELECT COUNT(*) FROM tickets").fetchone()[0]
        active_events = conn.execute("SELECT COUNT(*) FROM events WHERE status = 'active'").fetchone()[0]
        pending_actions = conn.execute("SELECT COUNT(*) FROM actions WHERE status = 'pending'").fetchone()[0]
        return {
            "events": event_count,
            "active_events": active_events,
            "scans": scan_count,
            "tickets": ticket_count,
            "pending_actions": pending_actions,
        }


# ── Actions (structured workflows) ──────────────────────────────


def create_action(
    event_id: str,
    action_type: str,
    title: str | None = None,
    description: str | None = None,
    assignee_hint: str | None = None,
    priority: str = "normal",
    due_date: str | None = None,
    source: str = "ai",
    assignee_email: str | None = None,
    assignee_name: str | None = None,
    created_by_email: str | None = None,
    created_by_name: str | None = None,
    status: str = "pending",
) -> int:
    """Create a structured action for an event. Returns the new action ID.

    If title is not provided, a default is derived from the action_type.
    """
    if title is None:
        title = action_type.replace("_", " ").title()
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO actions
               (event_id, action_type, title, description, assignee_hint, priority,
                due_date, source, assignee_email, assignee_name, created_by_email,
                created_by_name, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (event_id, action_type, title, description, assignee_hint, priority,
             due_date, source, assignee_email, assignee_name, created_by_email,
             created_by_name, status),
        )
        return cursor.lastrowid


def get_actions_for_event(event_id: str) -> list[dict]:
    """Get all actions for a specific event, ordered by priority."""
    priority_order = {"critical": 0, "high": 1, "normal": 2, "low": 3}
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM actions WHERE event_id = ? ORDER BY created_at ASC",
            (event_id,),
        ).fetchall()
        result = [dict(r) for r in rows]
        result.sort(key=lambda a: priority_order.get(a.get("priority", "normal"), 2))
        return result


def get_actions(
    status: str | None = None,
    event_id: str | None = None,
    assignee_email: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """Get actions across all events with optional filters."""
    conditions: list[str] = []
    params: list[Any] = []
    if status:
        conditions.append("status = ?")
        params.append(status)
    if event_id:
        conditions.append("event_id = ?")
        params.append(event_id)
    if assignee_email:
        conditions.append("assignee_email = ?")
        params.append(assignee_email)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)

    with get_db() as conn:
        rows = conn.execute(
            f"SELECT * FROM actions {where} ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()
        return [dict(r) for r in rows]


def update_action(
    action_id: int,
    status: str | None = None,
    assignee_hint: str | None = None,
    assignee_email: str | None = None,
    assignee_name: str | None = None,
    due_date: str | None = None,
    priority: str | None = None,
    completion_note: str | None = None,
    evidence_url: str | None = None,
    completed_by_email: str | None = None,
    completed_by_name: str | None = None,
    dismissed_reason: str | None = None,
    dismissed_by_email: str | None = None,
) -> bool:
    """Update an action's status or fields. Returns True if action existed."""
    updates: list[str] = []
    params: list[Any] = []
    now = datetime.now(timezone.utc).isoformat()

    field_map = {
        "status": status, "assignee_hint": assignee_hint,
        "assignee_email": assignee_email, "assignee_name": assignee_name,
        "due_date": due_date, "priority": priority,
        "completion_note": completion_note, "evidence_url": evidence_url,
        "completed_by_email": completed_by_email, "completed_by_name": completed_by_name,
        "dismissed_reason": dismissed_reason, "dismissed_by_email": dismissed_by_email,
    }
    for col, val in field_map.items():
        if val is not None:
            updates.append(f"{col} = ?")
            params.append(val)

    # Auto-set timestamps
    if status == "completed":
        updates.append("completed_at = ?")
        params.append(now)
    if status == "dismissed":
        updates.append("dismissed_at = ?")
        params.append(now)

    if not updates:
        return False
    updates.append("updated_at = ?")
    params.append(now)
    params.append(action_id)

    with get_db() as conn:
        cursor = conn.execute(
            f"UPDATE actions SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        return cursor.rowcount > 0


def get_action(action_id: int) -> dict | None:
    """Get a single action by ID."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
        return dict(row) if row else None


def delete_actions_for_event(event_id: str) -> int:
    """Delete all actions for an event (used before regenerating). Returns count deleted."""
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM actions WHERE event_id = ?", (event_id,))
        return cursor.rowcount


# ── ITSM Sync Log ────────────────────────────────────────────────


def create_itsm_sync_log(
    event_id: str,
    action: str,
    payload_json: str = "{}",
    status: str = "stub",
    provider: str = "stub",
    external_id: str | None = None,
) -> int:
    """Log an ITSM sync attempt. Returns the new log entry ID."""
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO itsm_sync_log (event_id, action, payload_json, status, provider, external_id)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (event_id, action, payload_json, status, provider, external_id),
        )
        return cursor.lastrowid


def get_itsm_sync_log(
    event_id: str | None = None,
    action: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """Query ITSM sync log entries with optional filters."""
    conditions: list[str] = []
    params: list[Any] = []
    if event_id:
        conditions.append("event_id = ?")
        params.append(event_id)
    if action:
        conditions.append("action = ?")
        params.append(action)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)
    with get_db() as conn:
        rows = conn.execute(
            f"SELECT * FROM itsm_sync_log {where} ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()
        return [dict(r) for r in rows]


def get_itsm_sync_log_entry(log_id: int) -> dict | None:
    """Get a single ITSM sync log entry by ID."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM itsm_sync_log WHERE id = ?", (log_id,)).fetchone()
        return dict(row) if row else None


# ── BU Exposure Summary ─────────────────────────────────────────


def get_bu_exposure_summary() -> list[dict]:
    """Compute per-BU exposure summary from active disruptions.

    For each business unit in SUPPLY_GRAPH:
    - Identifies factories whose supplier countries overlap with disrupted regions
    - Counts sole-source inputs at risk
    - Computes exposed_spend_pct from supplier_relationships (percentage, never raw)
    - Collects top threat event titles

    Returns list sorted by exposed_spend_pct descending.
    Never returns raw spend figures — only percentages.
    """
    global _supply_graph_cache
    if _supply_graph_cache is None:
        from ..data import SUPPLY_GRAPH
        _supply_graph_cache = SUPPLY_GRAPH

    # Get active events and their disrupted regions/countries
    with get_db() as conn:
        event_rows = conn.execute(
            "SELECT id, event_title, severity, region, payload FROM events WHERE status = 'active'"
        ).fetchall()

    if not event_rows:
        return []

    # Build set of disrupted countries/regions and threat info
    disrupted_regions: set[str] = set()
    threats: list[dict] = []
    for row in event_rows:
        region = row["region"] or ""
        if region:
            disrupted_regions.add(region)
        # Also extract country from payload if available
        payload = json.loads(row["payload"])
        country = payload.get("country", "")
        if country:
            disrupted_regions.add(country)
        threats.append({
            "event_id": row["id"],
            "title": row["event_title"],
            "severity": row["severity"],
            "region": region,
        })

    if not disrupted_regions:
        return []

    # Aggregate by BU
    from collections import defaultdict
    bu_data: dict[str, dict] = defaultdict(lambda: {
        "factories": set(),
        "sole_source_count": 0,
        "threat_ids": set(),
        "exposed_site_ids": set(),
    })

    for factory_name, graph_entry in _supply_graph_cache.items():
        bu = graph_entry.get("bu", "Unknown")
        sup_countries = set(graph_entry.get("sup", []))

        # Check if any supplier country is in a disrupted region
        overlap = sup_countries & disrupted_regions
        if not overlap:
            continue

        bu_data[bu]["factories"].add(factory_name)

        # Count sole-source inputs at this factory
        for inp in graph_entry.get("input_details", []):
            if inp.get("sole_source", False):
                bu_data[bu]["sole_source_count"] += 1

        # Track which threats affect this BU
        for threat in threats:
            threat_region = threat["region"]
            if threat_region in sup_countries:
                bu_data[bu]["threat_ids"].add(threat["event_id"])

    # Compute exposed_spend_pct per BU from supplier_relationships
    # For each BU, find sites in disrupted countries and compute % of BU total spend
    with get_db() as conn:
        # Get total spend per site (for percentage calc)
        site_totals = conn.execute(
            "SELECT site_id, SUM(spend_sek) AS total_spend FROM supplier_relationships GROUP BY site_id"
        ).fetchall()
        site_total_map = {r["site_id"]: r["total_spend"] or 0 for r in site_totals}

        # Get spend exposed to disrupted regions per site
        disrupted_list = list(disrupted_regions)
        if disrupted_list:
            placeholders = ",".join("?" * len(disrupted_list))
            exposed_rows = conn.execute(
                f"""SELECT site_id, SUM(spend_sek) AS exposed_spend
                    FROM supplier_relationships
                    WHERE supplier_country IN ({placeholders})
                    GROUP BY site_id""",
                disrupted_list,
            ).fetchall()
            site_exposed_map = {r["site_id"]: r["exposed_spend"] or 0 for r in exposed_rows}
        else:
            site_exposed_map = {}

    # Map factories to site_ids via resolve_site_code (best-effort)
    # Also compute global total for BU-level percentage
    global_total_spend = sum(site_total_map.values())

    results = []
    for bu, data in bu_data.items():
        # Sum exposed spend across all factories in this BU
        bu_exposed_spend = 0.0
        bu_total_spend = 0.0

        for factory_name in data["factories"]:
            # Try to resolve factory name to a site_id in supplier_relationships
            site_code = resolve_site_code(factory_name)
            if site_code and site_code in site_exposed_map:
                bu_exposed_spend += site_exposed_map[site_code]
                bu_total_spend += site_total_map.get(site_code, 0)

        # Compute as % of BU total spend (not global)
        if bu_total_spend > 0:
            exposed_spend_pct = round((bu_exposed_spend / bu_total_spend) * 100, 2)
        elif global_total_spend > 0:
            exposed_spend_pct = round((bu_exposed_spend / global_total_spend) * 100, 2)
        else:
            exposed_spend_pct = 0.0

        # Collect top threats for this BU
        bu_threats = [t for t in threats if t["event_id"] in data["threat_ids"]]
        top_threats = [
            {"title": t["title"], "severity": t["severity"], "region": t["region"]}
            for t in bu_threats[:5]
        ]

        results.append({
            "bu": bu,
            "exposed_spend_pct": exposed_spend_pct,
            "factory_count": len(data["factories"]),
            "sole_source_count": data["sole_source_count"],
            "top_threats": top_threats,
        })

    # Sort by exposed_spend_pct descending
    results.sort(key=lambda x: -x["exposed_spend_pct"])
    return results


# ── What-If Simulation ─────────────────────────────────────────

_CHOKEPOINT_REGIONS: dict[str, list[str]] = {
    "Suez Canal": ["Egypt", "Saudi Arabia", "India", "China", "Japan", "South Korea"],
    "Panama Canal": ["United States", "Mexico", "Canada", "Brazil", "Argentina"],
    "Strait of Malacca": ["Malaysia", "China", "Japan", "South Korea", "India"],
    "Bosporus": ["Turkey", "Bulgaria", "Romania", "Ukraine"],
    "Strait of Hormuz": ["Saudi Arabia", "India", "Japan", "South Korea", "China"],
    "Cape of Good Hope": ["South Africa", "Morocco"],
}


def simulate_what_if(scenario_type: str, target: str, duration_weeks: int = 2) -> dict:
    """Simulate a supply chain disruption scenario.

    scenario_type: 'region_disruption' or 'chokepoint_closure'
    target: country name or chokepoint name
    duration_weeks: how long the disruption lasts

    Returns impact analysis. Never returns raw spend — only percentages.
    """
    global _supply_graph_cache
    if _supply_graph_cache is None:
        from ..data import SUPPLY_GRAPH
        _supply_graph_cache = SUPPLY_GRAPH

    # Determine affected countries
    if scenario_type == "chokepoint_closure":
        affected_countries = set(_CHOKEPOINT_REGIONS.get(target, []))
    else:
        # region_disruption — target IS the country
        affected_countries = {target}

    # If no countries to check, return empty result
    if not affected_countries:
        return {
            "scenario_type": scenario_type,
            "target": target,
            "duration_weeks": duration_weeks,
            "affected_factories": [],
            "bu_impact": {},
            "sole_source_risks": [],
            "total_factories_affected": 0,
        }

    # Walk the supply graph and find affected factories
    affected_factories: list[dict] = []
    sole_source_risks: list[dict] = []
    from collections import defaultdict
    bu_agg: dict[str, dict] = defaultdict(lambda: {
        "factory_count": 0,
        "t1_inputs_at_risk": 0,
        "sole_source_count": 0,
    })

    for factory_name, graph_entry in _supply_graph_cache.items():
        sup_countries = set(graph_entry.get("sup", []))
        overlap = sup_countries & affected_countries
        if not overlap:
            continue

        bu = graph_entry.get("bu", "Unknown")
        affected_inputs: list[str] = []
        t1_count = 0
        has_sole_source = False

        for inp in graph_entry.get("input_details", []):
            affected_inputs.append(inp.get("name", ""))
            if inp.get("tier") == 1:
                t1_count += 1
            if inp.get("sole_source", False):
                has_sole_source = True
                sole_source_risks.append({
                    "factory": factory_name,
                    "bu": bu,
                    "input": inp.get("name", ""),
                    "affected_countries": sorted(overlap),
                })

        affected_factories.append({
            "factory": factory_name,
            "bu": bu,
            "affected_countries": sorted(overlap),
            "affected_inputs": affected_inputs,
            "t1_count": t1_count,
            "sole_source": has_sole_source,
        })

        bu_agg[bu]["factory_count"] += 1
        bu_agg[bu]["t1_inputs_at_risk"] += t1_count
        if has_sole_source:
            bu_agg[bu]["sole_source_count"] += 1

    # Compute exposed_spend_pct per BU from supplier_relationships
    with get_db() as conn:
        # Total spend per site
        site_totals = conn.execute(
            "SELECT site_id, SUM(spend_sek) AS total_spend FROM supplier_relationships GROUP BY site_id"
        ).fetchall()
        site_total_map = {r["site_id"]: r["total_spend"] or 0 for r in site_totals}

        # Exposed spend per site (suppliers in affected countries)
        country_list = list(affected_countries)
        if country_list:
            placeholders = ",".join("?" * len(country_list))
            exposed_rows = conn.execute(
                f"""SELECT site_id, SUM(spend_sek) AS exposed_spend
                    FROM supplier_relationships
                    WHERE supplier_country IN ({placeholders})
                    GROUP BY site_id""",
                country_list,
            ).fetchall()
            site_exposed_map = {r["site_id"]: r["exposed_spend"] or 0 for r in exposed_rows}
        else:
            site_exposed_map = {}

    # Enrich bu_agg with exposed_spend_pct
    bu_impact: dict[str, dict] = {}
    for bu, agg in bu_agg.items():
        # Sum exposed/total spend across factories in this BU
        bu_exposed = 0.0
        bu_total = 0.0
        for af in affected_factories:
            if af["bu"] != bu:
                continue
            site_code = resolve_site_code(af["factory"])
            if site_code:
                bu_exposed += site_exposed_map.get(site_code, 0)
                bu_total += site_total_map.get(site_code, 0)

        exposed_spend_pct = round((bu_exposed / bu_total) * 100, 2) if bu_total > 0 else 0.0

        bu_impact[bu] = {
            **agg,
            "exposed_spend_pct": exposed_spend_pct,
        }

    # Cap lists
    affected_factories = affected_factories[:30]
    sole_source_risks = sole_source_risks[:15]

    return {
        "scenario_type": scenario_type,
        "target": target,
        "duration_weeks": duration_weeks,
        "affected_factories": affected_factories,
        "bu_impact": bu_impact,
        "sole_source_risks": sole_source_risks,
        "total_factories_affected": len(affected_factories),
    }

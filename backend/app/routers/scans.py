"""Scan endpoints -- trigger new scans and retrieve latest results."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..auth.dependencies import get_current_user
from ..data import load_disruptions, load_geopolitical, load_trade
from ..db.database import (
    create_action,
    get_actions_for_event,
    get_events,
    get_latest_scan,
    save_scan_record,
    upsert_event,
)
from ..models.schemas import ScanRequest
from ..services.action_engine import generate_actions_for_event
from ..services.scanner import ScanMode, run_scan
from ..services.teams_channel import send_scan_channel_alerts
from ..services.telegram import send_scan_alerts
from ..services.webhooks import publish_scan_complete

router = APIRouter(prefix="/scans", tags=["scans"])

# ── Scan rate limiting ────────────────────────────────────────
SCAN_COOLDOWN_SECONDS = 60
# mode -> timestamp (monotonic) of last completed scan
_last_scan_completed: dict[str, float] = {}


def get_scan_cooldowns() -> dict[str, dict]:
    """Return cooldown status per mode for the health endpoint."""
    now = time.monotonic()
    result: dict[str, dict] = {}
    for mode in ("disruptions", "geopolitical", "trade"):
        last = _last_scan_completed.get(mode)
        if last is None:
            result[mode] = {"ready": True, "retry_after_seconds": 0}
        else:
            elapsed = now - last
            remaining = max(0, SCAN_COOLDOWN_SECONDS - elapsed)
            result[mode] = {
                "ready": remaining == 0,
                "retry_after_seconds": round(remaining),
            }
    return result


def _get_event_id(item: dict, mode: str) -> str:
    """Extract a stable ID from a scan result item."""
    return item.get("id", f"{mode}-unknown")


@router.get("/latest/{mode}")
async def get_latest_scan_results(mode: ScanMode):
    """Return the latest scan results for the given mode.

    Reads from SQLite. If no scan has been run, returns sample data.
    """
    latest = get_latest_scan(mode)
    # Only return events updated in the last 24 hours to avoid stale accumulation
    events = get_events(mode=mode, status="active", limit=50, max_age_hours=24)

    if events:
        now = latest["completed_at"] if latest else datetime.now(timezone.utc).isoformat()
        return {
            "mode": mode,
            "source": latest["source"] if latest else "database",
            "scanned_at": now,
            mode: events,
            "count": len(events),
        }

    # No events in DB -- serve sample data as default
    loaders: dict[ScanMode, callable] = {
        "disruptions": load_disruptions,
        "geopolitical": load_geopolitical,
        "trade": load_trade,
    }
    if mode not in loaders:
        raise HTTPException(status_code=400, detail=f"Unknown scan mode: {mode}")

    data = loaders[mode]()
    now = datetime.now(timezone.utc).isoformat()

    return {
        "mode": mode,
        "source": "sample",
        "scanned_at": now,
        mode: data,
        "count": len(data),
    }


@router.post("")
async def trigger_scan(request: ScanRequest, user: dict[str, Any] = Depends(get_current_user)):
    """Trigger a new scan.

    Uses Claude API with web search when API key is configured,
    otherwise returns sample data instantly. Results are persisted to SQLite.
    Enforces a 60-second cooldown between manual scans of the same mode.
    """
    # Enforce scan cooldown
    now = time.monotonic()
    last = _last_scan_completed.get(request.mode)
    if last is not None:
        elapsed = now - last
        remaining = SCAN_COOLDOWN_SECONDS - elapsed
        if remaining > 0:
            raise HTTPException(
                status_code=429,
                detail=f"Scan cooldown: try again in {int(remaining)} seconds",
            )

    result = await run_scan(request.mode)

    # Persist scan record
    save_scan_record(
        scan_id=result.get("scan_id", "unknown"),
        mode=request.mode,
        source=result.get("source", "sample"),
        item_count=result.get("count", 0),
        started_at=result.get("started_at", datetime.now(timezone.utc).isoformat()),
        completed_at=result.get("completed_at"),
    )

    # Persist each event and generate structured actions for new events
    items = result.get("items", result.get(request.mode, []))
    scan_id = result.get("scan_id", "unknown")
    for item in items:
        event_id = _get_event_id(item, request.mode)
        is_new = upsert_event(event_id, request.mode, item, scan_id)
        if is_new:
            _generate_actions_for_item(event_id, item)

    # Send Telegram alerts for Critical/High events
    if result.get("source") == "live":
        await send_scan_alerts(items, request.mode)
        await send_scan_channel_alerts(items, request.mode)

    # Publish outbound webhooks / SNS notifications
    try:
        await publish_scan_complete(
            mode=request.mode,
            scan_id=result.get("scan_id", "unknown"),
            source=result.get("source", "sample"),
            item_count=result.get("count", 0),
            items=items,
        )
    except Exception:
        pass  # Fire-and-forget; errors logged inside publish_scan_complete

    # Record scan completion time for cooldown enforcement
    _last_scan_completed[request.mode] = time.monotonic()

    # Return all active events for this mode (not just the scan's items)
    # so the frontend shows the full picture after a scan
    all_active = get_events(mode=request.mode, status="active", limit=50, max_age_hours=24)
    result["items"] = all_active
    result[request.mode] = all_active
    result["count"] = len(all_active)

    return result


@router.get("/metrics")
async def get_scan_metrics_endpoint():
    """Return structured scan metrics for operational dashboards.

    Includes per-mode totals (24h, 7d), average duration, events per scan,
    false positive rate, and last successful scan per mode.
    """
    from ..db.database import get_scan_metrics

    return get_scan_metrics()


@router.get("/history")
async def get_scan_history_endpoint(mode: ScanMode | None = None, limit: int = 50):
    """Return scan history."""
    from ..db.database import get_scan_history

    return get_scan_history(mode=mode, limit=limit)


def _generate_actions_for_item(event_id: str, item: dict) -> int:
    """Generate and persist structured actions for a newly detected event.

    Returns the number of actions created.
    """
    import logging
    _logger = logging.getLogger(__name__)
    try:
        action_defs = generate_actions_for_event(item)
        for action_def in action_defs:
            create_action(
                event_id=event_id,
                action_type=action_def["action_type"],
                title=action_def["title"],
                description=action_def["description"],
                assignee_hint=action_def["assignee_hint"],
                priority=action_def["priority"],
                due_date=action_def.get("due_date"),
            )
        return len(action_defs)
    except Exception as exc:
        _logger.warning(
            "Action generation failed for event %s: %s — event persisted without actions",
            event_id, exc,
        )
        # Flag the event so the UI/health can surface the gap
        try:
            from ..db.database import save_event_edit
            save_event_edit(
                event_id=event_id,
                field="actions_generation",
                original_value="pending",
                edited_value=f"failed: {exc}",
                edited_by="system",
            )
        except Exception:
            _logger.debug("Could not record action-gen failure edit for %s", event_id)
        return 0

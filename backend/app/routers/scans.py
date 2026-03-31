"""Scan endpoints -- trigger new scans and retrieve latest results."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from ..data import load_disruptions, load_geopolitical, load_trade
from ..db.database import (
    get_events,
    get_latest_scan,
    save_scan_record,
    upsert_event,
)
from ..models.schemas import ScanRequest
from ..services.scanner import ScanMode, run_scan
from ..services.telegram import send_scan_alerts

router = APIRouter(prefix="/scans", tags=["scans"])


def _get_event_id(item: dict, mode: str) -> str:
    """Extract a stable ID from a scan result item."""
    return item.get("id", f"{mode}-unknown")


@router.get("/latest/{mode}")
async def get_latest_scan_results(mode: ScanMode):
    """Return the latest scan results for the given mode.

    Reads from SQLite. If no scan has been run, returns sample data.
    """
    latest = get_latest_scan(mode)
    events = get_events(mode=mode)

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
async def trigger_scan(request: ScanRequest):
    """Trigger a new scan.

    Uses Claude API with web search when API key is configured,
    otherwise returns sample data instantly. Results are persisted to SQLite.
    """
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

    # Persist each event
    items = result.get("items", result.get(request.mode, []))
    scan_id = result.get("scan_id", "unknown")
    for item in items:
        event_id = _get_event_id(item, request.mode)
        upsert_event(event_id, request.mode, item, scan_id)

    # Send Telegram alerts for Critical/High events
    if result.get("source") == "live":
        await send_scan_alerts(items, request.mode)

    return result


@router.get("/history")
async def get_scan_history_endpoint(mode: ScanMode | None = None, limit: int = 50):
    """Return scan history."""
    from ..db.database import get_scan_history

    return get_scan_history(mode=mode, limit=limit)

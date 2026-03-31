"""Background scanning scheduler using asyncio tasks.

Runs periodic scans at configurable intervals:
  - Disruptions: every 15 min (configurable via TARS_SCAN_INTERVAL_MINUTES_DISRUPTIONS)
  - Geopolitical: every 30 min
  - Trade: every 60 min

Each scan mode runs independently. Results are persisted to SQLite via the
same code path as manual scans.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from ..config import settings
from ..db.database import save_scan_record, upsert_event
from .scanner import ScanMode, run_scan
from .telegram import send_scan_alerts

logger = logging.getLogger(__name__)

# Track running tasks so we can cancel on shutdown
_tasks: dict[ScanMode, asyncio.Task] = {}
_running = False


def _interval_seconds(mode: ScanMode) -> int:
    """Get the scan interval for a mode in seconds."""
    minutes = {
        "disruptions": settings.scan_interval_minutes_disruptions,
        "geopolitical": settings.scan_interval_minutes_geopolitical,
        "trade": settings.scan_interval_minutes_trade,
    }
    return minutes.get(mode, 15) * 60


async def _scan_loop(mode: ScanMode) -> None:
    """Run scans for a single mode on a repeating interval."""
    interval = _interval_seconds(mode)
    logger.info("Scheduler: %s scan loop starting (every %d min)", mode, interval // 60)

    while _running:
        try:
            logger.info("Scheduler: running %s scan", mode)
            result = await run_scan(mode)

            # Persist scan record
            save_scan_record(
                scan_id=result.get("scan_id", "unknown"),
                mode=mode,
                source=result.get("source", "sample"),
                item_count=result.get("count", 0),
                started_at=result.get("started_at", datetime.now(timezone.utc).isoformat()),
                completed_at=result.get("completed_at"),
            )

            # Persist events
            items = result.get("items", result.get(mode, []))
            scan_id = result.get("scan_id", "unknown")
            new_count = 0
            for item in items:
                event_id = item.get("id", f"{mode}-unknown")
                is_new = upsert_event(event_id, mode, item, scan_id)
                if is_new:
                    new_count += 1

            source = result.get("source", "unknown")
            logger.info(
                "Scheduler: %s scan complete — %d items (%d new), source=%s",
                mode, len(items), new_count, source,
            )

            # Send Telegram alerts for new Critical/High events
            if source == "live":
                alerts_sent = await send_scan_alerts(items, mode)
                if alerts_sent:
                    logger.info("Scheduler: sent %d Telegram alerts for %s", alerts_sent, mode)

        except asyncio.CancelledError:
            logger.info("Scheduler: %s scan loop cancelled", mode)
            return
        except Exception:
            logger.exception("Scheduler: %s scan failed", mode)

        # Wait for next cycle
        try:
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            logger.info("Scheduler: %s scan loop cancelled during sleep", mode)
            return


def start_scheduler() -> None:
    """Start background scan tasks for all modes."""
    global _running

    if not settings.has_claude_api:
        logger.info("Scheduler: no Claude API key configured, background scanning disabled")
        return

    if _running:
        logger.warning("Scheduler: already running")
        return

    _running = True
    loop = asyncio.get_running_loop()

    for mode in ("disruptions", "geopolitical", "trade"):
        task = loop.create_task(_scan_loop(mode), name=f"scan-{mode}")
        _tasks[mode] = task
        logger.info("Scheduler: started %s task", mode)


async def stop_scheduler() -> None:
    """Cancel all background scan tasks."""
    global _running
    _running = False

    for mode, task in _tasks.items():
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            logger.info("Scheduler: stopped %s task", mode)

    _tasks.clear()


def get_scheduler_status() -> dict:
    """Return the current status of the scheduler."""
    return {
        "running": _running,
        "api_configured": settings.has_claude_api,
        "tasks": {
            mode: {
                "active": (not _tasks[mode].done()) if mode in _tasks else False,
                "interval_minutes": _interval_seconds(mode) // 60,
            }
            for mode in ("disruptions", "geopolitical", "trade")
        },
    }

"""Background scanning scheduler using asyncio tasks.

Runs periodic scans at configurable intervals (tactical vs strategic cadence):
  - Disruptions: every 15 min (tactical — fast-moving natural disasters)
  - Geopolitical: every 60 min (strategic — slower-moving shifts)
  - Trade: every 120 min (strategic — trade policy evolves slowly)

Each scan mode runs independently. Results are persisted to SQLite via the
same code path as manual scans.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from ..config import settings
from ..db.database import (
    create_action,
    get_active_event_summaries,
    get_active_events_all_modes,
    get_events,
    get_latest_evolution_summary,
    save_event_assessment,
    save_evolution_summary,
    save_scan_record,
    update_event_related_events,
    upsert_event,
)
from .action_engine import generate_actions_for_event
from .evolution import (
    compress_daily_to_weekly,
    compress_weekly_to_monthly,
    generate_evolution_summary,
    get_evolution_cadence_hours,
)
from .dedup import find_cross_mode_related, resolve_event_id
from .narrative import generate_assessment
from .scanner import ScanMode, run_scan
from .teams_channel import send_scan_channel_alerts as send_teams_alerts
from .telegram import send_scan_alerts
from .webhooks import publish_scan_complete

logger = logging.getLogger(__name__)

# Track running tasks so we can cancel on shutdown
_tasks: dict[ScanMode, asyncio.Task] = {}
_running = False

# Per-mode scan status tracking (state, last_completed, next_scheduled, events_found, source)
_scan_status: dict[str, dict] = {}

# Initial delay before first scan per mode (seconds). Module-level for testability.
_INITIAL_DELAYS: dict[str, int] = {"disruptions": 30, "trade": 60}


def get_scan_status() -> dict:
    """Return a deep copy of the current scan status for all modes."""
    import copy
    return copy.deepcopy(_scan_status)


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

    # Delay the first automatic scan so manual scans can run immediately
    # after startup without hitting the lock. Stagger modes to avoid
    # concurrent Bedrock calls.
    delay = _INITIAL_DELAYS.get(mode, 120)
    logger.info("Scheduler: %s first scan in %ds", mode, delay)
    try:
        await asyncio.sleep(delay)
    except asyncio.CancelledError:
        return

    while _running:
        try:
            logger.info("Scheduler: running %s scan", mode)
            _scan_status[mode] = {"state": "running"}
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
            actions_count = 0

            # Fetch existing events for fuzzy dedup matching
            existing_summaries = get_active_event_summaries(mode)

            for item in items:
                event_id = item.get("id", f"{mode}-unknown")
                # Fuzzy match against existing events to reuse IDs
                matched_id = resolve_event_id(item, existing_summaries)
                if matched_id:
                    logger.info("Dedup: '%s' matched existing '%s'", item.get("event", item.get("risk", "?"))[:50], matched_id[:50])
                    event_id = matched_id
                    item["id"] = matched_id
                is_new = upsert_event(event_id, mode, item, scan_id)
                if is_new:
                    new_count += 1
                    # Track new event for intra-batch dedup
                    existing_summaries.append({
                        "id": event_id,
                        "event": item.get("event") or item.get("risk", ""),
                        "risk": item.get("event") or item.get("risk", ""),
                        "region": item.get("region", "Global"),
                        "lat": item.get("lat"),
                        "lng": item.get("lng"),
                    })
                    # Auto-generate structured actions for new events
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
                        actions_count += len(action_defs)
                    except Exception as exc:
                        logger.warning(
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
                            logger.debug("Could not record action-gen failure edit for %s", event_id)

            # Pre-compute risk assessments for new events (Sonnet, fast)
            if result.get("source") == "live":
                for item in items:
                    event_id = item.get("id", f"{mode}-unknown")
                    try:
                        text = await generate_assessment(item)
                        save_event_assessment(event_id, text)
                    except Exception as exc:
                        logger.debug("Assessment pre-compute failed for %s: %s", event_id, exc)

            # Cross-mode related event linkage
            try:
                all_active = get_active_events_all_modes()
                related_map = find_cross_mode_related(items, mode, all_active)
                for evt_id, links in related_map.items():
                    update_event_related_events(evt_id, links)
                if related_map:
                    logger.info(
                        "Scheduler: %s cross-mode linkage — %d events linked",
                        mode, len(related_map),
                    )
            except Exception:
                logger.exception("Scheduler: cross-mode dedup failed for %s (non-fatal)", mode)

            source = result.get("source", "unknown")
            logger.info(
                "Scheduler: %s scan complete — %d items (%d new, %d actions), source=%s",
                mode, len(items), new_count, actions_count, source,
            )

            # Send Telegram alerts for new Critical/High events
            if source == "live":
                alerts_sent = await send_scan_alerts(items, mode)
                if alerts_sent:
                    logger.info("Scheduler: sent %d Telegram alerts for %s", alerts_sent, mode)
                teams_sent = await send_teams_alerts(items, mode)
                if teams_sent:
                    logger.info("Scheduler: sent %d Teams alerts for %s", teams_sent, mode)

            # Publish outbound webhooks / SNS notifications
            try:
                await publish_scan_complete(
                    mode=mode,
                    scan_id=scan_id,
                    source=source,
                    item_count=len(items),
                    items=items,
                )
            except Exception:
                logger.exception("Scheduler: webhook publish failed for %s (non-fatal)", mode)

            # Update scan status to idle with metadata
            now = datetime.now(timezone.utc)
            _scan_status[mode] = {
                "state": "idle",
                "last_completed": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "next_scheduled": (now + timedelta(seconds=interval)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "events_found": len(items),
                "source": source,
            }

        except asyncio.CancelledError:
            logger.info("Scheduler: %s scan loop cancelled", mode)
            return
        except Exception:
            logger.exception("Scheduler: %s scan failed", mode)
            _scan_status[mode] = {
                "state": "error",
                "last_error": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }

        # Wait for next cycle
        try:
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            logger.info("Scheduler: %s scan loop cancelled during sleep", mode)
            return


async def _evolution_loop() -> None:
    """Periodic evolution analysis for active/watching events."""
    logger.info("Scheduler: evolution analysis loop starting (checks every 30 min)")
    await asyncio.sleep(120)  # initial delay — let first scans complete

    while _running:
        try:
            now = datetime.now(timezone.utc)
            today = now.strftime("%Y-%m-%d")

            # Get active + watching events
            active = get_events(status="active", limit=500)
            watching = get_events(status="watching", limit=500)
            all_events = active + watching
            watching_ids = {e.get("id") for e in watching}

            for event in all_events:
                eid = event.get("id", "")
                severity = event.get("severity", "Medium")
                is_watching = eid in watching_ids
                cadence_h = get_evolution_cadence_hours(severity, watching=is_watching)

                # Check if analysis is due
                latest = get_latest_evolution_summary(eid)
                if latest:
                    created = latest["created_at"]
                    if isinstance(created, str) and "T" not in created:
                        created = created.replace(" ", "T") + "+00:00"
                    elif isinstance(created, str) and not created.endswith("+00:00") and not created.endswith("Z"):
                        created += "+00:00"
                    last_time = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    if (now - last_time).total_seconds() < cadence_h * 3600:
                        continue

                logger.info("Evolution analysis: running daily for %s (severity=%s)", eid, severity)
                try:
                    summary = await generate_evolution_summary(
                        eid, "daily", today, today,
                    )
                    save_evolution_summary(summary)

                    # Check for phase transition → Teams alert
                    if latest and summary.get("phase_label") and summary["phase_label"] != latest.get("phase_label"):
                        from .teams_channel import send_phase_transition_alert
                        title = event.get("event") or event.get("risk", "Unknown")
                        region = event.get("region", "")
                        await send_phase_transition_alert(
                            title, region,
                            latest.get("phase_label", ""),
                            summary["phase_label"],
                            summary.get("phase_number", 1),
                        )
                except Exception as exc:
                    logger.error("Evolution analysis failed for %s: %s", eid, exc)

        except Exception as exc:
            logger.error("Evolution loop error: %s", exc)

        await asyncio.sleep(1800)  # check every 30 minutes


async def _compression_loop() -> None:
    """Weekly/monthly compression of evolution summaries."""
    logger.info("Scheduler: compression loop starting (checks daily)")
    await asyncio.sleep(300)  # initial delay

    while _running:
        try:
            now = datetime.now(timezone.utc)

            # Weekly compression on Sundays
            if now.weekday() == 6:  # Sunday
                week_end = now.strftime("%Y-%m-%d")
                week_start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
                active = get_events(status="active", limit=500)
                for event in active:
                    eid = event.get("id", "")
                    try:
                        compress_daily_to_weekly(eid, week_start, week_end)
                    except Exception as exc:
                        logger.error("Weekly compression failed for %s: %s", eid, exc)

            # Monthly compression on 1st of month
            if now.day == 1:
                month_end = now.strftime("%Y-%m-%d")
                month_start = (now - timedelta(days=30)).strftime("%Y-%m-%d")
                active = get_events(status="active", limit=500)
                for event in active:
                    eid = event.get("id", "")
                    try:
                        compress_weekly_to_monthly(eid, month_start, month_end)
                    except Exception as exc:
                        logger.error("Monthly compression failed for %s: %s", eid, exc)

        except Exception as exc:
            logger.error("Compression loop error: %s", exc)

        await asyncio.sleep(86400)  # check daily


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

    # geopolitical mode disabled — overlaps heavily with disruptions scan.
    # Re-enable by adding "geopolitical" back to this tuple.
    for mode in ("disruptions", "trade"):
        task = loop.create_task(_scan_loop(mode), name=f"scan-{mode}")
        _tasks[mode] = task
        logger.info("Scheduler: started %s task", mode)

    # Evolution analysis + compression
    evo_task = loop.create_task(_evolution_loop(), name="evolution-analysis")
    _tasks["evolution"] = evo_task
    logger.info("Scheduler: started evolution analysis task")

    comp_task = loop.create_task(_compression_loop(), name="evolution-compression")
    _tasks["compression"] = comp_task
    logger.info("Scheduler: started evolution compression task")


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
    _scan_status.clear()


_digest_task: asyncio.Task | None = None


async def _digest_loop() -> None:
    """Run daily digest at the configured hour (UTC)."""
    from .digest import build_daily_digest, format_digest_html

    while True:
        now = datetime.now(timezone.utc)
        target_hour = settings.digest_schedule_hour
        next_run = now.replace(hour=target_hour, minute=0, second=0, microsecond=0)
        if now >= next_run:
            next_run += timedelta(days=1)

        wait_seconds = (next_run - now).total_seconds()
        logger.info("Daily digest scheduled for %s (in %.0f seconds)", next_run.isoformat(), wait_seconds)
        await asyncio.sleep(wait_seconds)

        try:
            digest = build_daily_digest()
            html = format_digest_html(digest)
            logger.info("Daily digest built: %s", digest.get("headline", ""))
            if settings.digest_enabled and settings.digest_recipients:
                logger.info("Digest ready for %d recipients", len(settings.digest_recipients.split(",")))
            else:
                logger.info("Digest built but email delivery not configured (set DIGEST_ENABLED=true)")
        except Exception:
            logger.exception("Failed to build daily digest")


def start_digest_schedule() -> None:
    """Start the daily digest background task."""
    global _digest_task
    if _digest_task is not None:
        return
    _digest_task = asyncio.create_task(_digest_loop())
    logger.info("Daily digest scheduler started")


def stop_digest_schedule() -> None:
    """Stop the daily digest background task."""
    global _digest_task
    if _digest_task is not None:
        _digest_task.cancel()
        _digest_task = None


_weekly_digest_task: asyncio.Task | None = None


async def _weekly_digest_loop() -> None:
    """Send executive digest via Teams/Telegram every Monday at configured hour."""
    from .executive import build_executive_summary, generate_executive_one_liner
    from .teams_channel import send_weekly_digest
    from ..db.database import get_bu_exposure_summary, get_weekly_summary

    while True:
        now = datetime.now(timezone.utc)
        target_day = settings.weekly_digest_day  # 0=Monday
        target_hour = settings.weekly_digest_hour
        days_ahead = (target_day - now.weekday()) % 7
        if days_ahead == 0 and now.hour >= target_hour:
            days_ahead = 7
        next_run = (now + timedelta(days=days_ahead)).replace(
            hour=target_hour, minute=0, second=0, microsecond=0
        )

        wait_seconds = (next_run - now).total_seconds()
        logger.info("Weekly digest scheduled for %s (in %.0f hours)", next_run.isoformat(), wait_seconds / 3600)
        await asyncio.sleep(wait_seconds)

        if not settings.weekly_digest_enabled:
            logger.info("Weekly digest disabled, skipping")
            continue

        try:
            weekly = get_weekly_summary(days=7)
            active = get_events(status="active", limit=50, max_age_hours=168)
            bu_exp = get_bu_exposure_summary()
            one_liner = await generate_executive_one_liner(active)
            summary = build_executive_summary(active, weekly, bu_exp, one_liner=one_liner)

            await send_weekly_digest(summary)

            # Also send via Telegram if configured
            if settings.has_telegram:
                from .telegram import send_telegram_message
                tg_text = (
                    f"*SC Hub Weekly Digest*\n"
                    f"Risk: *{summary['risk_level']}* | "
                    f"{summary['severity_counts'].get('Critical', 0)} Critical, "
                    f"{summary['severity_counts'].get('High', 0)} High\n"
                )
                if one_liner:
                    tg_text += f"_{one_liner}_\n"
                for evt in summary.get("actively_bleeding", [])[:3]:
                    title = evt.get("event") or evt.get("risk", "?")
                    tg_text += f"\n\u26a0 {title}"
                await send_telegram_message(tg_text)
        except Exception:
            logger.exception("Failed to send weekly digest")


def start_weekly_digest() -> None:
    """Start the weekly digest background task."""
    global _weekly_digest_task
    if _weekly_digest_task is not None:
        return
    _weekly_digest_task = asyncio.create_task(_weekly_digest_loop())
    logger.info("Weekly digest scheduler started")


def stop_weekly_digest() -> None:
    """Stop the weekly digest background task."""
    global _weekly_digest_task
    if _weekly_digest_task is not None and not _weekly_digest_task.done():
        _weekly_digest_task.cancel()
    _weekly_digest_task = None


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
            for mode in ("disruptions", "trade")
        },
    }

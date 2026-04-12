"""Outbound webhook publisher for event notifications.

Publishes structured event data to configured webhook URLs (HTTP POST)
and/or AWS SNS topics. All calls are async, fire-and-forget, and wrapped
in try/except so they never block or crash the main scan flow.

Configuration:
    WEBHOOK_URLS   — comma-separated HTTP(S) endpoints
    SNS_TOPIC_ARN  — AWS SNS topic ARN for pub/sub integration
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

# Severity levels that qualify for individual event webhooks
_WEBHOOK_SEVERITIES = {"Critical", "High"}


def _build_payload(
    event_data: dict,
    trigger: str,
    metadata: dict[str, Any] | None = None,
) -> dict:
    """Build the canonical webhook payload envelope."""
    return {
        "source": "sc-hub-disruption-monitor",
        "trigger": trigger,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event_data,
        "metadata": metadata or {},
    }


async def _post_webhook(url: str, payload: dict) -> None:
    """POST a JSON payload to a single webhook URL (5s timeout, fire-and-forget)."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            logger.info(
                "Webhook POST %s -> %d (%s)",
                url[:80],
                resp.status_code,
                trigger_label(payload),
            )
    except Exception as exc:
        logger.warning("Webhook POST failed for %s: %s", url[:80], exc)


async def _publish_sns(payload: dict) -> None:
    """Publish a JSON message to the configured SNS topic."""
    if not settings.sns_topic_arn:
        return
    try:
        import boto3

        sns = boto3.client("sns", region_name=settings.aws_region)
        message = json.dumps(payload, default=str)

        # Run the synchronous boto3 call in a thread
        await asyncio.to_thread(
            sns.publish,
            TopicArn=settings.sns_topic_arn,
            Message=message,
            Subject=f"SC Hub: {payload.get('trigger', 'event')}",
            MessageAttributes={
                "trigger": {"DataType": "String", "StringValue": payload.get("trigger", "unknown")},
                "source": {"DataType": "String", "StringValue": "sc-hub-disruption-monitor"},
            },
        )
        logger.info("SNS publish OK -> %s (%s)", settings.sns_topic_arn[:60], trigger_label(payload))
    except Exception as exc:
        logger.warning("SNS publish failed: %s", exc)


def trigger_label(payload: dict) -> str:
    """Short label for logging."""
    return payload.get("trigger", "?")


async def publish_event(
    event_data: dict,
    trigger: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Publish an event to all configured webhook URLs and SNS.

    Fire-and-forget: errors are logged but never propagated.
    """
    urls = _get_webhook_urls()
    has_sns = bool(settings.sns_topic_arn)

    if not urls and not has_sns:
        return  # No outbound channels configured

    payload = _build_payload(event_data, trigger, metadata)

    tasks: list[asyncio.Task] = []
    for url in urls:
        tasks.append(asyncio.create_task(_post_webhook(url, payload)))
    if has_sns:
        tasks.append(asyncio.create_task(_publish_sns(payload)))

    # Await all in parallel; individual failures are caught inside each task
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


async def publish_scan_complete(
    mode: str,
    scan_id: str,
    source: str,
    item_count: int,
    items: list[dict],
) -> None:
    """Publish a scan_complete event with summary metadata.

    Also publishes individual new_critical_event webhooks for
    Critical/High items.
    """
    # Individual critical/high event webhooks
    for item in items:
        severity = item.get("severity") or item.get("risk_level", "Medium")
        if severity in _WEBHOOK_SEVERITIES:
            await publish_event(
                event_data=item,
                trigger="new_critical_event",
                metadata={"mode": mode, "scan_id": scan_id},
            )

    # Scan-level summary
    summary = {
        "mode": mode,
        "scan_id": scan_id,
        "source": source,
        "item_count": item_count,
        "critical_count": sum(
            1
            for i in items
            if (i.get("severity") or i.get("risk_level")) == "Critical"
        ),
        "high_count": sum(
            1
            for i in items
            if (i.get("severity") or i.get("risk_level")) == "High"
        ),
    }
    await publish_event(
        event_data=summary,
        trigger="scan_complete",
        metadata={"mode": mode, "scan_id": scan_id},
    )


def _get_webhook_urls() -> list[str]:
    """Parse the comma-separated WEBHOOK_URLS setting into a list."""
    raw = settings.webhook_urls
    if not raw:
        return []
    return [url.strip() for url in raw.split(",") if url.strip()]


def get_webhook_status() -> dict:
    """Return current webhook configuration status (for health endpoint)."""
    urls = _get_webhook_urls()
    return {
        "configured": bool(urls) or bool(settings.sns_topic_arn),
        "webhook_url_count": len(urls),
        "sns_topic_arn": settings.sns_topic_arn or None,
    }

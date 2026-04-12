"""Webhook management endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends

from ..auth.dependencies import get_current_user
from ..services.webhooks import get_webhook_status, publish_event

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("/status")
async def webhook_status():
    """Return current webhook configuration status."""
    return get_webhook_status()


@router.post("/test")
async def test_webhook(user: dict[str, Any] = Depends(get_current_user)):
    """Publish a test event to all configured webhook endpoints and SNS.

    Useful for verifying connectivity without waiting for a real scan.
    """
    test_event = {
        "id": "webhook-test",
        "event": "Webhook connectivity test",
        "description": "This is a test event published manually to verify webhook integration.",
        "severity": "Low",
        "region": "Global",
        "lat": 0.0,
        "lng": 0.0,
        "category": "Test",
        "trend": "Stable",
        "status": "active",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    await publish_event(
        event_data=test_event,
        trigger="test",
        metadata={"triggered_by": "manual_test"},
    )

    status = get_webhook_status()
    return {
        "status": "sent",
        "detail": "Test event published to all configured channels",
        **status,
    }

"""MS Graph API endpoints -- Teams, Email, and Calendar integration.

All Graph operations are sandboxed by default (see config.graph_sandbox_enabled).
The Graph token is passed via the X-Graph-Token header, separate from the
Bearer auth token used for backend authentication.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from ..auth.dependencies import get_current_user
from ..config import settings
from ..db.database import get_event
from ..services.digest import build_daily_digest, format_digest_html
from ..services.graph import (
    GraphResult,
    create_incident_meeting,
    get_my_profile,
    send_disruption_email,
    send_disruption_teams_alert,
    send_email,
    post_teams_message,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/graph", tags=["MS Graph"])


# ── Graph token dependency ───────────────────────────────────────


async def require_graph_token(x_graph_token: str | None = Header(None)) -> str:
    """Extract and validate the MS Graph token from the X-Graph-Token header."""
    if not x_graph_token:
        raise HTTPException(
            status_code=401,
            detail="Missing X-Graph-Token header. Acquire a Graph token via MSAL and pass it in this header.",
        )
    return x_graph_token


# ── Response models ──────────────────────────────────────────────


class GraphResultResponse(BaseModel):
    success: bool
    detail: str
    data: dict | None = None


class GraphProfileResponse(BaseModel):
    success: bool
    detail: str
    display_name: str | None = None
    email: str | None = None
    job_title: str | None = None
    data: dict | None = None


class GraphStatusResponse(BaseModel):
    sandbox_enabled: bool
    sandbox_recipient: str


# ── Helper ───────────────────────────────────────────────────────


def _find_event_or_404(event_id: str) -> dict:
    """Load an event from the database or raise 404."""
    event = get_event(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")
    return event


def _to_response(result: GraphResult) -> GraphResultResponse:
    return GraphResultResponse(success=result.success, detail=result.detail, data=result.data)


# ── Endpoints ────────────────────────────────────────────────────


@router.get("/status", response_model=GraphStatusResponse)
async def graph_status(user: dict[str, Any] = Depends(get_current_user)):
    """Return sandbox mode status and configured recipient."""
    return GraphStatusResponse(
        sandbox_enabled=settings.graph_sandbox_enabled,
        sandbox_recipient=settings.graph_sandbox_recipient,
    )


@router.get("/me", response_model=GraphProfileResponse)
async def graph_me(
    graph_token: str = Depends(require_graph_token),
    user: dict[str, Any] = Depends(get_current_user),
):
    """Test Graph token validity by fetching the authenticated user's profile."""
    result = await get_my_profile(graph_token)
    profile = result.data or {}
    return GraphProfileResponse(
        success=result.success,
        detail=result.detail,
        display_name=profile.get("displayName"),
        email=profile.get("mail") or profile.get("userPrincipalName"),
        job_title=profile.get("jobTitle"),
        data=result.data,
    )


@router.post("/email/test", response_model=GraphResultResponse)
async def graph_email_test(
    graph_token: str = Depends(require_graph_token),
    user: dict[str, Any] = Depends(get_current_user),
):
    """Send a test email to the sandbox recipient."""
    result = await send_email(
        graph_token,
        "SC Hub Disruption Monitor -- Test Email",
        (
            "<h2>Test Email</h2>"
            "<p>This is a test email from the SC Hub Disruption Monitor.</p>"
            "<p>If you received this, the MS Graph email integration is working correctly.</p>"
        ),
    )
    return _to_response(result)


@router.post("/teams/test", response_model=GraphResultResponse)
async def graph_teams_test(
    graph_token: str = Depends(require_graph_token),
    user: dict[str, Any] = Depends(get_current_user),
):
    """Send a test Teams message to the sandbox recipient."""
    result = await post_teams_message(
        graph_token,
        (
            "<strong>SC Hub Disruption Monitor -- Test Message</strong><br/>"
            "If you received this, the MS Graph Teams integration is working correctly."
        ),
    )
    return _to_response(result)


@router.post("/events/{event_id}/email", response_model=GraphResultResponse)
async def graph_event_email(
    event_id: str,
    graph_token: str = Depends(require_graph_token),
    user: dict[str, Any] = Depends(get_current_user),
):
    """Send a disruption email alert for a specific event."""
    event = _find_event_or_404(event_id)
    result = await send_disruption_email(graph_token, event)
    return _to_response(result)


@router.post("/events/{event_id}/teams", response_model=GraphResultResponse)
async def graph_event_teams(
    event_id: str,
    graph_token: str = Depends(require_graph_token),
    user: dict[str, Any] = Depends(get_current_user),
):
    """Post a disruption alert to Teams for a specific event."""
    event = _find_event_or_404(event_id)
    result = await send_disruption_teams_alert(graph_token, event)
    return _to_response(result)


@router.post("/events/{event_id}/meeting", response_model=GraphResultResponse)
async def graph_event_meeting(
    event_id: str,
    graph_token: str = Depends(require_graph_token),
    user: dict[str, Any] = Depends(get_current_user),
):
    """Create an incident review meeting for a specific disruption event."""
    event = _find_event_or_404(event_id)
    result = await create_incident_meeting(graph_token, event)
    return _to_response(result)


# ── Daily Digest ────────────────────────────────────────────────


class DigestResponse(BaseModel):
    success: bool
    detail: str
    recipients_count: int = 0
    digest: dict | None = None


@router.post("/digest", response_model=DigestResponse)
async def graph_send_digest(
    graph_token: str = Depends(require_graph_token),
    user: dict[str, Any] = Depends(get_current_user),
):
    """Generate and send the daily risk briefing digest via email.

    In sandbox mode, the digest is sent only to the sandbox recipient
    (jonas.henriksson@skf.com) regardless of configured DIGEST_RECIPIENTS.
    """
    from datetime import datetime, timezone

    digest = build_daily_digest()
    body_html = format_digest_html(digest)
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    subject = f"[SC Hub] Daily Risk Briefing -- {date_str}"

    # Determine recipients: sandbox overrides all configured recipients
    if settings.graph_sandbox_enabled:
        recipients = [settings.graph_sandbox_recipient]
    else:
        raw = settings.digest_recipients.strip()
        recipients = [r.strip() for r in raw.split(",") if r.strip()] if raw else []
        if not recipients:
            recipients = [settings.graph_sandbox_recipient]

    errors = []
    sent = 0
    for recipient in recipients:
        result = await send_email(graph_token, subject, body_html, recipient)
        if result.success:
            sent += 1
        else:
            errors.append(f"{recipient}: {result.detail}")
            logger.warning("Digest email failed for %s: %s", recipient, result.detail)

    if errors:
        detail = f"Sent to {sent}/{len(recipients)} recipients. Failures: {'; '.join(errors)}"
        return DigestResponse(success=sent > 0, detail=detail, recipients_count=sent, digest=digest)

    return DigestResponse(
        success=True,
        detail=f"Daily digest sent to {sent} recipient{'s' if sent != 1 else ''}",
        recipients_count=sent,
        digest=digest,
    )

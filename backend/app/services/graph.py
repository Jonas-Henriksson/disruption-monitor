"""Microsoft Graph API client for Teams, Email, and Calendar integration.

ALL operations are sandboxed by default -- every email, Teams message, and
calendar invite goes ONLY to the configured sandbox recipient (Jonas Henriksson).
Flip settings.graph_sandbox_enabled to False when ready for production.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


@dataclass
class GraphResult:
    success: bool
    detail: str
    data: dict | None = None


# ── Helpers ──────────────────────────────────────────────────────


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _sandbox_recipient() -> str:
    return settings.graph_sandbox_recipient


def _is_sandbox() -> bool:
    return settings.graph_sandbox_enabled


# ── Low-level Graph operations ───────────────────────────────────


async def get_my_profile(token: str) -> GraphResult:
    """GET /me -- returns user profile. Useful for testing token validity."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{GRAPH_BASE}/me", headers=_headers(token))
            if resp.status_code == 200:
                data = resp.json()
                return GraphResult(success=True, detail="Profile retrieved", data=data)
            return GraphResult(success=False, detail=f"Graph API error {resp.status_code}: {resp.text}")
    except httpx.HTTPError as exc:
        logger.error("Graph get_my_profile failed: %s", exc)
        return GraphResult(success=False, detail=str(exc))


async def send_email(
    token: str,
    subject: str,
    body_html: str,
    recipient_email: str | None = None,
) -> GraphResult:
    """Send email via POST /me/sendMail.

    In sandbox mode the recipient is always overridden to SANDBOX_RECIPIENT
    and the subject is prefixed with [SANDBOX].
    """
    original_recipient = recipient_email or _sandbox_recipient()
    actual_recipient = original_recipient

    if _is_sandbox():
        actual_recipient = _sandbox_recipient()
        subject = f"[SANDBOX] {subject}"
        if original_recipient != actual_recipient:
            body_html = (
                f'<p style="color:#888;font-size:12px;">'
                f"Original intended recipient: {original_recipient}</p>"
                f"{body_html}"
            )

    payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": body_html},
            "toRecipients": [
                {"emailAddress": {"address": actual_recipient}},
            ],
        },
        "saveToSentItems": "true",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{GRAPH_BASE}/me/sendMail",
                headers=_headers(token),
                json=payload,
            )
            # sendMail returns 202 Accepted on success
            if resp.status_code in (200, 202):
                return GraphResult(
                    success=True,
                    detail=f"Email sent to {actual_recipient}",
                    data={"recipient": actual_recipient, "subject": subject},
                )
            return GraphResult(success=False, detail=f"Graph API error {resp.status_code}: {resp.text}")
    except httpx.HTTPError as exc:
        logger.error("Graph send_email failed: %s", exc)
        return GraphResult(success=False, detail=str(exc))


async def post_teams_message(
    token: str,
    message_html: str,
    chat_id: str | None = None,
) -> GraphResult:
    """Post a Teams chat message.

    In sandbox mode, always creates/finds a 1:1 chat with SANDBOX_RECIPIENT
    regardless of the provided chat_id.
    """
    try:
        async with httpx.AsyncClient() as client:
            if _is_sandbox() or chat_id is None:
                # Create (or get existing) 1:1 chat with sandbox recipient
                chat_payload = {
                    "chatType": "oneOnOne",
                    "members": [
                        {
                            "@odata.type": "#microsoft.graph.aadUserConversationMember",
                            "roles": ["owner"],
                            "user@odata.bind": f"https://graph.microsoft.com/v1.0/me",
                        },
                        {
                            "@odata.type": "#microsoft.graph.aadUserConversationMember",
                            "roles": ["owner"],
                            "user@odata.bind": (
                                f"https://graph.microsoft.com/v1.0/users/{_sandbox_recipient()}"
                            ),
                        },
                    ],
                }
                chat_resp = await client.post(
                    f"{GRAPH_BASE}/chats",
                    headers=_headers(token),
                    json=chat_payload,
                )
                if chat_resp.status_code not in (200, 201):
                    return GraphResult(
                        success=False,
                        detail=f"Failed to create/get chat: {chat_resp.status_code}: {chat_resp.text}",
                    )
                chat_id = chat_resp.json().get("id")

            # Post message to the chat
            msg_payload = {
                "body": {"contentType": "html", "content": message_html},
            }
            msg_resp = await client.post(
                f"{GRAPH_BASE}/chats/{chat_id}/messages",
                headers=_headers(token),
                json=msg_payload,
            )
            if msg_resp.status_code in (200, 201):
                return GraphResult(
                    success=True,
                    detail=f"Teams message posted to chat {chat_id}",
                    data={"chat_id": chat_id},
                )
            return GraphResult(
                success=False,
                detail=f"Graph API error {msg_resp.status_code}: {msg_resp.text}",
            )
    except httpx.HTTPError as exc:
        logger.error("Graph post_teams_message failed: %s", exc)
        return GraphResult(success=False, detail=str(exc))


async def create_calendar_event(
    token: str,
    subject: str,
    body_html: str,
    start_iso: str,
    end_iso: str,
    attendee_emails: list[str] | None = None,
) -> GraphResult:
    """Create a calendar event via POST /me/events.

    In sandbox mode attendee list is overridden to [SANDBOX_RECIPIENT]
    and the subject is prefixed with [SANDBOX].
    """
    original_attendees = attendee_emails or [_sandbox_recipient()]
    actual_attendees = original_attendees

    if _is_sandbox():
        actual_attendees = [_sandbox_recipient()]
        subject = f"[SANDBOX] {subject}"
        if set(original_attendees) != set(actual_attendees):
            body_html = (
                f'<p style="color:#888;font-size:12px;">'
                f"Original intended attendees: {', '.join(original_attendees)}</p>"
                f"{body_html}"
            )

    payload = {
        "subject": subject,
        "body": {"contentType": "HTML", "content": body_html},
        "start": {"dateTime": start_iso, "timeZone": "UTC"},
        "end": {"dateTime": end_iso, "timeZone": "UTC"},
        "attendees": [
            {
                "emailAddress": {"address": email, "name": email},
                "type": "required",
            }
            for email in actual_attendees
        ],
        "isOnlineMeeting": True,
        "onlineMeetingProvider": "teamsForBusiness",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{GRAPH_BASE}/me/events",
                headers=_headers(token),
                json=payload,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return GraphResult(
                    success=True,
                    detail=f"Calendar event created: {subject}",
                    data={
                        "event_id": data.get("id"),
                        "web_link": data.get("webLink"),
                        "subject": subject,
                        "attendees": actual_attendees,
                    },
                )
            return GraphResult(success=False, detail=f"Graph API error {resp.status_code}: {resp.text}")
    except httpx.HTTPError as exc:
        logger.error("Graph create_calendar_event failed: %s", exc)
        return GraphResult(success=False, detail=str(exc))


# ── High-level disruption helpers ────────────────────────────────

_SEVERITY_COLORS = {
    "Critical": "#ef4444",
    "High": "#f97316",
    "Medium": "#eab308",
    "Low": "#22c55e",
}


def _format_disruption_email_html(event_data: dict) -> tuple[str, str]:
    """Format a disruption event into a professional HTML email.

    Returns (subject, body_html).
    """
    title = event_data.get("event") or event_data.get("risk", "Unknown Disruption")
    severity = event_data.get("severity") or event_data.get("risk_level", "Medium")
    region = event_data.get("region", "Global")
    color = _SEVERITY_COLORS.get(severity, "#888")

    # Affected sites
    sites_html = ""
    impact = event_data.get("impact", {})
    affected_sites = impact.get("affected_sites", []) if impact else []
    if affected_sites:
        site_rows = "".join(
            f'<tr><td style="padding:4px 12px;color:#e0e0e0;">{s.get("name", "Unknown")}</td>'
            f'<td style="padding:4px 12px;color:#aaa;">{s.get("country", "")}</td></tr>'
            for s in affected_sites[:8]
        )
        sites_html = (
            f'<table style="border-collapse:collapse;margin:12px 0;">'
            f'<tr><th style="padding:4px 12px;text-align:left;color:#888;border-bottom:1px solid #333;">Site</th>'
            f'<th style="padding:4px 12px;text-align:left;color:#888;border-bottom:1px solid #333;">Country</th></tr>'
            f"{site_rows}</table>"
        )

    # Recommendations
    actions = event_data.get("actions", [])
    actions_html = ""
    if actions:
        items = "".join(
            f'<li style="margin:4px 0;color:#e0e0e0;">{a.get("action", "")}'
            f' <span style="color:#888;">({a.get("owner", "TBD")} -- {a.get("urgency", "")})</span></li>'
            for a in actions[:5]
        )
        actions_html = f'<ul style="padding-left:20px;">{items}</ul>'

    exposure = event_data.get("skf_exposure") or event_data.get("skf_relevance", "")

    subject = f"SC Hub Alert: {title} [{severity}]"
    body_html = f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:24px;border-radius:8px;max-width:640px;">
        <div style="display:flex;align-items:center;margin-bottom:16px;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/SKF_logo.svg/200px-SKF_logo.svg.png"
                 alt="SKF" style="height:28px;margin-right:12px;" />
            <span style="font-size:18px;font-weight:600;color:#fff;">SC Hub Disruption Monitor</span>
        </div>
        <div style="background:#16213e;border-radius:6px;padding:20px;border-left:4px solid {color};">
            <h2 style="margin:0 0 8px;color:#fff;font-size:20px;">{title}</h2>
            <span style="display:inline-block;padding:2px 10px;border-radius:12px;background:{color};color:#fff;font-size:13px;font-weight:600;">
                {severity}
            </span>
            <span style="color:#888;margin-left:12px;">{region}</span>
        </div>
        {"<div style='margin-top:16px;'><h3 style='color:#aaa;font-size:14px;margin:0 0 8px;'>SKF EXPOSURE</h3><p style='color:#e0e0e0;margin:0;'>" + exposure + "</p></div>" if exposure else ""}
        {"<div style='margin-top:16px;'><h3 style='color:#aaa;font-size:14px;margin:0 0 8px;'>AFFECTED SITES</h3>" + sites_html + "</div>" if sites_html else ""}
        {"<div style='margin-top:16px;'><h3 style='color:#aaa;font-size:14px;margin:0 0 8px;'>RECOMMENDED ACTIONS</h3>" + actions_html + "</div>" if actions_html else ""}
        <div style="margin-top:20px;padding-top:12px;border-top:1px solid #333;color:#666;font-size:12px;">
            Generated by SC Hub Disruption Monitor &bull; {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}
        </div>
    </div>
    """
    return subject, body_html


def _format_disruption_teams_html(event_data: dict) -> str:
    """Format a disruption event as an HTML message for Teams chat."""
    title = event_data.get("event") or event_data.get("risk", "Unknown Disruption")
    severity = event_data.get("severity") or event_data.get("risk_level", "Medium")
    region = event_data.get("region", "Global")
    color = _SEVERITY_COLORS.get(severity, "#888")
    exposure = event_data.get("skf_exposure") or event_data.get("skf_relevance", "")

    affected_sites = []
    impact = event_data.get("impact", {})
    if impact:
        affected_sites = impact.get("affected_sites", [])
    sites_text = ", ".join(s.get("name", "") for s in affected_sites[:5]) if affected_sites else "None identified"

    actions = event_data.get("actions", [])
    actions_text = ""
    if actions:
        actions_text = "<br/>".join(
            f"- {a.get('action', '')} ({a.get('owner', 'TBD')})" for a in actions[:3]
        )

    return (
        f'<div style="border-left:4px solid {color};padding-left:12px;">'
        f"<strong>SC Hub Alert: {title}</strong><br/>"
        f'<span style="color:{color};font-weight:bold;">{severity}</span> | {region}<br/><br/>'
        f"{f'<strong>Exposure:</strong> {exposure}<br/>' if exposure else ''}"
        f"<strong>Affected Sites:</strong> {sites_text}<br/>"
        f"{f'<br/><strong>Actions:</strong><br/>{actions_text}' if actions_text else ''}"
        f"</div>"
    )


async def send_disruption_email(token: str, event_data: dict) -> GraphResult:
    """Format a disruption event into a professional HTML email and send it."""
    subject, body_html = _format_disruption_email_html(event_data)
    return await send_email(token, subject, body_html)


async def send_disruption_teams_alert(token: str, event_data: dict) -> GraphResult:
    """Format a disruption as an HTML Teams message and post it."""
    message_html = _format_disruption_teams_html(event_data)
    return await post_teams_message(token, message_html)


async def create_incident_meeting(token: str, event_data: dict) -> GraphResult:
    """Create a 30-minute incident review meeting scheduled 1 hour from now."""
    title = event_data.get("event") or event_data.get("risk", "Unknown Disruption")
    severity = event_data.get("severity") or event_data.get("risk_level", "Medium")
    region = event_data.get("region", "Global")

    now = datetime.now(timezone.utc)
    start = now + timedelta(hours=1)
    end = start + timedelta(minutes=30)

    subject = f"Incident Review: {title} [{severity}]"
    body_html = (
        f"<h2>Incident Review Meeting</h2>"
        f"<p><strong>Disruption:</strong> {title}</p>"
        f"<p><strong>Severity:</strong> {severity} | <strong>Region:</strong> {region}</p>"
        f"<p>This meeting was auto-generated by the SC Hub Disruption Monitor "
        f"to review the above incident and coordinate response actions.</p>"
        f"<p><em>Generated at {now.strftime('%Y-%m-%d %H:%M UTC')}</em></p>"
    )

    return await create_calendar_event(
        token,
        subject,
        body_html,
        start.strftime("%Y-%m-%dT%H:%M:%S"),
        end.strftime("%Y-%m-%dT%H:%M:%S"),
    )

"""Teams chat notification service for action assignments."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


def build_assignment_message(
    event_title: str,
    event_severity: str,
    action_title: str,
    priority: str,
    due_date: str | None,
    assigner_name: str,
    deep_link: str | None = None,
) -> str:
    """Build a formatted Teams chat message for an action assignment."""
    sev_emoji = {"Critical": "\U0001f534", "High": "\U0001f7e0", "Medium": "\U0001f7e1", "Low": "\U0001f7e2"}.get(event_severity, "\u26aa")
    due_str = due_date[:10] if due_date else "No due date"
    lines = [
        f"{sev_emoji} **Action assigned to you** -- SC Hub Disruption Monitor",
        "",
        f"**Event:** {event_title} ({event_severity})",
        f"**Action:** {action_title}",
        f"**Priority:** {priority}",
        f"**Due:** {due_str}",
        f"**Assigned by:** {assigner_name}",
    ]
    if deep_link:
        lines.append(f"\n[Open in SC Hub]({deep_link})")
    return "\n".join(lines)


async def send_assignment_chat(
    graph_token: str,
    assignee_email: str,
    event_title: str,
    event_severity: str,
    action_title: str,
    priority: str,
    due_date: str | None,
    assigner_name: str,
    deep_link: str | None = None,
) -> bool:
    """Send a 1:1 Teams chat message to the assignee. Fire-and-forget."""
    headers = {"Authorization": f"Bearer {graph_token}", "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Step 1: Create or find 1:1 chat
            chat_resp = await client.post(
                f"{GRAPH_BASE}/chats",
                headers=headers,
                json={
                    "chatType": "oneOnOne",
                    "members": [
                        {
                            "@odata.type": "#microsoft.graph.aadUserConversationMember",
                            "roles": ["owner"],
                            "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{assignee_email}')",
                        },
                    ],
                },
            )
            if chat_resp.status_code not in (200, 201):
                logger.warning("Teams chat creation failed: %d %s", chat_resp.status_code, chat_resp.text[:200])
                return False

            chat_id = chat_resp.json()["id"]

            # Step 2: Send message
            message = build_assignment_message(
                event_title, event_severity, action_title, priority, due_date, assigner_name, deep_link,
            )
            msg_resp = await client.post(
                f"{GRAPH_BASE}/chats/{chat_id}/messages",
                headers=headers,
                json={"body": {"contentType": "text", "content": message}},
            )
            if msg_resp.status_code not in (200, 201):
                logger.warning("Teams message send failed: %d %s", msg_resp.status_code, msg_resp.text[:200])
                return False

            logger.info("Teams notification sent to %s for action '%s'", assignee_email, action_title)
            return True

    except Exception:
        logger.exception("Teams notification failed for %s", assignee_email)
        return False

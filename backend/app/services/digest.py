"""Daily digest builder for the SC Hub Disruption Monitor.

Queries the database for active events, new events, escalating trends,
and overdue tickets, then formats the results into a professional HTML
email suitable for sending via MS Graph API.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from ..db.database import get_db, get_overdue_tickets

logger = logging.getLogger(__name__)

DASHBOARD_URL = "https://d2rbfnbkfx00z5.cloudfront.net"

_SEVERITY_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
_SEVERITY_COLORS = {
    "Critical": "#ef4444",
    "High": "#f97316",
    "Medium": "#eab308",
    "Low": "#22c55e",
}


def build_daily_digest() -> dict:
    """Query the DB and return a structured digest payload.

    Returns:
        {
            headline: str,
            severity_counts: {Critical: int, High: int, Medium: int, Low: int},
            new_events: [{id, title, severity, region, mode}],
            escalating: [{id, title, severity, region}],
            overdue_tickets: [{id, event_id, owner, due_date, priority}],
            generated_at: str (ISO),
        }
    """
    now = datetime.now(timezone.utc)
    cutoff_24h = (now - timedelta(hours=24)).isoformat()

    severity_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    new_events: list[dict] = []
    escalating: list[dict] = []

    with get_db() as conn:
        # Active events by severity
        rows = conn.execute(
            "SELECT severity, COUNT(*) AS cnt FROM events WHERE status = 'active' GROUP BY severity"
        ).fetchall()
        for row in rows:
            sev = row["severity"]
            if sev in severity_counts:
                severity_counts[sev] = row["cnt"]

        # New events in last 24 hours
        new_rows = conn.execute(
            """SELECT id, event_title, severity, region, mode, payload
               FROM events
               WHERE first_seen >= ? AND status = 'active'
               ORDER BY severity ASC, first_seen DESC""",
            (cutoff_24h,),
        ).fetchall()
        for row in new_rows:
            new_events.append({
                "id": row["id"],
                "title": row["event_title"],
                "severity": row["severity"],
                "region": row["region"],
                "mode": row["mode"],
            })

        # Escalating events (trend field in payload)
        active_rows = conn.execute(
            "SELECT id, event_title, severity, region, payload FROM events WHERE status = 'active'"
        ).fetchall()
        for row in active_rows:
            try:
                payload = json.loads(row["payload"])
            except (json.JSONDecodeError, TypeError):
                continue
            trend = payload.get("trend", "").lower()
            if trend in ("escalating", "worsening"):
                escalating.append({
                    "id": row["id"],
                    "title": row["event_title"],
                    "severity": row["severity"],
                    "region": row["region"],
                })

    # Overdue tickets
    overdue_raw = get_overdue_tickets()
    overdue_tickets = [
        {
            "id": t["id"],
            "event_id": t["event_id"],
            "owner": t.get("owner", "Unassigned"),
            "due_date": t.get("due_date", ""),
            "priority": t.get("priority", "normal"),
        }
        for t in overdue_raw
    ]

    # Build headline
    total_active = sum(severity_counts.values())
    crit = severity_counts["Critical"]
    high = severity_counts["High"]
    parts = [f"{total_active} active disruption{'s' if total_active != 1 else ''}"]
    if crit:
        parts.append(f"{crit} critical")
    if high:
        parts.append(f"{high} high severity")
    if new_events:
        parts.append(f"{len(new_events)} new in last 24h")
    headline = " | ".join(parts)

    return {
        "headline": headline,
        "severity_counts": severity_counts,
        "new_events": new_events,
        "escalating": escalating,
        "overdue_tickets": overdue_tickets,
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def format_digest_html(digest: dict) -> str:
    """Format a digest payload into a professional dark-themed HTML email."""
    date_str = datetime.now(timezone.utc).strftime("%A, %B %d, %Y")
    counts = digest["severity_counts"]
    total = sum(counts.values()) or 1  # avoid division by zero

    # Severity distribution bar segments
    bar_segments = ""
    for sev in ("Critical", "High", "Medium", "Low"):
        count = counts.get(sev, 0)
        if count == 0:
            continue
        pct = round(count / total * 100)
        color = _SEVERITY_COLORS[sev]
        bar_segments += (
            f'<div style="width:{pct}%;background:{color};height:28px;display:inline-block;'
            f'text-align:center;line-height:28px;color:#fff;font-size:12px;font-weight:600;">'
            f"{sev[0]}: {count}</div>"
        )

    # New events section
    new_events_html = ""
    if digest["new_events"]:
        rows = ""
        for ev in digest["new_events"][:15]:
            sev = ev["severity"]
            color = _SEVERITY_COLORS.get(sev, "#888")
            rows += (
                f'<tr>'
                f'<td style="padding:6px 12px;color:#e0e0e0;border-bottom:1px solid #2a2a4a;">{ev["title"]}</td>'
                f'<td style="padding:6px 12px;border-bottom:1px solid #2a2a4a;">'
                f'<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:{color};'
                f'color:#fff;font-size:11px;font-weight:600;">{sev}</span></td>'
                f'<td style="padding:6px 12px;color:#aaa;border-bottom:1px solid #2a2a4a;">{ev["region"]}</td>'
                f'<td style="padding:6px 12px;color:#888;border-bottom:1px solid #2a2a4a;">{ev["mode"]}</td>'
                f'</tr>'
            )
        new_events_html = (
            f'<div style="margin-top:24px;">'
            f'<h3 style="color:#aaa;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">New Events (Last 24h)</h3>'
            f'<table style="width:100%;border-collapse:collapse;">'
            f'<tr>'
            f'<th style="padding:6px 12px;text-align:left;color:#666;border-bottom:1px solid #333;font-size:12px;">Event</th>'
            f'<th style="padding:6px 12px;text-align:left;color:#666;border-bottom:1px solid #333;font-size:12px;">Severity</th>'
            f'<th style="padding:6px 12px;text-align:left;color:#666;border-bottom:1px solid #333;font-size:12px;">Region</th>'
            f'<th style="padding:6px 12px;text-align:left;color:#666;border-bottom:1px solid #333;font-size:12px;">Mode</th>'
            f'</tr>'
            f'{rows}'
            f'</table>'
            f'</div>'
        )
    else:
        new_events_html = (
            '<div style="margin-top:24px;">'
            '<h3 style="color:#aaa;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">New Events (Last 24h)</h3>'
            '<p style="color:#666;font-style:italic;">No new events in the last 24 hours.</p>'
            '</div>'
        )

    # Escalating events section
    escalating_html = ""
    if digest["escalating"]:
        items = ""
        for ev in digest["escalating"][:10]:
            color = _SEVERITY_COLORS.get(ev["severity"], "#888")
            items += (
                f'<div style="padding:8px 12px;background:#2a1a1a;border-left:3px solid {color};'
                f'border-radius:4px;margin-bottom:6px;">'
                f'<span style="color:#e0e0e0;font-weight:500;">{ev["title"]}</span>'
                f'<span style="color:#888;margin-left:12px;">{ev["region"]}</span>'
                f'<span style="display:inline-block;padding:1px 6px;border-radius:8px;background:{color};'
                f'color:#fff;font-size:10px;font-weight:600;margin-left:8px;">{ev["severity"]}</span>'
                f'</div>'
            )
        escalating_html = (
            f'<div style="margin-top:24px;">'
            f'<h3 style="color:#ef4444;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">'
            f'Escalating Events</h3>'
            f'{items}'
            f'</div>'
        )

    # Overdue tickets warning
    overdue_html = ""
    if digest["overdue_tickets"]:
        ticket_rows = ""
        for t in digest["overdue_tickets"][:10]:
            ticket_rows += (
                f'<tr>'
                f'<td style="padding:4px 12px;color:#e0e0e0;border-bottom:1px solid #2a2a4a;">#{t["id"]}</td>'
                f'<td style="padding:4px 12px;color:#aaa;border-bottom:1px solid #2a2a4a;">{t["owner"]}</td>'
                f'<td style="padding:4px 12px;color:#ef4444;border-bottom:1px solid #2a2a4a;">{t["due_date"]}</td>'
                f'<td style="padding:4px 12px;color:#888;border-bottom:1px solid #2a2a4a;">{t["priority"]}</td>'
                f'</tr>'
            )
        overdue_html = (
            f'<div style="margin-top:24px;padding:16px;background:#2a1a1a;border-radius:6px;border:1px solid #ef4444;">'
            f'<h3 style="color:#ef4444;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">'
            f'Overdue Tickets ({len(digest["overdue_tickets"])})</h3>'
            f'<table style="width:100%;border-collapse:collapse;">'
            f'<tr>'
            f'<th style="padding:4px 12px;text-align:left;color:#666;font-size:12px;">Ticket</th>'
            f'<th style="padding:4px 12px;text-align:left;color:#666;font-size:12px;">Owner</th>'
            f'<th style="padding:4px 12px;text-align:left;color:#666;font-size:12px;">Due Date</th>'
            f'<th style="padding:4px 12px;text-align:left;color:#666;font-size:12px;">Priority</th>'
            f'</tr>'
            f'{ticket_rows}'
            f'</table>'
            f'</div>'
        )

    return f"""\
<div style="font-family:'Segoe UI',Arial,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:0;max-width:680px;margin:0 auto;">
    <!-- Header -->
    <div style="background:#0f0f23;padding:20px 24px;border-radius:8px 8px 0 0;display:flex;align-items:center;">
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/SKF_logo.svg/200px-SKF_logo.svg.png"
             alt="SKF" style="height:28px;margin-right:12px;" />
        <span style="font-size:18px;font-weight:600;color:#fff;">SC Hub Disruption Monitor</span>
    </div>

    <!-- Title -->
    <div style="background:#16213e;padding:20px 24px;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">Daily Risk Briefing</h1>
        <p style="margin:4px 0 0;color:#888;font-size:14px;">{date_str}</p>
    </div>

    <!-- Body -->
    <div style="padding:24px;background:#1a1a2e;">
        <!-- Headline -->
        <p style="color:#e0e0e0;font-size:16px;margin:0 0 20px;line-height:1.5;">{digest["headline"]}</p>

        <!-- Severity Distribution -->
        <h3 style="color:#aaa;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Severity Distribution</h3>
        <div style="width:100%;border-radius:6px;overflow:hidden;font-size:0;background:#2a2a4a;">
            {bar_segments}
        </div>
        <div style="margin-top:8px;color:#888;font-size:12px;">
            Critical: {counts.get("Critical", 0)} &bull;
            High: {counts.get("High", 0)} &bull;
            Medium: {counts.get("Medium", 0)} &bull;
            Low: {counts.get("Low", 0)}
        </div>

        {new_events_html}
        {escalating_html}
        {overdue_html}

        <!-- Dashboard Button -->
        <div style="margin-top:28px;text-align:center;">
            <a href="{DASHBOARD_URL}"
               style="display:inline-block;padding:12px 32px;background:#3b82f6;color:#fff;text-decoration:none;
                      border-radius:6px;font-size:14px;font-weight:600;">
                Open Dashboard
            </a>
        </div>
    </div>

    <!-- Footer -->
    <div style="background:#0f0f23;padding:16px 24px;border-radius:0 0 8px 8px;text-align:center;">
        <p style="margin:0;color:#666;font-size:12px;">
            Generated by SC Hub Disruption Monitor &bull; {digest["generated_at"]}
        </p>
    </div>
</div>"""

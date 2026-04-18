"""User search endpoint -- proxies to MS Graph People API."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query

from ..auth.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


@router.get("/search")
async def search_users(
    q: str = Query(..., min_length=2, max_length=100),
    x_graph_token: str | None = Header(None),
    user: dict[str, Any] = Depends(get_current_user),
) -> list[dict]:
    """Search MS365 directory for users. Requires X-Graph-Token header."""
    if not x_graph_token:
        raise HTTPException(status_code=401, detail="Missing X-Graph-Token header")

    headers = {"Authorization": f"Bearer {x_graph_token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=10) as client:
        # Try People API first (relevance-ranked)
        try:
            resp = await client.get(
                f"{GRAPH_BASE}/me/people",
                headers=headers,
                params={"$search": f'"{q}"', "$top": "8", "$select": "displayName,scoredEmailAddresses,userPrincipalName"},
            )
            if resp.status_code == 200:
                people = resp.json().get("value", [])
                return [
                    {
                        "displayName": p.get("displayName", ""),
                        "email": (p.get("scoredEmailAddresses", [{}])[0].get("address", "")
                                  if p.get("scoredEmailAddresses") else p.get("userPrincipalName", "")),
                    }
                    for p in people
                    if p.get("displayName")
                ]
        except Exception:
            logger.debug("People API failed, falling back to directory search")

        # Fallback: directory search
        try:
            resp = await client.get(
                f"{GRAPH_BASE}/users",
                headers={**headers, "ConsistencyLevel": "eventual"},
                params={"$search": f'"displayName:{q}"', "$top": "8", "$select": "displayName,mail,userPrincipalName"},
            )
            if resp.status_code == 200:
                users = resp.json().get("value", [])
                return [
                    {
                        "displayName": u.get("displayName", ""),
                        "email": u.get("mail", "") or u.get("userPrincipalName", ""),
                    }
                    for u in users
                    if u.get("displayName")
                ]
        except Exception:
            logger.debug("Directory search also failed")

    return []

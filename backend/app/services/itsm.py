"""Abstract ITSM (IT Service Management) bridge interface.

Defines the contract for integrating with external ticketing systems
like ServiceNow or Jira. The active implementation is selected via
TARS_ITSM_PROVIDER config (none | servicenow | jira).

Usage:
    from ..services.itsm import get_itsm_bridge
    bridge = get_itsm_bridge()
    result = await bridge.create_ticket(event_id="...", title="...", ...)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional

from ..config import settings


class ITSMBridge(ABC):
    """Abstract interface for external ITSM integration.

    All methods are async to support HTTP-based integrations
    (ServiceNow REST API, Jira Cloud API, etc.).
    """

    @abstractmethod
    async def create_ticket(
        self,
        event_id: str,
        title: str,
        description: str = "",
        priority: str = "normal",
        assignee: str | None = None,
        labels: list[str] | None = None,
        **kwargs: Any,
    ) -> dict:
        """Create a ticket in the external ITSM system.

        Returns a dict with at least:
            external_id: str  -- ticket ID in the external system
            url: str | None   -- deep link to the ticket
            status: str       -- initial status in the external system
        """
        ...

    @abstractmethod
    async def update_ticket(
        self,
        external_id: str,
        status: str | None = None,
        assignee: str | None = None,
        comment: str | None = None,
        priority: str | None = None,
    ) -> dict:
        """Update a ticket in the external ITSM system."""
        ...

    @abstractmethod
    async def sync_status(self, external_id: str) -> dict:
        """Fetch current status of a ticket from the external system.

        Returns a dict with at least:
            external_id: str
            status: str
            assignee: str | None
            updated_at: str | None
        """
        ...

    @abstractmethod
    async def list_tickets(
        self,
        query: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """List tickets from the external ITSM system."""
        ...


def get_itsm_bridge() -> ITSMBridge:
    """Return the configured ITSM bridge implementation.

    Reads TARS_ITSM_PROVIDER from config:
        "none"/"stub"  -> ITSMStub (logs only, no external calls)
        "servicenow"   -> ServiceNowBridge (TODO: implement)
        "jira"         -> JiraBridge (TODO: implement)
    """
    provider = getattr(settings, "itsm_provider", "none").lower()

    if provider == "servicenow":
        # TODO: from .itsm_servicenow import ServiceNowBridge
        # return ServiceNowBridge(base_url=settings.itsm_base_url, api_key=settings.itsm_api_key)
        raise NotImplementedError("ServiceNow integration not yet implemented. Set TARS_ITSM_PROVIDER=none to use stub.")

    if provider == "jira":
        # TODO: from .itsm_jira import JiraBridge
        # return JiraBridge(base_url=settings.itsm_base_url, api_key=settings.itsm_api_key)
        raise NotImplementedError("Jira integration not yet implemented. Set TARS_ITSM_PROVIDER=none to use stub.")

    # Default: stub implementation (covers "none", "stub", and any unrecognized value)
    from .itsm_stub import ITSMStub
    return ITSMStub()


# Aliases for tests that import by alternative names
get_provider = get_itsm_bridge
get_itsm_provider = get_itsm_bridge

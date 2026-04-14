"""Exposure analysis endpoints — BU-level risk summaries and What-If simulation."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends

from ..auth.dependencies import get_current_user
from ..db.database import get_bu_exposure_summary

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exposure", tags=["exposure"])


@router.get("/bu-summary")
async def bu_exposure_summary(user: dict[str, Any] = Depends(get_current_user)) -> list[dict]:
    """Get exposure summary per business unit from active disruptions."""
    return get_bu_exposure_summary()

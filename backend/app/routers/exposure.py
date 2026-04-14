"""Exposure analysis endpoints — BU-level risk summaries and What-If simulation."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends

from ..auth.dependencies import get_current_user
from pydantic import BaseModel

from ..db.database import get_bu_exposure_summary, simulate_what_if

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exposure", tags=["exposure"])


class WhatIfRequest(BaseModel):
    scenario_type: str = "region_disruption"
    target: str
    duration_weeks: int = 2


@router.get("/bu-summary")
async def bu_exposure_summary(user: dict[str, Any] = Depends(get_current_user)) -> list[dict]:
    """Get exposure summary per business unit from active disruptions."""
    return get_bu_exposure_summary()


@router.post("/what-if")
async def run_what_if(req: WhatIfRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict:
    """Simulate a supply chain disruption scenario."""
    return simulate_what_if(scenario_type=req.scenario_type, target=req.target, duration_weeks=req.duration_weeks)

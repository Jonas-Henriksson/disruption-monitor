"""Shared geographic utility functions.

Consolidates haversine distance calculation previously duplicated across
scanner.py, severity.py, and dedup.py (see ADR-012).
"""

from __future__ import annotations

import math


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km between two lat/lng points.

    Uses the Haversine formula with Earth radius = 6371 km.
    """
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

"""Event deduplication helper.

Detects when two events are likely the same disruption:
- Similar title (fuzzy match)
- Same or adjacent region
- Within 500km of each other

Returns merge suggestions rather than auto-merging.
"""

from __future__ import annotations

import re
from typing import Any

from ..utils.geo import haversine_km


# ── Distance threshold for duplicate detection ──────────────────
_DEDUP_RADIUS_KM = 500.0


_haversine_km = haversine_km


def _normalize_title(text: str) -> str:
    """Normalize an event title for comparison: lowercase, strip punctuation, collapse whitespace."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def _word_set(text: str) -> set[str]:
    """Extract significant words (length >= 3) from normalized text."""
    return {w for w in _normalize_title(text).split() if len(w) >= 3}


def _title_similarity(title_a: str, title_b: str) -> float:
    """Compute Jaccard similarity between two event titles.

    Returns 0.0 (no overlap) to 1.0 (identical word sets).
    """
    words_a = _word_set(title_a)
    words_b = _word_set(title_b)
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union)


# Regions that should be considered "adjacent" for dedup purposes
_ADJACENT_REGIONS: dict[str, set[str]] = {
    "Europe": {"Europe", "Middle East"},
    "Middle East": {"Middle East", "Europe", "Africa", "India"},
    "Africa": {"Africa", "Middle East", "Europe"},
    "India": {"India", "Middle East", "China"},
    "China": {"China", "India", "Global"},
    "Americas": {"Americas", "Global"},
    "Global": {"Global", "Europe", "Americas", "China", "India", "Middle East", "Africa"},
}


def _regions_compatible(region_a: str, region_b: str) -> bool:
    """Check if two regions are the same or adjacent."""
    if region_a == region_b:
        return True
    adjacent = _ADJACENT_REGIONS.get(region_a, {region_a})
    return region_b in adjacent


def find_duplicates(
    new_event: dict,
    existing_events: list[dict],
    title_threshold: float = 0.4,
) -> list[dict[str, Any]]:
    """Find potential duplicates for a new event among existing events.

    Args:
        new_event: Event dict to check (needs title field + lat/lng/region).
        existing_events: List of existing event dicts to compare against.
        title_threshold: Minimum Jaccard similarity to consider (default 0.4).

    Returns:
        List of match dicts: [{
            "existing_event_id": str,
            "existing_title": str,
            "similarity": float (0-1),
            "distance_km": float,
            "reason": str,
        }], sorted by similarity descending.
    """
    new_title = new_event.get("event") or new_event.get("risk", "")
    new_lat = new_event.get("lat")
    new_lng = new_event.get("lng")
    new_region = new_event.get("region", "Global")

    if not new_title:
        return []

    matches = []

    for existing in existing_events:
        existing_id = existing.get("id", "")
        existing_title = existing.get("event") or existing.get("risk", "")
        if not existing_title:
            continue

        # Skip self-comparison
        if existing_id and existing_id == new_event.get("id"):
            continue

        # 1. Title similarity
        sim = _title_similarity(new_title, existing_title)
        if sim < title_threshold:
            continue

        # 2. Region compatibility
        existing_region = existing.get("region", "Global")
        if not _regions_compatible(new_region, existing_region):
            continue

        # 3. Geographic proximity
        existing_lat = existing.get("lat")
        existing_lng = existing.get("lng")
        distance = None
        if all(v is not None for v in [new_lat, new_lng, existing_lat, existing_lng]):
            distance = _haversine_km(new_lat, new_lng, existing_lat, existing_lng)
            if distance > _DEDUP_RADIUS_KM:
                continue
        # If we can't compute distance, rely on title+region match alone
        # but require higher title similarity
        elif sim < 0.6:
            continue

        # Build reason string
        reasons = [f"title similarity {sim:.0%}"]
        if new_region == existing_region:
            reasons.append(f"same region ({new_region})")
        else:
            reasons.append(f"adjacent regions ({new_region}/{existing_region})")
        if distance is not None:
            reasons.append(f"{distance:.0f}km apart")

        matches.append({
            "existing_event_id": existing_id,
            "existing_title": existing_title,
            "similarity": round(sim, 3),
            "distance_km": round(distance, 1) if distance is not None else None,
            "reason": "; ".join(reasons),
        })

    matches.sort(key=lambda m: m["similarity"], reverse=True)
    return matches


def find_cross_mode_related(
    new_events: list[dict],
    new_mode: str,
    all_active_events: list[dict],
    title_threshold: float = 0.35,
) -> dict[str, list[dict]]:
    """Find cross-mode related events for newly scanned items.

    Compares each event in *new_events* (from *new_mode*) against
    *all_active_events* from ALL modes.  Only returns linkages where
    the existing event comes from a **different** mode.

    Returns:
        Mapping of new_event_id -> list of related-event dicts:
        [{event_id, mode, similarity, similarity_reason}]
    """
    related_map: dict[str, list[dict]] = {}

    for new_evt in new_events:
        new_id = new_evt.get("id", "")
        new_title = new_evt.get("event") or new_evt.get("risk", "")
        if not new_title:
            continue

        links: list[dict] = []
        for existing in all_active_events:
            existing_id = existing.get("id", "")
            existing_mode = existing.get("_mode", "")

            # Only cross-mode linkages
            if existing_mode == new_mode:
                continue
            # Skip self
            if existing_id == new_id:
                continue

            existing_title = existing.get("event") or existing.get("risk", "")
            if not existing_title:
                continue

            sim = _title_similarity(new_title, existing_title)
            if sim < title_threshold:
                continue

            # Region compatibility check
            new_region = new_evt.get("region", "Global")
            existing_region = existing.get("region", "Global")
            if not _regions_compatible(new_region, existing_region):
                continue

            # Build reason
            reasons = [f"title similarity {sim:.0%}"]
            if new_region == existing_region:
                reasons.append(f"same region ({new_region})")
            else:
                reasons.append(f"adjacent regions ({new_region}/{existing_region})")

            links.append({
                "event_id": existing_id,
                "mode": existing_mode,
                "similarity": round(sim, 3),
                "similarity_reason": "; ".join(reasons),
            })

        if links:
            links.sort(key=lambda x: x["similarity"], reverse=True)
            related_map[new_id] = links

    return related_map


def tag_duplicates(
    events: list[dict],
    title_threshold: float = 0.4,
) -> list[dict]:
    """Scan a list of events and tag potential duplicates.

    Adds a `possible_duplicate_of` field to events that match an earlier event
    in the list. Does NOT remove or merge events — only suggests.

    Returns the same list, mutated with duplicate tags where appropriate.
    """
    for i, event in enumerate(events):
        # Compare against all prior events (earlier = higher priority)
        prior = events[:i]
        if not prior:
            continue

        matches = find_duplicates(event, prior, title_threshold=title_threshold)
        if matches:
            # Tag with the best match
            best = matches[0]
            event["possible_duplicate_of"] = best["existing_event_id"]
            event["duplicate_reason"] = best["reason"]
            event["duplicate_similarity"] = best["similarity"]

    return events

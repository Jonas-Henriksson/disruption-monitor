"""Seed the SQLite database with sample data from JSON files.

Run once on first startup, or when the DB is empty.
"""

from __future__ import annotations

import logging

from ..data import load_disruptions, load_geopolitical, load_trade
from ..db.database import get_db, upsert_event
from ..services.severity import compute_severity_score
from ..services.dedup import tag_duplicates

logger = logging.getLogger(__name__)

SEED_SCAN_ID = "seed-initial"


def seed_if_empty() -> int:
    """Seed the database with sample JSON data if the events table is empty.

    Returns the number of events seeded.
    """
    with get_db() as conn:
        count = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        if count > 0:
            logger.info("Database already has %d events, skipping seed", count)
            return 0

    total = 0
    for mode, loader in [
        ("disruptions", load_disruptions),
        ("geopolitical", load_geopolitical),
        ("trade", load_trade),
    ]:
        items = loader()

        # Compute algorithmic severity scores for seed data
        for item in items:
            item["computed_severity"] = compute_severity_score(item)

        # Tag potential duplicates within each mode
        tag_duplicates(items)

        for item in items:
            event_id = item.get("id", f"{mode}-unknown")
            upsert_event(event_id, mode, item, SEED_SCAN_ID)
            total += 1

    logger.info("Seeded database with %d events", total)
    return total

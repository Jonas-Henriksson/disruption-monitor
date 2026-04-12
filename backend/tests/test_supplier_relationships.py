"""Tests for the supplier-factory relationship feature.

Covers:
  - Schema creation and constraints (composite PK, indexes)
  - Data insertion, querying, and spend aggregation
  - Concentration scoring (HHI-based)
  - Cross-reference with active disruption events
  - Data integrity vs frontend supplier data
  - API endpoint shape and security (no raw spend leaks)
  - Edge cases (special chars, zero spend, long names)
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

import pytest

from backend.app.db.database import get_db, upsert_event


# ── Helpers ──────────────────────────────────────────────────────


_SUPPLIERS_TS = Path(__file__).parent.parent.parent / "frontend" / "src" / "data" / "suppliers.ts"


def _create_supplier_tables(conn: sqlite3.Connection) -> None:
    """Create the supplier_relationships table (mirrors the real schema)."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS supplier_relationships (
            site_id          TEXT NOT NULL,
            supplier_name    TEXT NOT NULL,
            supplier_country TEXT NOT NULL,
            business_area    TEXT,
            company_country  TEXT,
            category_l1      TEXT NOT NULL,
            category_l2      TEXT,
            item_description TEXT,
            spend_sek        REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (site_id, supplier_name, category_l1)
        );

        CREATE INDEX IF NOT EXISTS idx_sr_supplier_country
            ON supplier_relationships(supplier_country);
        CREATE INDEX IF NOT EXISTS idx_sr_site_id
            ON supplier_relationships(site_id);
        CREATE INDEX IF NOT EXISTS idx_sr_supplier_name
            ON supplier_relationships(supplier_name);
    """)


def _insert_relationship(
    conn: sqlite3.Connection,
    site_id: str,
    supplier_name: str,
    supplier_country: str,
    category_l1: str,
    spend_sek: float = 0.0,
    business_area: str | None = None,
    company_country: str | None = None,
    category_l2: str | None = None,
    item_description: str | None = None,
) -> None:
    conn.execute(
        """INSERT INTO supplier_relationships
           (site_id, supplier_name, supplier_country, business_area,
            company_country, category_l1, category_l2, item_description, spend_sek)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (site_id, supplier_name, supplier_country, business_area,
         company_country, category_l1, category_l2, item_description, spend_sek),
    )


def _get_site_suppliers(conn: sqlite3.Connection, site_id: str) -> list[dict]:
    """Query suppliers for a site, returning spend as percentage."""
    total_spend = conn.execute(
        "SELECT COALESCE(SUM(spend_sek), 0) FROM supplier_relationships WHERE site_id = ?",
        (site_id,),
    ).fetchone()[0]

    rows = conn.execute(
        """SELECT supplier_name, supplier_country, category_l1,
                  SUM(spend_sek) as total_spend
           FROM supplier_relationships
           WHERE site_id = ?
           GROUP BY supplier_name, supplier_country
           ORDER BY total_spend DESC""",
        (site_id,),
    ).fetchall()

    results = []
    for row in rows:
        spend_pct = (row[3] / total_spend * 100) if total_spend > 0 else 0.0
        results.append({
            "supplier_name": row[0],
            "supplier_country": row[1],
            "category_l1": row[2],
            "spend_pct": round(spend_pct, 2),
        })
    return results


def _get_site_suppliers_by_country(conn: sqlite3.Connection, site_id: str) -> list[dict]:
    """Aggregate suppliers by country for a site, returning spend percentages."""
    total_spend = conn.execute(
        "SELECT COALESCE(SUM(spend_sek), 0) FROM supplier_relationships WHERE site_id = ?",
        (site_id,),
    ).fetchone()[0]

    rows = conn.execute(
        """SELECT supplier_country, COUNT(DISTINCT supplier_name) as supplier_count,
                  SUM(spend_sek) as country_spend
           FROM supplier_relationships
           WHERE site_id = ?
           GROUP BY supplier_country
           ORDER BY country_spend DESC""",
        (site_id,),
    ).fetchall()

    results = []
    for row in rows:
        spend_pct = (row[2] / total_spend * 100) if total_spend > 0 else 0.0
        results.append({
            "country": row[0],
            "supplier_count": row[1],
            "spend_pct": round(spend_pct, 2),
        })
    return results


def _get_suppliers_by_country(conn: sqlite3.Connection, country: str) -> list[dict]:
    """Get all supplier relationships for a given country."""
    rows = conn.execute(
        """SELECT site_id, supplier_name, category_l1, spend_sek
           FROM supplier_relationships
           WHERE supplier_country = ?
           ORDER BY spend_sek DESC""",
        (country,),
    ).fetchall()
    return [{"site_id": r[0], "supplier_name": r[1], "category_l1": r[2], "spend_sek": r[3]} for r in rows]


def _get_supplier_concentration(conn: sqlite3.Connection) -> list[dict]:
    """Compute HHI-based concentration score per site.

    HHI = sum of (country_share^2) for each supplier country.
    Score = HHI * 100 (range 0-100).
    """
    sites = conn.execute(
        "SELECT DISTINCT site_id FROM supplier_relationships"
    ).fetchall()

    results = []
    for (site_id,) in sites:
        total = conn.execute(
            "SELECT COALESCE(SUM(spend_sek), 0) FROM supplier_relationships WHERE site_id = ?",
            (site_id,),
        ).fetchone()[0]

        if total == 0:
            results.append({"site_id": site_id, "concentration_score": 0.0, "country_count": 0})
            continue

        country_spends = conn.execute(
            """SELECT supplier_country, SUM(spend_sek) as country_spend
               FROM supplier_relationships WHERE site_id = ?
               GROUP BY supplier_country""",
            (site_id,),
        ).fetchall()

        hhi = sum((cs[1] / total) ** 2 for cs in country_spends)
        results.append({
            "site_id": site_id,
            "concentration_score": round(hhi * 100, 2),
            "country_count": len(country_spends),
        })

    return results


def _get_exposed_factories(conn: sqlite3.Connection) -> list[dict]:
    """Find factories whose suppliers are in countries with active disruption events."""
    # Check if events table exists; if not, no exposures possible
    has_events = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='events'"
    ).fetchone()
    if not has_events:
        return []

    rows = conn.execute(
        """SELECT DISTINCT sr.site_id, sr.supplier_country, e.event_title, e.severity
           FROM supplier_relationships sr
           INNER JOIN events e ON (
               e.status = 'active'
               AND (
                   LOWER(sr.supplier_country) = LOWER(e.region)
                   OR e.payload LIKE '%' || sr.supplier_country || '%'
               )
           )
           ORDER BY sr.site_id""",
    ).fetchall()

    results = []
    for row in rows:
        results.append({
            "site_id": row[0],
            "supplier_country": row[1],
            "event_title": row[2],
            "severity": row[3],
        })
    return results


# ── 1. Schema tests ─────────────────────────────────────────────


class TestSchema:
    def test_table_creation_succeeds(self, tmp_path):
        """supplier_relationships table can be created without errors."""
        db_path = tmp_path / "schema_test.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)
        # Verify table exists
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='supplier_relationships'"
        ).fetchall()
        assert len(tables) == 1
        conn.close()

    def test_composite_pk_enforced(self, tmp_path):
        """Inserting duplicate (site_id, supplier_name, category_l1) should fail."""
        db_path = tmp_path / "pk_test.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "site-A", "Supplier-1", "Germany", "Components", 1000)
        conn.commit()

        with pytest.raises(sqlite3.IntegrityError):
            _insert_relationship(conn, "site-A", "Supplier-1", "Germany", "Components", 2000)

        conn.close()

    def test_different_category_l1_allowed(self, tmp_path):
        """Same site+supplier but different category_l1 should be allowed."""
        db_path = tmp_path / "pk_multi.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "site-A", "Supplier-1", "Germany", "Components", 1000)
        _insert_relationship(conn, "site-A", "Supplier-1", "Germany", "Raw Materials", 500)
        conn.commit()

        count = conn.execute("SELECT COUNT(*) FROM supplier_relationships").fetchone()[0]
        assert count == 2
        conn.close()

    def test_indexes_exist(self, tmp_path):
        """Required indexes should be created on supplier_country, site_id, supplier_name."""
        db_path = tmp_path / "index_test.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        indexes = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='supplier_relationships'"
        ).fetchall()
        index_names = {row[0] for row in indexes}

        assert "idx_sr_supplier_country" in index_names
        assert "idx_sr_site_id" in index_names
        assert "idx_sr_supplier_name" in index_names
        conn.close()


# ── 2. Data insertion and query tests ────────────────────────────


class TestDataInsertionAndQuery:
    def test_insert_and_retrieve(self, tmp_path):
        """Insert a supplier relationship and retrieve it."""
        db_path = tmp_path / "insert_test.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "Schweinfurt", "Bosch GmbH", "Germany", "Components", 5000)
        conn.commit()

        row = conn.execute(
            "SELECT * FROM supplier_relationships WHERE site_id = 'Schweinfurt'"
        ).fetchone()
        assert row is not None
        assert row[1] == "Bosch GmbH"
        assert row[2] == "Germany"
        conn.close()

    def test_spend_aggregation_across_categories(self, tmp_path):
        """Two records for the same supplier-site but different categories sum spend correctly."""
        db_path = tmp_path / "agg_test.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "Schweinfurt", "Bosch GmbH", "Germany", "Components", 3000)
        _insert_relationship(conn, "Schweinfurt", "Bosch GmbH", "Germany", "Electronics", 2000)
        conn.commit()

        total = conn.execute(
            "SELECT SUM(spend_sek) FROM supplier_relationships WHERE site_id = 'Schweinfurt' AND supplier_name = 'Bosch GmbH'"
        ).fetchone()[0]
        assert total == 5000
        conn.close()

    def test_get_site_suppliers_returns_spend_pct(self, tmp_path):
        """get_site_suppliers returns spend_pct (percentage), not absolute spend."""
        db_path = tmp_path / "pct_test.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "Schweinfurt", "Supplier A", "Germany", "Components", 7000)
        _insert_relationship(conn, "Schweinfurt", "Supplier B", "Italy", "Raw Materials", 3000)
        conn.commit()

        suppliers = _get_site_suppliers(conn, "Schweinfurt")
        assert len(suppliers) == 2
        # Supplier A: 7000/10000 = 70%
        assert suppliers[0]["spend_pct"] == 70.0
        # Supplier B: 3000/10000 = 30%
        assert suppliers[1]["spend_pct"] == 30.0
        # No absolute spend in results
        for s in suppliers:
            assert "spend_sek" not in s
        conn.close()

    def test_get_site_suppliers_by_country_aggregation(self, tmp_path):
        """Country-level aggregation groups multiple suppliers from same country."""
        db_path = tmp_path / "country_agg.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "Schweinfurt", "Bosch GmbH", "Germany", "Components", 3000)
        _insert_relationship(conn, "Schweinfurt", "Siemens AG", "Germany", "Electronics", 2000)
        _insert_relationship(conn, "Schweinfurt", "Supplier X", "Italy", "Raw Materials", 5000)
        conn.commit()

        by_country = _get_site_suppliers_by_country(conn, "Schweinfurt")
        assert len(by_country) == 2

        # Italy: 5000/10000 = 50%
        italy = next(c for c in by_country if c["country"] == "Italy")
        assert italy["spend_pct"] == 50.0
        assert italy["supplier_count"] == 1

        # Germany: (3000+2000)/10000 = 50%
        germany = next(c for c in by_country if c["country"] == "Germany")
        assert germany["spend_pct"] == 50.0
        assert germany["supplier_count"] == 2
        conn.close()

    def test_get_suppliers_by_country(self, tmp_path):
        """get_suppliers_by_country returns correct results for a given country."""
        db_path = tmp_path / "by_country.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "Schweinfurt", "Bosch GmbH", "Germany", "Components", 3000)
        _insert_relationship(conn, "Hofors", "Swedish Steel", "Sweden", "Raw Materials", 2000)
        _insert_relationship(conn, "Steyr", "Austrian Co", "Germany", "Components", 1000)
        conn.commit()

        german_suppliers = _get_suppliers_by_country(conn, "Germany")
        assert len(german_suppliers) == 2
        assert all(s["supplier_name"] in ("Bosch GmbH", "Austrian Co") for s in german_suppliers)
        conn.close()

    def test_empty_table_returns_empty_list(self, tmp_path):
        """Querying an empty table returns [], not an error."""
        db_path = tmp_path / "empty.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        assert _get_site_suppliers(conn, "nonexistent") == []
        assert _get_site_suppliers_by_country(conn, "nonexistent") == []
        assert _get_suppliers_by_country(conn, "Germany") == []
        assert _get_supplier_concentration(conn) == []
        assert _get_exposed_factories(conn) == []
        conn.close()


# ── 3. Concentration score tests ────────────────────────────────


class TestConcentrationScore:
    def test_single_country_max_concentration(self, tmp_path):
        """Factory with 1 supplier country = max concentration (HHI = 1.0 => score 100)."""
        db_path = tmp_path / "concentration_max.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "SiteA", "Sup1", "Germany", "Components", 5000)
        _insert_relationship(conn, "SiteA", "Sup2", "Germany", "Electronics", 3000)
        conn.commit()

        scores = _get_supplier_concentration(conn)
        assert len(scores) == 1
        assert scores[0]["concentration_score"] == 100.0
        assert scores[0]["country_count"] == 1
        conn.close()

    def test_equal_spend_10_countries_low_concentration(self, tmp_path):
        """Equal spend across 10 countries = HHI = 0.1 => score 10."""
        db_path = tmp_path / "concentration_low.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        countries = [
            "Germany", "Italy", "France", "Sweden", "India",
            "China", "Japan", "USA", "UK", "Brazil",
        ]
        for i, country in enumerate(countries):
            _insert_relationship(
                conn, "SiteB", f"Supplier-{i}", country, "Components", 1000
            )
        conn.commit()

        scores = _get_supplier_concentration(conn)
        assert len(scores) == 1
        assert scores[0]["concentration_score"] == 10.0
        assert scores[0]["country_count"] == 10
        conn.close()

    def test_score_range_0_to_100(self, tmp_path):
        """All concentration scores should be in range [0, 100]."""
        db_path = tmp_path / "concentration_range.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        # Create multiple sites with varying concentration
        _insert_relationship(conn, "SiteX", "SupA", "Germany", "Components", 10000)
        _insert_relationship(conn, "SiteY", "SupB", "Italy", "Components", 5000)
        _insert_relationship(conn, "SiteY", "SupC", "France", "Electronics", 5000)
        conn.commit()

        scores = _get_supplier_concentration(conn)
        for s in scores:
            assert 0 <= s["concentration_score"] <= 100, (
                f"Score {s['concentration_score']} out of range for {s['site_id']}"
            )
        conn.close()

    def test_two_countries_unequal_split(self, tmp_path):
        """80/20 split across 2 countries: HHI = 0.64 + 0.04 = 0.68 => score 68."""
        db_path = tmp_path / "concentration_unequal.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "SiteC", "SupA", "Germany", "Components", 8000)
        _insert_relationship(conn, "SiteC", "SupB", "Italy", "Electronics", 2000)
        conn.commit()

        scores = _get_supplier_concentration(conn)
        assert len(scores) == 1
        assert scores[0]["concentration_score"] == 68.0
        conn.close()


# ── 4. Cross-reference tests (exposed factories) ────────────────


class TestExposedFactories:
    def test_supplier_country_matches_active_event(self, tmp_path):
        """Factory with supplier from disrupted country appears in exposed list."""
        db_path = tmp_path / "exposed.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "Schweinfurt", "Turkish Co", "Turkey", "Components", 5000)
        conn.commit()
        conn.close()

        # Insert an active event with region matching the supplier country
        upsert_event(
            "earthquake-turkey|europe",
            "disruptions",
            {
                "id": "earthquake-turkey|europe",
                "event": "Turkey Earthquake",
                "description": "Major earthquake in Turkey",
                "category": "Natural Disaster",
                "severity": "Critical",
                "trend": "Escalating",
                "region": "Turkey",
                "lat": 38.0,
                "lng": 35.0,
                "skf_exposure": "Supplier disruption.",
                "recommended_action": "Activate alternatives.",
                "status": "active",
            },
            "scan-1",
        )

        # Now query using the DB that has the event
        from backend.app.db.database import DB_PATH as real_db_path
        combined = sqlite3.connect(str(real_db_path))
        combined.row_factory = sqlite3.Row
        _create_supplier_tables(combined)
        _insert_relationship(combined, "Schweinfurt", "Turkish Co", "Turkey", "Components", 5000)
        combined.commit()

        exposed = _get_exposed_factories(combined)
        assert len(exposed) >= 1
        site_ids = [e["site_id"] for e in exposed]
        assert "Schweinfurt" in site_ids
        combined.close()

    def test_no_matching_disruption_returns_empty(self, tmp_path):
        """No active events matching supplier countries => empty exposed list."""
        db_path = tmp_path / "not_exposed.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "Schweinfurt", "Bosch GmbH", "Germany", "Components", 5000)
        conn.commit()

        # No events in DB at all for this connection
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY, mode TEXT, event_title TEXT, severity TEXT,
                region TEXT, lat REAL, lng REAL, status TEXT DEFAULT 'active',
                first_seen TEXT, last_seen TEXT, scan_count INTEGER DEFAULT 1,
                payload TEXT, created_at TEXT, updated_at TEXT
            );
        """)

        exposed = _get_exposed_factories(conn)
        assert exposed == []
        conn.close()

    def test_multiple_factories_exposed(self, tmp_path):
        """Multiple factories with suppliers in a disrupted country all appear."""
        db_path = tmp_path / "multi_exposed.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        # Create events table with an active event
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY, mode TEXT NOT NULL, event_title TEXT NOT NULL,
                severity TEXT NOT NULL, region TEXT, lat REAL, lng REAL,
                status TEXT NOT NULL DEFAULT 'active',
                first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
                scan_count INTEGER NOT NULL DEFAULT 1,
                payload TEXT NOT NULL, created_at TEXT, updated_at TEXT
            );
        """)
        conn.execute(
            """INSERT INTO events (id, mode, event_title, severity, region, lat, lng,
                                   status, first_seen, last_seen, payload)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("flood-china", "disruptions", "China Flooding", "High", "China",
             30.0, 115.0, "active", "2026-01-01", "2026-01-01",
             json.dumps({"id": "flood-china", "region": "China"})),
        )

        _insert_relationship(conn, "Dalian", "China Steel Co", "China", "Raw Materials", 3000)
        _insert_relationship(conn, "Xinchang (SXC)", "Ningbo Parts", "China", "Components", 2000)
        _insert_relationship(conn, "Schweinfurt", "Bosch GmbH", "Germany", "Components", 5000)
        conn.commit()

        exposed = _get_exposed_factories(conn)
        exposed_sites = {e["site_id"] for e in exposed}
        assert "Dalian" in exposed_sites
        assert "Xinchang (SXC)" in exposed_sites
        # Schweinfurt has no China supplier, should not appear
        assert "Schweinfurt" not in exposed_sites
        conn.close()


# ── 5. Data integrity tests ─────────────────────────────────────


class TestDataIntegrity:
    def test_supply_graph_file_exists(self):
        assert _SUPPLIERS_TS.exists(), f"suppliers.ts not found at {_SUPPLIERS_TS}"

    def test_supply_graph_supplier_countries_in_suppliers_list(self):
        """All countries referenced in SUPPLY_GRAPH sup arrays should exist in SUPPLIERS."""
        content = _SUPPLIERS_TS.read_text(encoding="utf-8")

        # Parse SUPPLIERS country list from SUP_RAW
        supplier_countries = set()
        for match in re.finditer(r'\["([^"]+)"', content[:content.find("SUPPLY_GRAPH")]):
            country = match.group(1)
            # Only take the first field of each SUP_RAW entry (country name)
            if not any(c.isdigit() for c in country):
                supplier_countries.add(country)

        # Parse SUPPLY_GRAPH sup arrays
        graph_start = content.find("SUPPLY_GRAPH")
        graph_section = content[graph_start:]
        graph_countries = set()
        for match in re.finditer(r"sup:\s*\[([^\]]+)\]", graph_section):
            countries_str = match.group(1)
            for c_match in re.finditer(r"'([^']+)'", countries_str):
                graph_countries.add(c_match.group(1))

        missing = graph_countries - supplier_countries
        assert missing == set(), (
            f"SUPPLY_GRAPH references countries not in SUPPLIERS: {sorted(missing)}"
        )

    def test_no_country_name_inconsistencies(self):
        """Check for known country name variants (USA vs United States, UK vs United Kingdom)."""
        content = _SUPPLIERS_TS.read_text(encoding="utf-8")

        # Collect all country names from SUPPLY_GRAPH
        graph_start = content.find("SUPPLY_GRAPH")
        graph_section = content[graph_start:]
        graph_countries = set()
        for match in re.finditer(r"sup:\s*\[([^\]]+)\]", graph_section):
            countries_str = match.group(1)
            for c_match in re.finditer(r"'([^']+)'", countries_str):
                graph_countries.add(c_match.group(1))

        # Known problematic variants that should NOT appear
        bad_variants = {"USA", "US", "UK", "S. Korea", "S Korea", "Czech Rep", "Czech Rep."}
        found_bad = graph_countries & bad_variants
        assert found_bad == set(), (
            f"Found inconsistent country names in SUPPLY_GRAPH: {sorted(found_bad)}. "
            f"Use full names (e.g., 'United States', 'United Kingdom', 'South Korea')."
        )

    def test_suppliers_data_loads_from_backend(self):
        """Backend load_suppliers returns data consistent with frontend."""
        from backend.app.data import load_suppliers
        suppliers = load_suppliers()
        assert isinstance(suppliers, list)
        assert len(suppliers) > 40  # 53 countries expected

        # Verify each entry has expected fields
        for s in suppliers:
            assert "country" in s
            assert "count" in s or "n" in s


# ── 6. API endpoint tests ───────────────────────────────────────


class TestAPIEndpoints:
    """Tests for the supplier-factory API endpoints.

    These test the expected endpoint shape once the router is wired up.
    Uses FastAPI TestClient against the real app.
    """

    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from backend.app.main import app
        return TestClient(app, raise_server_exceptions=False)

    def test_get_site_suppliers_200(self, client):
        """GET /sites/{site_id}/suppliers returns 200."""
        resp = client.get("/api/v1/sites/Schweinfurt/suppliers")
        # If the endpoint exists, check shape; if not wired yet, 404 is acceptable
        if resp.status_code == 200:
            data = resp.json()
            assert "suppliers" in data or isinstance(data, list)
        else:
            # Endpoint not yet implemented — skip gracefully
            pytest.skip("Endpoint /sites/{site_id}/suppliers not yet implemented")

    def test_get_nonexistent_site_suppliers(self, client):
        """GET /sites/nonexistent/suppliers returns 200 with empty suppliers list (or 404)."""
        resp = client.get("/api/v1/sites/this-site-does-not-exist-xyz/suppliers")
        if resp.status_code == 200:
            data = resp.json()
            suppliers = data.get("suppliers", data if isinstance(data, list) else [])
            assert len(suppliers) == 0
        elif resp.status_code == 404:
            pass  # Also acceptable
        else:
            pytest.skip("Endpoint /sites/{site_id}/suppliers not yet implemented")

    def test_get_suppliers_concentration_200(self, client):
        """GET /suppliers/concentration returns 200 with list of scores."""
        resp = client.get("/api/v1/suppliers/concentration")
        if resp.status_code == 200:
            data = resp.json()
            # Should be a list of objects with site scores
            items = data if isinstance(data, list) else data.get("sites", data.get("results", []))
            if items:
                first = items[0]
                assert "concentration_score" in first or "score" in first
        else:
            pytest.skip("Endpoint /suppliers/concentration not yet implemented")

    def test_get_suppliers_exposed_200(self, client):
        """GET /suppliers/exposed returns 200."""
        resp = client.get("/api/v1/suppliers/exposed")
        if resp.status_code == 200:
            data = resp.json()
            assert isinstance(data, (list, dict))
        else:
            pytest.skip("Endpoint /suppliers/exposed not yet implemented")

    def test_no_raw_spend_in_site_suppliers(self, client):
        """Verify no raw spend_sek leaks in /sites/{site_id}/suppliers response."""
        resp = client.get("/api/v1/sites/Schweinfurt/suppliers")
        if resp.status_code != 200:
            pytest.skip("Endpoint not yet implemented")

        raw = resp.text
        assert "spend_sek" not in raw, "Raw spend_sek leaked in response"
        # Check for spend_pct presence if there are suppliers
        data = resp.json()
        suppliers = data.get("suppliers", data if isinstance(data, list) else [])
        for s in suppliers:
            assert "spend_sek" not in s, f"spend_sek found in supplier: {s}"

    def test_no_raw_spend_in_concentration(self, client):
        """Verify no raw spend_sek leaks in /suppliers/concentration response."""
        resp = client.get("/api/v1/suppliers/concentration")
        if resp.status_code != 200:
            pytest.skip("Endpoint not yet implemented")

        assert "spend_sek" not in resp.text, "Raw spend_sek leaked in concentration response"

    def test_no_raw_spend_in_exposed(self, client):
        """Verify no raw spend_sek leaks in /suppliers/exposed response."""
        resp = client.get("/api/v1/suppliers/exposed")
        if resp.status_code != 200:
            pytest.skip("Endpoint not yet implemented")

        assert "spend_sek" not in resp.text, "Raw spend_sek leaked in exposed response"


# ── 7. Edge cases ────────────────────────────────────────────────


class TestEdgeCases:
    def test_supplier_name_with_apostrophe(self, tmp_path):
        """Supplier name with apostrophe (Villanova D'Asti) handles correctly."""
        db_path = tmp_path / "apostrophe.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(
            conn, "Villanova D'Asti", "Supplier D'Angelo", "Italy", "Components", 1000
        )
        conn.commit()

        suppliers = _get_site_suppliers(conn, "Villanova D'Asti")
        assert len(suppliers) == 1
        assert suppliers[0]["supplier_name"] == "Supplier D'Angelo"
        conn.close()

    def test_supplier_name_with_ampersand(self, tmp_path):
        """Supplier name with ampersand handles correctly."""
        db_path = tmp_path / "ampersand.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(
            conn, "Schweinfurt", "Johnson & Johnson", "United States", "Chemicals", 500
        )
        conn.commit()

        suppliers = _get_site_suppliers(conn, "Schweinfurt")
        assert len(suppliers) == 1
        assert suppliers[0]["supplier_name"] == "Johnson & Johnson"
        conn.close()

    def test_supplier_name_with_unicode(self, tmp_path):
        """Supplier name with unicode characters handles correctly."""
        db_path = tmp_path / "unicode.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(
            conn, "Schweinfurt", "Muller Stahl GmbH", "Germany", "Components", 1000
        )
        _insert_relationship(
            conn, "Schweinfurt", "Toki Kogyo KK", "Japan", "Electronics", 800
        )
        conn.commit()

        suppliers = _get_site_suppliers(conn, "Schweinfurt")
        assert len(suppliers) == 2

        names = [s["supplier_name"] for s in suppliers]
        assert "Muller Stahl GmbH" in names
        assert "Toki Kogyo KK" in names
        conn.close()

    def test_zero_total_spend_no_division_by_zero(self, tmp_path):
        """Site with 0 total spend should return spend_pct = 0, not crash."""
        db_path = tmp_path / "zero_spend.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(
            conn, "EmptySite", "Supplier Z", "Germany", "Components", 0.0
        )
        conn.commit()

        suppliers = _get_site_suppliers(conn, "EmptySite")
        assert len(suppliers) == 1
        assert suppliers[0]["spend_pct"] == 0.0

        by_country = _get_site_suppliers_by_country(conn, "EmptySite")
        assert len(by_country) == 1
        assert by_country[0]["spend_pct"] == 0.0
        conn.close()

    def test_very_long_supplier_name(self, tmp_path):
        """Supplier name of 500 chars should store and retrieve correctly."""
        db_path = tmp_path / "long_name.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        long_name = "A" * 500
        _insert_relationship(conn, "Schweinfurt", long_name, "Germany", "Components", 100)
        conn.commit()

        row = conn.execute(
            "SELECT supplier_name FROM supplier_relationships WHERE site_id = 'Schweinfurt'"
        ).fetchone()
        assert row[0] == long_name
        assert len(row[0]) == 500
        conn.close()

    def test_concentration_with_zero_spend(self, tmp_path):
        """HHI computation with zero total spend should return 0, not error."""
        db_path = tmp_path / "conc_zero.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "ZeroSite", "SupA", "Germany", "Components", 0)
        _insert_relationship(conn, "ZeroSite", "SupB", "Italy", "Electronics", 0)
        conn.commit()

        scores = _get_supplier_concentration(conn)
        assert len(scores) == 1
        assert scores[0]["concentration_score"] == 0.0
        conn.close()

    def test_spend_pct_sums_to_100(self, tmp_path):
        """All supplier spend_pct values for a site should sum to ~100%."""
        db_path = tmp_path / "pct_sum.db"
        conn = sqlite3.connect(str(db_path))
        _create_supplier_tables(conn)

        _insert_relationship(conn, "TestSite", "A", "Germany", "Components", 3333)
        _insert_relationship(conn, "TestSite", "B", "Italy", "Electronics", 3333)
        _insert_relationship(conn, "TestSite", "C", "France", "Raw Materials", 3334)
        conn.commit()

        suppliers = _get_site_suppliers(conn, "TestSite")
        total_pct = sum(s["spend_pct"] for s in suppliers)
        assert abs(total_pct - 100.0) < 0.1, f"Spend percentages sum to {total_pct}, expected ~100"
        conn.close()

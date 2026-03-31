"""Tests for the supplier alternatives endpoint.

Validates ranking logic, input validation, edge cases, and response shape
without requiring a running server (uses FastAPI TestClient).
"""

import math

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.routers.suppliers import (
    ADJACENT_REGIONS,
    _alternatives_for_country,
    _alternatives_for_region,
)
from backend.app.data import load_suppliers
from backend.app.utils.geo import haversine_km

client = TestClient(app)

API = "/api/v1/suppliers/alternatives"


# ── Fixtures ──────────────────────────────────────────────────────


@pytest.fixture
def suppliers():
    return load_suppliers()


@pytest.fixture
def suppliers_by_country(suppliers):
    return {s["country"]: s for s in suppliers}


# ── Input validation ──────────────────────────────────────────────


class TestInputValidation:
    def test_no_params_returns_400(self):
        r = client.get(API)
        assert r.status_code == 400
        assert "At least one" in r.json()["detail"]

    def test_unknown_country_returns_404(self):
        r = client.get(API, params={"country": "Atlantis"})
        assert r.status_code == 404
        assert "Atlantis" in r.json()["detail"]

    def test_unknown_region_returns_404(self):
        r = client.get(API, params={"region": "MARS"})
        assert r.status_code == 404
        assert "MARS" in r.json()["detail"]

    def test_case_insensitive_country(self):
        r = client.get(API, params={"country": "germany"})
        assert r.status_code == 200
        assert r.json()["disrupted"]["country"] == "Germany"

    def test_case_insensitive_region(self):
        r = client.get(API, params={"region": "eu"})
        assert r.status_code == 200
        assert r.json()["disrupted"]["region"] == "EU"


# ── Country-level alternatives ─────────────────────────────────


class TestCountryAlternatives:
    def test_turkey_returns_alternatives(self):
        r = client.get(API, params={"country": "Turkey"})
        assert r.status_code == 200
        data = r.json()

        assert data["disrupted"]["country"] == "Turkey"
        assert data["disrupted"]["supplier_count"] == 29
        assert len(data["alternatives"]) > 0
        assert "disclaimer" in data

    def test_disrupted_country_not_in_alternatives(self):
        r = client.get(API, params={"country": "Germany"})
        data = r.json()
        alt_countries = [a["country"] for a in data["alternatives"]]
        assert "Germany" not in alt_countries

    def test_alternatives_have_required_fields(self):
        r = client.get(API, params={"country": "France"})
        data = r.json()
        for alt in data["alternatives"]:
            assert "country" in alt
            assert "region" in alt
            assert "supplier_count" in alt
            assert "distance_km" in alt
            assert "category_overlap" in alt
            assert "overlap_pct" in alt
            assert isinstance(alt["category_overlap"], list)
            assert 0 <= alt["overlap_pct"] <= 100

    def test_limit_parameter(self):
        r = client.get(API, params={"country": "Germany", "limit": 3})
        data = r.json()
        assert len(data["alternatives"]) == 3

    def test_same_region_preferred(self):
        """Countries in the same region should generally rank higher."""
        r = client.get(API, params={"country": "Sweden"})
        data = r.json()
        # Sweden is EU — top alternatives should be mostly EU
        top5_regions = [a["region"] for a in data["alternatives"][:5]]
        eu_count = top5_regions.count("EU")
        assert eu_count >= 3, f"Expected mostly EU in top 5, got {top5_regions}"

    def test_category_overlap_is_accurate(self):
        r = client.get(API, params={"country": "Germany"})
        data = r.json()
        disrupted_cats = set(data["disrupted"]["categories"])
        for alt in data["alternatives"]:
            overlap = set(alt["category_overlap"])
            # Every overlap category must exist in the disrupted set
            assert overlap <= disrupted_cats, (
                f"{alt['country']} has overlap {overlap} not in {disrupted_cats}"
            )

    def test_overlap_pct_calculated_correctly(self):
        r = client.get(API, params={"country": "Germany"})
        data = r.json()
        disrupted_cats = set(data["disrupted"]["categories"])
        for alt in data["alternatives"]:
            expected_pct = round(
                len(alt["category_overlap"]) / len(disrupted_cats) * 100, 1
            ) if disrupted_cats else 0.0
            assert alt["overlap_pct"] == expected_pct

    def test_distance_is_positive(self):
        r = client.get(API, params={"country": "Japan"})
        data = r.json()
        for alt in data["alternatives"]:
            assert alt["distance_km"] >= 0

    def test_high_density_countries_rank_well(self):
        """Germany, US, China should appear in top results for most countries."""
        r = client.get(API, params={"country": "Finland"})
        data = r.json()
        top10_countries = [a["country"] for a in data["alternatives"][:10]]
        # At least one of the big-3 should be in top 10
        big3 = {"Germany", "United States", "China"}
        assert big3 & set(top10_countries), f"None of {big3} in top 10: {top10_countries}"


# ── Region-level alternatives ──────────────────────────────────


class TestRegionAlternatives:
    def test_apac_disruption(self):
        r = client.get(API, params={"region": "APAC"})
        assert r.status_code == 200
        data = r.json()

        assert data["disrupted"]["region"] == "APAC"
        assert data["disrupted"]["supplier_count"] > 0
        # No APAC countries in alternatives
        for alt in data["alternatives"]:
            assert alt["region"] != "APAC"

    def test_eu_disruption_excludes_eu(self):
        r = client.get(API, params={"region": "EU"})
        data = r.json()
        for alt in data["alternatives"]:
            assert alt["region"] != "EU"

    def test_region_disrupted_categories_union(self):
        """Region disrupted categories should be the union of all countries in region."""
        r = client.get(API, params={"region": "AM"})
        data = r.json()
        suppliers = load_suppliers()
        am_cats = set()
        for s in suppliers:
            if s["region"] == "AM":
                am_cats.update(s.get("top_categories", []))
        assert set(data["disrupted"]["categories"]) == am_cats

    def test_region_limit(self):
        r = client.get(API, params={"region": "EU", "limit": 5})
        data = r.json()
        assert len(data["alternatives"]) <= 5

    def test_af_region(self):
        """AF is small — should still return alternatives."""
        r = client.get(API, params={"region": "AF"})
        assert r.status_code == 200
        data = r.json()
        assert len(data["alternatives"]) > 0


# ── Response shape / schema compliance ─────────────────────────


class TestResponseShape:
    def test_disclaimer_always_present(self):
        r = client.get(API, params={"country": "India"})
        data = r.json()
        assert "disclaimer" in data
        assert "NOT confirmed" in data["disclaimer"]

    def test_disrupted_has_categories(self):
        r = client.get(API, params={"country": "China"})
        data = r.json()
        assert isinstance(data["disrupted"]["categories"], list)
        assert len(data["disrupted"]["categories"]) > 0

    def test_response_matches_pydantic_model(self):
        """Validate that the response deserializes into the Pydantic model."""
        from backend.app.models.schemas import SupplierAlternativesResponse

        r = client.get(API, params={"country": "Italy"})
        data = r.json()
        model = SupplierAlternativesResponse(**data)
        assert model.disrupted.country == "Italy"
        assert len(model.alternatives) > 0


# ── Internal logic ──────────────────────────────────────────────


class TestInternalLogic:
    def test_adjacent_regions_covers_all(self):
        """Every region must have adjacency entries."""
        expected_regions = {"EU", "APAC", "AM", "MEA", "AF"}
        assert set(ADJACENT_REGIONS.keys()) == expected_regions

    def test_adjacent_regions_no_self_reference(self):
        for region, adjacent in ADJACENT_REGIONS.items():
            assert region not in adjacent, f"{region} lists itself as adjacent"

    def test_haversine_used_for_distance(self):
        """Verify distance_km matches haversine between disrupted and alternative."""
        suppliers = load_suppliers()
        by_country = {s["country"]: s for s in suppliers}

        turkey = by_country["Turkey"]
        germany = by_country["Germany"]
        expected = round(haversine_km(
            turkey["lat"], turkey["lng"],
            germany["lat"], germany["lng"],
        ), 0)

        r = client.get(API, params={"country": "Turkey"})
        data = r.json()
        germany_alt = next(
            (a for a in data["alternatives"] if a["country"] == "Germany"), None
        )
        assert germany_alt is not None
        assert germany_alt["distance_km"] == expected


# ── Edge cases ──────────────────────────────────────────────────


class TestEdgeCases:
    def test_country_with_single_supplier(self):
        """Countries with count=1 should still work."""
        r = client.get(API, params={"country": "Estonia"})
        assert r.status_code == 200
        data = r.json()
        assert data["disrupted"]["supplier_count"] == 1

    def test_limit_caps_results(self):
        """Default limit should cap results at 10."""
        r = client.get(API, params={"country": "Germany"})
        assert r.status_code == 200
        data = r.json()
        assert len(data["alternatives"]) == 10

    def test_both_params_country_wins(self):
        """When both country and region are provided, country takes precedence."""
        r = client.get(API, params={"country": "Germany", "region": "APAC"})
        assert r.status_code == 200
        data = r.json()
        assert data["disrupted"]["country"] == "Germany"

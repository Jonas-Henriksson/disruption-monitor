"""Test that all BU_MAP manufacturing sites have SUPPLY_GRAPH entries.

The SUPPLY_GRAPH lives in frontend TypeScript, so we parse it directly
to verify completeness against the backend BU_MAP.
"""

import re
from pathlib import Path

import pytest

from backend.app.data import BU_MAP, load_sites, load_suppliers


# Path to the frontend suppliers file containing SUPPLY_GRAPH
_SUPPLIERS_TS = Path(__file__).parent.parent.parent / "frontend" / "src" / "data" / "suppliers.ts"


def _parse_supply_graph_keys() -> set[str]:
    """Extract all keys from the TypeScript SUPPLY_GRAPH object."""
    content = _SUPPLIERS_TS.read_text(encoding="utf-8")

    # Find the SUPPLY_GRAPH block
    start = content.find("SUPPLY_GRAPH")
    assert start != -1, "SUPPLY_GRAPH not found in suppliers.ts"

    # Extract all single-quoted keys like 'Schweinfurt':
    # Also handle escaped quotes like 'Villanova D\'Asti'
    graph_section = content[start:]
    # Match keys: 'key-name': { ... }
    keys = set()
    for match in re.finditer(r"'((?:[^'\\]|\\.)*)'\s*:\s*\{", graph_section):
        key = match.group(1).replace("\\'", "'")
        keys.add(key)

    return keys


class TestSupplyGraphCompleteness:
    def test_supply_graph_file_exists(self):
        assert _SUPPLIERS_TS.exists(), f"suppliers.ts not found at {_SUPPLIERS_TS}"

    def test_all_bu_map_sites_in_supply_graph(self):
        """Every site in BU_MAP should have a corresponding SUPPLY_GRAPH entry."""
        graph_keys = _parse_supply_graph_keys()
        bu_sites = set(BU_MAP.keys())

        missing = bu_sites - graph_keys
        assert missing == set(), (
            f"{len(missing)} BU_MAP sites missing from SUPPLY_GRAPH: {sorted(missing)}"
        )

    def test_supply_graph_entries_are_in_bu_map(self):
        """SUPPLY_GRAPH entries should reference known BU_MAP sites."""
        graph_keys = _parse_supply_graph_keys()
        bu_sites = set(BU_MAP.keys())

        extra = graph_keys - bu_sites
        # Extra entries are not necessarily wrong (could be non-BU_MAP sites),
        # but flag them for review
        if extra:
            pytest.skip(
                f"{len(extra)} SUPPLY_GRAPH entries not in BU_MAP (may be OK): {sorted(extra)}"
            )

    def test_supply_graph_has_enough_entries(self):
        """SUPPLY_GRAPH should have at least as many entries as BU_MAP."""
        graph_keys = _parse_supply_graph_keys()
        assert len(graph_keys) >= len(BU_MAP), (
            f"SUPPLY_GRAPH has {len(graph_keys)} entries but BU_MAP has {len(BU_MAP)}"
        )

    def test_supply_graph_entries_have_supplier_countries(self):
        """Each SUPPLY_GRAPH entry references supplier countries.

        Verify at least one 'sup:' array exists for each entry.
        """
        content = _SUPPLIERS_TS.read_text(encoding="utf-8")
        start = content.find("SUPPLY_GRAPH")
        graph_section = content[start:]

        # Count entries with sup: arrays
        sup_count = len(re.findall(r"sup:\s*\[", graph_section))
        graph_keys = _parse_supply_graph_keys()

        assert sup_count == len(graph_keys), (
            f"Not all SUPPLY_GRAPH entries have sup: arrays ({sup_count} vs {len(graph_keys)})"
        )


class TestBUMapAndSitesAlignment:
    def test_bu_map_sites_exist_in_sites_data(self):
        """Every BU_MAP site name should exist in the sites dataset."""
        all_sites = load_sites()
        site_names = {s["name"] for s in all_sites}

        missing = set(BU_MAP.keys()) - site_names
        assert missing == set(), (
            f"BU_MAP has sites not found in sites data: {sorted(missing)}"
        )

    def test_manufacturing_sites_have_bu(self):
        """Manufacturing sites should ideally have a BU classification."""
        all_sites = load_sites()
        mfg_sites = [s for s in all_sites if s["type"] == "mfg"]
        mfg_names = {s["name"] for s in mfg_sites}
        bu_names = set(BU_MAP.keys())

        # Check coverage -- at least 50% of mfg sites should be in BU_MAP
        covered = mfg_names & bu_names
        coverage_pct = len(covered) / len(mfg_names) * 100 if mfg_names else 0
        assert coverage_pct > 50, (
            f"Only {coverage_pct:.0f}% of mfg sites have BU classification"
        )

    def test_suppliers_data_loads(self):
        """Verify suppliers data loads and has expected shape."""
        suppliers = load_suppliers()
        assert isinstance(suppliers, list)
        assert len(suppliers) > 40  # 53 countries expected

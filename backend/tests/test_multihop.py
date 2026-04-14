"""Tests for multi-hop supply chain graph traversal."""

from backend.app.data import SUPPLY_GRAPH, REVERSE_GRAPH


def test_reverse_graph_has_all_supplier_countries():
    """Every supplier country in SUPPLY_GRAPH appears as a key in REVERSE_GRAPH."""
    all_countries = set()
    for entry in SUPPLY_GRAPH.values():
        all_countries.update(entry.get("sup", []))
    for country in all_countries:
        assert country in REVERSE_GRAPH, f"{country} missing from REVERSE_GRAPH"


def test_reverse_graph_maps_country_to_factories():
    """REVERSE_GRAPH['Germany'] should include Schweinfurt (which sources from Germany)."""
    assert "Germany" in REVERSE_GRAPH
    factory_names = [f["factory"] for f in REVERSE_GRAPH["Germany"]]
    assert "Schweinfurt" in factory_names


def test_reverse_graph_entry_shape():
    """Each REVERSE_GRAPH entry is a list of {factory, bu, inputs} dicts."""
    for country, factories in REVERSE_GRAPH.items():
        assert isinstance(factories, list), f"{country} value is not a list"
        for f in factories:
            assert "factory" in f
            assert "bu" in f
            assert "inputs" in f


def test_multihop_enrichment_follows_downstream():
    """A disruption in Sweden should flag factories sourcing from Sweden (hop 1)
    AND produce downstream_exposure for factories sharing supplier dependencies."""
    from backend.app.services.scanner import _enrich_supply_chain_data

    item = {
        "event": "Steel Mill Strike in Sweden",
        "region": "Sweden",
        "category": "Disruption",
        "severity": "High",
        "lat": 60.0, "lng": 15.0,
        "affected_sites": [],
    }
    _enrich_supply_chain_data(item)

    factories = [d.get("factory") for d in item.get("input_details", [])]
    assert "Hofors" in factories, "Hofors should be affected (sources steel from Sweden)"
    assert len(item.get("routing_context", [])) > 0

    downstream = item.get("downstream_exposure", [])
    assert isinstance(downstream, list)


def test_multihop_capped_at_two_hops():
    """Multi-hop should not cascade beyond 2 hops to avoid noise."""
    from backend.app.services.scanner import _enrich_supply_chain_data

    item = {
        "event": "Port Closure in Japan",
        "region": "Japan",
        "category": "Logistics",
        "severity": "Critical",
        "lat": 35.0, "lng": 139.0,
        "affected_sites": [],
    }
    _enrich_supply_chain_data(item)

    downstream = item.get("downstream_exposure", [])
    assert len(downstream) <= 20, "Downstream exposure should be capped"

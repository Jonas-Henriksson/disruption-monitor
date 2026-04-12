"""Static data loading utilities.

Loads JSON reference data from the backend/app/data/ directory and exposes
it as typed Python objects that routers can return directly.
"""

import json
from pathlib import Path
from typing import Any

_DATA_DIR = Path(__file__).parent


def _load(filename: str) -> Any:
    with open(_DATA_DIR / filename, encoding="utf-8") as f:
        return json.load(f)


def load_disruptions() -> list[dict]:
    return _load("disruptions.json")


def load_geopolitical() -> list[dict]:
    return _load("geopolitical.json")


def load_trade() -> list[dict]:
    return _load("trade.json")


def load_sites_raw() -> list[list]:
    return _load("sites.json")


def load_suppliers() -> list[dict]:
    return _load("suppliers.json")


# Business-unit mapping (mirrors frontend BU_MAP)
BU_MAP: dict[str, str] = {
    "Steyr": "ind", "Karnare": "ind", "Sopot": "ind", "Dalian": "ind",
    "Beijing - Nankou": "ind", "Xinchang (SXC)": "ind", "Yuyao (NGBC)": "ind",
    "Les Trois Moutiers": "ind", "Saint-Cyr-sur-Loire": "ind",
    "Schweinfurt": "ind", "Hamburg": "ind", "Hofors": "ind",
    "Katrineholm": "ind", "Ljungaverk": "ind", "Gothenburg MFG": "ind",
    "Poznan": "ind", "Kings Lynn": "ind", "Flowery Branch": "ind",
    "Sumter, SC": "ind", "Ahmedabad": "ind", "Pune - Chakan": "ind",
    "Nilai": "ind", "La Silla (Monterrey)": "ind",
    "Villar Perosa - Dante Alighieri": "ind", "Airasca": "ind",
    "Massa": "ind", "Modugno (Bari)": "ind", "Cassino": "ind",
    "Guadalupe NL": "ind",
    "Waukegan, IL": "ind", "Salt Lake City": "ind", "Crossville, TN": "ind",
    # SIS - Seals
    "Judenburg": "sis-seal", "Kalofer": "sis-seal", "Leverkusen": "sis-seal",
    "Bietigheim": "sis-seal", "Landskrona": "sis-seal",
    "Villanova D'Asti": "sis-seal", "Gazzada Schianno": "sis-seal",
    "Wuhu": "sis-seal", "Elgin, IL": "sis-seal", "Daegu": "sis-seal",
    "Mysore": "sis-seal", "Zapopan": "sis-seal", "Frossasco": "sis-seal",
    "UK Mouldings": "sis-seal",
    # SIS - Lubrication
    "Berlin/Walldorf": "sis-lube", "Cormano": "sis-lube", "Chodov": "sis-lube",
    "Muurame": "sis-lube", "Landvetter": "sis-lube", "Linkoping": "sis-lube",
    "Johnson City, TN": "sis-lube", "Saint Louis, MO": "sis-lube",
    "Bangalore": "sis-lube", "Suzhou": "sis-lube", "Enschede": "sis-lube",
    "Rosario": "sis-lube",
    # SIS - Aerospace
    "Lons-Le-Saunier": "sis-aero", "Valenciennes": "sis-aero",
    "Chateauneuf": "sis-aero", "Villar Perosa - Nazionale": "sis-aero",
    "Clevedon": "sis-aero", "Falconer, NY": "sis-aero",
    "Winsted, CT": "sis-aero", "Dexter, MI": "sis-aero",
    "Ladson, SC": "sis-aero", "Muskegon, MI": "sis-aero",
    # SIS - Magnetics
    "Calgary, AB": "sis-mag", "Vernon": "sis-mag", "Tanger": "sis-mag",
}


# ── Supply Chain Graph with supplier tiering ────────────────────
# Mirrors frontend SUPPLY_GRAPH. Each entry maps a factory to its supplier
# countries, input types, business unit, and tiered input details.
# Tier 1 = critical/direct (steel, precision, specialty alloys, rare earth)
# Tier 2 = important/indirect (seals, cages, rubber, components, electronics)
# Tier 3 = commodity/replaceable (packaging, chemicals, MRO)
# sole_source = True if that input has limited sourcing alternatives

SUPPLY_GRAPH: dict[str, dict] = {
    "Schweinfurt": {"sup": ["Germany", "Austria", "Italy", "Czech Republic", "India", "China"], "inputs": ["Steel rings", "Roller elements", "Cages"], "bu": "Industrial", "input_details": [{"name": "Steel rings", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Roller elements", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Cages", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Gothenburg MFG": {"sup": ["Sweden", "Germany", "Finland", "Italy", "France"], "inputs": ["Steel", "Components", "Seals"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Seals", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Hofors": {"sup": ["Sweden", "Finland", "Austria"], "inputs": ["Steel billets", "Wire rod"], "bu": "Industrial", "input_details": [{"name": "Steel billets", "tier": 1, "sole_source": True, "criticality": "critical"}, {"name": "Wire rod", "tier": 1, "sole_source": False, "criticality": "critical"}]},
    "Katrineholm": {"sup": ["Sweden", "Germany", "Finland"], "inputs": ["Steel", "Cages", "Rollers"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Cages", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Rollers", "tier": 1, "sole_source": False, "criticality": "critical"}]},
    "Steyr": {"sup": ["Austria", "Germany", "Italy", "Czech Republic"], "inputs": ["Steel rings", "Precision parts"], "bu": "Industrial", "input_details": [{"name": "Steel rings", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Precision parts", "tier": 1, "sole_source": False, "criticality": "critical"}]},
    "Pune - Chakan": {"sup": ["India", "Japan", "China", "Germany"], "inputs": ["Steel", "Forgings", "Cages"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Forgings", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Cages", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Ahmedabad": {"sup": ["India", "Japan", "China"], "inputs": ["Steel", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Dalian": {"sup": ["China", "Japan", "South Korea"], "inputs": ["Steel rings", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel rings", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Xinchang (SXC)": {"sup": ["China", "Japan", "South Korea"], "inputs": ["Steel", "Rare earth", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Rare earth", "tier": 1, "sole_source": True, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Yuyao (NGBC)": {"sup": ["China", "Japan"], "inputs": ["Steel", "Cages", "Rollers"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Cages", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Rollers", "tier": 1, "sole_source": False, "criticality": "critical"}]},
    "Nilai": {"sup": ["Malaysia", "China", "Japan", "India"], "inputs": ["Steel", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Kings Lynn": {"sup": ["United Kingdom", "Germany", "Sweden"], "inputs": ["Steel", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Poznan": {"sup": ["Poland", "Germany", "Czech Republic", "Slovakia"], "inputs": ["Steel", "Cages", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Cages", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Flowery Branch": {"sup": ["United States", "Mexico", "Canada"], "inputs": ["Steel", "Components", "Electronics"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Electronics", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Waukegan, IL": {"sup": ["United States", "Canada", "Mexico"], "inputs": ["Steel rings", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel rings", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Salt Lake City": {"sup": ["United States", "Canada", "Japan"], "inputs": ["Steel", "Precision parts"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Precision parts", "tier": 1, "sole_source": False, "criticality": "critical"}]},
    "Crossville, TN": {"sup": ["United States", "Mexico"], "inputs": ["Steel", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Landskrona": {"sup": ["Sweden", "Germany", "Italy", "Finland"], "inputs": ["Rubber compounds", "Metal inserts", "Springs"], "bu": "SIS Seals", "input_details": [{"name": "Rubber compounds", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Metal inserts", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Springs", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Bietigheim": {"sup": ["Germany", "Italy", "Austria", "France"], "inputs": ["Rubber", "Polymer compounds", "Metal parts"], "bu": "SIS Seals", "input_details": [{"name": "Rubber", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Polymer compounds", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Metal parts", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Judenburg": {"sup": ["Austria", "Germany", "Italy"], "inputs": ["Rubber", "Metal inserts"], "bu": "SIS Seals", "input_details": [{"name": "Rubber", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Metal inserts", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Airasca": {"sup": ["Italy", "Germany", "France"], "inputs": ["Steel", "Precision parts", "Electronics"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Precision parts", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Electronics", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Massa": {"sup": ["Italy", "Germany"], "inputs": ["Steel", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": True, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Cassino": {"sup": ["Italy", "Germany", "France"], "inputs": ["Steel", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Cormano": {"sup": ["Italy", "Germany", "Sweden"], "inputs": ["Lubricants", "Chemicals", "Packaging"], "bu": "SIS Lubrication", "input_details": [{"name": "Lubricants", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Chemicals", "tier": 3, "sole_source": False, "criticality": "standard"}, {"name": "Packaging", "tier": 3, "sole_source": False, "criticality": "standard"}]},
    "Landvetter": {"sup": ["Sweden", "Germany", "Finland"], "inputs": ["Lubricants", "Equipment parts"], "bu": "SIS Lubrication", "input_details": [{"name": "Lubricants", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Equipment parts", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Linkoping": {"sup": ["Sweden", "Germany", "Finland"], "inputs": ["Lubricants", "Components", "Electronics"], "bu": "SIS Lubrication", "input_details": [{"name": "Lubricants", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Electronics", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Berlin/Walldorf": {"sup": ["Germany", "Italy", "France"], "inputs": ["Lubricants", "Chemicals"], "bu": "SIS Lubrication", "input_details": [{"name": "Lubricants", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Chemicals", "tier": 3, "sole_source": False, "criticality": "standard"}]},
    "Muurame": {"sup": ["Finland", "Sweden", "Germany"], "inputs": ["Components", "Electronics", "Hydraulic parts"], "bu": "SIS Lubrication", "input_details": [{"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Electronics", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Hydraulic parts", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Lons-Le-Saunier": {"sup": ["France", "Germany", "Italy", "United Kingdom"], "inputs": ["Specialty steel", "Precision parts"], "bu": "SIS Aerospace", "input_details": [{"name": "Specialty steel", "tier": 1, "sole_source": True, "criticality": "critical"}, {"name": "Precision parts", "tier": 1, "sole_source": False, "criticality": "critical"}]},
    "Valenciennes": {"sup": ["France", "Germany", "United Kingdom"], "inputs": ["Steel", "Components"], "bu": "SIS Aerospace", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Falconer, NY": {"sup": ["United States", "Canada", "Japan"], "inputs": ["Specialty alloys", "Precision parts"], "bu": "SIS Aerospace", "input_details": [{"name": "Specialty alloys", "tier": 1, "sole_source": True, "criticality": "critical"}, {"name": "Precision parts", "tier": 1, "sole_source": False, "criticality": "critical"}]},
    "Muskegon, MI": {"sup": ["United States", "Canada"], "inputs": ["Specialty steel", "Components"], "bu": "SIS Aerospace", "input_details": [{"name": "Specialty steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Calgary, AB": {"sup": ["Canada", "United States"], "inputs": ["Magnetic materials", "Components"], "bu": "SIS Magnetics", "input_details": [{"name": "Magnetic materials", "tier": 1, "sole_source": True, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Tanger": {"sup": ["Morocco", "France", "Spain", "Germany"], "inputs": ["Magnetic materials", "Components"], "bu": "SIS Magnetics", "input_details": [{"name": "Magnetic materials", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Rosario": {"sup": ["Argentina", "Brazil", "Germany"], "inputs": ["Lubricants", "Components"], "bu": "SIS Lubrication", "input_details": [{"name": "Lubricants", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Karnare": {"sup": ["Bulgaria", "Germany", "Italy"], "inputs": ["Steel", "Components", "Rollers"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Rollers", "tier": 1, "sole_source": False, "criticality": "critical"}]},
    "Sopot": {"sup": ["Bulgaria", "Germany", "Italy"], "inputs": ["Steel", "Bearing rings", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Bearing rings", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Beijing - Nankou": {"sup": ["China", "Japan", "South Korea", "Germany"], "inputs": ["Steel rings", "Cages", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel rings", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Cages", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Les Trois Moutiers": {"sup": ["France", "Germany", "Italy"], "inputs": ["Steel", "Precision parts", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Precision parts", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Saint-Cyr-sur-Loire": {"sup": ["France", "Germany", "Italy", "United Kingdom"], "inputs": ["Steel", "Components", "Seals"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Seals", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Hamburg": {"sup": ["Germany", "Sweden", "Austria", "Czech Republic"], "inputs": ["Steel", "Components", "Cages"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Cages", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Ljungaverk": {"sup": ["Sweden", "Finland", "Germany"], "inputs": ["Steel billets", "Wire rod", "Components"], "bu": "Industrial", "input_details": [{"name": "Steel billets", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Wire rod", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Sumter, SC": {"sup": ["United States", "Mexico", "Canada"], "inputs": ["Steel", "Components", "Electronics"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Electronics", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "La Silla (Monterrey)": {"sup": ["Mexico", "United States", "Germany"], "inputs": ["Steel", "Components", "Cages"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Cages", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Villar Perosa - Dante Alighieri": {"sup": ["Italy", "Germany", "France", "Austria"], "inputs": ["Steel rings", "Precision parts", "Cages"], "bu": "Industrial", "input_details": [{"name": "Steel rings", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Precision parts", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Cages", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Modugno (Bari)": {"sup": ["Italy", "Germany", "France"], "inputs": ["Steel", "Components", "Seals"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Seals", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Guadalupe NL": {"sup": ["Mexico", "United States", "Germany"], "inputs": ["Steel", "Components", "Cages"], "bu": "Industrial", "input_details": [{"name": "Steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Cages", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Kalofer": {"sup": ["Bulgaria", "Germany", "Italy"], "inputs": ["Rubber compounds", "Metal inserts", "Springs"], "bu": "SIS Seals", "input_details": [{"name": "Rubber compounds", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Metal inserts", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Springs", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Leverkusen": {"sup": ["Germany", "Italy", "France", "Austria"], "inputs": ["Rubber", "Polymer compounds", "Chemicals"], "bu": "SIS Seals", "input_details": [{"name": "Rubber", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Polymer compounds", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Chemicals", "tier": 3, "sole_source": False, "criticality": "standard"}]},
    "Villanova D'Asti": {"sup": ["Italy", "Germany", "France"], "inputs": ["Rubber compounds", "Metal inserts", "Springs"], "bu": "SIS Seals", "input_details": [{"name": "Rubber compounds", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Metal inserts", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Springs", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Gazzada Schianno": {"sup": ["Italy", "Germany", "Switzerland", "France"], "inputs": ["Rubber", "Polymer compounds", "Metal parts"], "bu": "SIS Seals", "input_details": [{"name": "Rubber", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Polymer compounds", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Metal parts", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Wuhu": {"sup": ["China", "Japan", "South Korea", "Germany"], "inputs": ["Rubber compounds", "Metal inserts", "Polymer materials"], "bu": "SIS Seals", "input_details": [{"name": "Rubber compounds", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Metal inserts", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Polymer materials", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Elgin, IL": {"sup": ["United States", "Canada", "Mexico", "Germany"], "inputs": ["Rubber", "Polymer compounds", "Metal parts"], "bu": "SIS Seals", "input_details": [{"name": "Rubber", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Polymer compounds", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Metal parts", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Daegu": {"sup": ["South Korea", "Japan", "China"], "inputs": ["Rubber compounds", "Metal inserts", "Springs"], "bu": "SIS Seals", "input_details": [{"name": "Rubber compounds", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Metal inserts", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Springs", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Mysore": {"sup": ["India", "Japan", "China", "Germany"], "inputs": ["Rubber", "Polymer compounds", "Metal parts"], "bu": "SIS Seals", "input_details": [{"name": "Rubber", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Polymer compounds", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Metal parts", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Zapopan": {"sup": ["Mexico", "United States", "Germany"], "inputs": ["Rubber compounds", "Metal inserts", "Chemicals"], "bu": "SIS Seals", "input_details": [{"name": "Rubber compounds", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Metal inserts", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Chemicals", "tier": 3, "sole_source": False, "criticality": "standard"}]},
    "Frossasco": {"sup": ["Italy", "Germany", "France"], "inputs": ["Rubber", "Metal inserts", "Springs"], "bu": "SIS Seals", "input_details": [{"name": "Rubber", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Metal inserts", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Springs", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "UK Mouldings": {"sup": ["United Kingdom", "Germany", "Italy"], "inputs": ["Rubber", "Polymer compounds", "Moulding materials"], "bu": "SIS Seals", "input_details": [{"name": "Rubber", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Polymer compounds", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Moulding materials", "tier": 3, "sole_source": False, "criticality": "standard"}]},
    "Chodov": {"sup": ["Czech Republic", "Germany", "Austria"], "inputs": ["Lubricants", "Chemicals", "Packaging"], "bu": "SIS Lubrication", "input_details": [{"name": "Lubricants", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Chemicals", "tier": 3, "sole_source": False, "criticality": "standard"}, {"name": "Packaging", "tier": 3, "sole_source": False, "criticality": "standard"}]},
    "Johnson City, TN": {"sup": ["United States", "Canada", "Mexico"], "inputs": ["Lubricants", "Components", "Electronics"], "bu": "SIS Lubrication", "input_details": [{"name": "Lubricants", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Electronics", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Saint Louis, MO": {"sup": ["United States", "Canada", "Mexico"], "inputs": ["Lubricants", "Chemicals", "Equipment parts"], "bu": "SIS Lubrication", "input_details": [{"name": "Lubricants", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Chemicals", "tier": 3, "sole_source": False, "criticality": "standard"}, {"name": "Equipment parts", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Bangalore": {"sup": ["India", "Japan", "China", "Germany"], "inputs": ["Lubricants", "Components", "Electronics"], "bu": "SIS Lubrication", "input_details": [{"name": "Lubricants", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Electronics", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Suzhou": {"sup": ["China", "Japan", "South Korea", "Germany"], "inputs": ["Lubricants", "Chemicals", "Components"], "bu": "SIS Lubrication", "input_details": [{"name": "Lubricants", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Chemicals", "tier": 3, "sole_source": False, "criticality": "standard"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Enschede": {"sup": ["Netherlands", "Germany", "Belgium"], "inputs": ["Lubricants", "Chemicals", "Equipment parts"], "bu": "SIS Lubrication", "input_details": [{"name": "Lubricants", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Chemicals", "tier": 3, "sole_source": False, "criticality": "standard"}, {"name": "Equipment parts", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Chateauneuf": {"sup": ["France", "Germany", "United Kingdom", "Italy"], "inputs": ["Specialty steel", "Precision parts", "Aerospace alloys"], "bu": "SIS Aerospace", "input_details": [{"name": "Specialty steel", "tier": 1, "sole_source": True, "criticality": "critical"}, {"name": "Precision parts", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Aerospace alloys", "tier": 1, "sole_source": True, "criticality": "critical"}]},
    "Villar Perosa - Nazionale": {"sup": ["Italy", "France", "Germany", "United Kingdom"], "inputs": ["Specialty alloys", "Precision parts", "Aerospace components"], "bu": "SIS Aerospace", "input_details": [{"name": "Specialty alloys", "tier": 1, "sole_source": True, "criticality": "critical"}, {"name": "Precision parts", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Aerospace components", "tier": 1, "sole_source": False, "criticality": "critical"}]},
    "Clevedon": {"sup": ["United Kingdom", "France", "Germany"], "inputs": ["Specialty steel", "Precision parts", "Aerospace components"], "bu": "SIS Aerospace", "input_details": [{"name": "Specialty steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Precision parts", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Aerospace components", "tier": 1, "sole_source": False, "criticality": "critical"}]},
    "Winsted, CT": {"sup": ["United States", "Canada", "Japan", "France"], "inputs": ["Specialty alloys", "Precision parts"], "bu": "SIS Aerospace", "input_details": [{"name": "Specialty alloys", "tier": 1, "sole_source": True, "criticality": "critical"}, {"name": "Precision parts", "tier": 1, "sole_source": False, "criticality": "critical"}]},
    "Dexter, MI": {"sup": ["United States", "Canada", "Japan"], "inputs": ["Specialty steel", "Precision parts", "Components"], "bu": "SIS Aerospace", "input_details": [{"name": "Specialty steel", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Precision parts", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Ladson, SC": {"sup": ["United States", "Canada", "United Kingdom"], "inputs": ["Specialty alloys", "Aerospace components", "Electronics"], "bu": "SIS Aerospace", "input_details": [{"name": "Specialty alloys", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Aerospace components", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Electronics", "tier": 2, "sole_source": False, "criticality": "important"}]},
    "Vernon": {"sup": ["France", "Germany", "Spain", "Morocco"], "inputs": ["Magnetic materials", "Components", "Electronics"], "bu": "SIS Magnetics", "input_details": [{"name": "Magnetic materials", "tier": 1, "sole_source": False, "criticality": "critical"}, {"name": "Components", "tier": 2, "sole_source": False, "criticality": "important"}, {"name": "Electronics", "tier": 2, "sole_source": False, "criticality": "important"}]},
}


def load_sites() -> list[dict]:
    """Load sites as dicts matching the Site schema."""
    raw = load_sites_raw()
    sites = []
    for name, lat, lng, site_type, country, iso, region in raw:
        site = {
            "name": name,
            "lat": lat,
            "lng": lng,
            "type": site_type,
            "country": country,
            "iso": iso,
            "region": region,
            "business_unit": BU_MAP.get(name),
        }
        sites.append(site)
    return sites

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

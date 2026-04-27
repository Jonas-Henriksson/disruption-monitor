"""Live news enrichment for disruption scanning via RSS + article extraction.

Two-layer architecture:
  1. Google News RSS (breadth) — SKF-targeted search queries covering manufacturing
     hubs, supplier countries, trade corridors, and chokepoints
  2. Industry RSS feeds (depth) — direct article extraction via trafilatura for
     full article body text from supply chain / maritime / trade publications

Articles are cached in SQLite (news_cache table) with 30-min TTL.
Public interface: fetch_search_context(mode) — drop-in replacement for Serper.

No external API keys required. All sources are public RSS/Atom feeds.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── SKF supply chain context for targeted queries ─────────────────

# Key manufacturing regions (grouped for search efficiency)
_MFG_REGIONS = [
    "Gothenburg Sweden",
    "Schweinfurt Germany",
    "Steyr Austria",
    "Pune India",
    "Dalian China",
    "Shanghai China",
    "Monterrey Mexico",
    "Busan Korea",
    "Nilai Malaysia",
    "Lutsk Ukraine",
]

# Critical chokepoints
_CHOKEPOINTS = [
    "Suez Canal",
    "Strait of Malacca",
    "Strait of Hormuz",
    "Panama Canal",
    "Red Sea shipping",
    "Taiwan Strait",
    "Bosporus",
    "Cape of Good Hope",
]

# Top supplier countries (by relationship density)
_SUPPLIER_COUNTRIES = [
    "Germany", "United States", "China", "India", "France",
    "Italy", "United Kingdom", "Sweden", "Brazil", "Mexico",
    "Turkey", "Japan", "South Korea",
]

# Trade corridors
_TRADE_CORRIDORS = [
    "Europe China trade",
    "Europe US trade",
    "China US trade",
    "ASEAN Europe trade",
    "India Europe trade",
]

# ── Google News RSS search queries per mode ───────────────────────
# Google News RSS: news.google.com/rss/search?q=QUERY&when:7d
# Returns up to 100 articles per query, titles + source metadata

_GOOGLE_NEWS_QUERIES: dict[str, list[str]] = {
    "disruptions": [
        # Core supply chain disruptions
        "supply chain disruption manufacturing",
        "port closure congestion shipping delay",
        "factory fire explosion industrial accident",
        # Chokepoints
        "Red Sea Houthi shipping attack rerouting",
        "Suez Canal Panama Canal Strait Malacca disruption",
        # Natural disasters in SKF regions
        "earthquake flood typhoon Europe India China manufacturing",
        # SKF-relevant industrial
        "bearing steel supplier shortage manufacturing",
        "automotive industrial production disruption Europe",
        # Sole-source risks
        "rare earth export controls China",
        "specialty steel alloy shortage aerospace",
    ],
    "trade": [
        "tariff trade policy sanction manufacturing",
        "EU China trade restriction import duty",
        "US tariff steel bearing industrial",
        "anti-dumping duty European Commission",
        "export controls technology decoupling",
    ],
    "geopolitical": [
        "geopolitical risk conflict manufacturing supply chain",
        "US China tension trade technology",
        "sanctions Russia Iran supply chain",
        "political instability manufacturing region",
    ],
}

# ── Direct RSS feeds for full article extraction ──────────────────
# These feeds provide direct article URLs that trafilatura can extract from

_DIRECT_FEEDS: list[tuple[str, str, list[str]]] = [
    # Supply chain (high relevance, good extraction)
    ("FreightWaves", "https://www.freightwaves.com/news/rss", ["disruptions", "trade"]),
    ("gCaptain", "https://gcaptain.com/feed/", ["disruptions"]),
    ("The Loadstar", "https://theloadstar.com/feed/", ["disruptions", "trade"]),
    ("Supply Chain Dive", "https://www.supplychaindive.com/feeds/news/", ["disruptions"]),

    # Maritime / chokepoints
    ("Splash247", "https://splash247.com/feed/", ["disruptions"]),
    ("Hellenic Shipping News", "https://www.hellenicshippingnews.com/feed/", ["disruptions"]),

    # World news (supply chain / trade relevant headlines)
    ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml", ["disruptions", "geopolitical"]),
    ("BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml", ["disruptions", "geopolitical"]),

    # Energy / commodities
    ("OilPrice", "https://oilprice.com/rss/main", ["disruptions", "trade"]),
]

# ── SKF relevance keywords for filtering ──────────────────────────
# Articles must match at least one keyword to be included

_RELEVANCE_KEYWORDS: list[str] = [
    # ── Supply chain & logistics ──
    "supply chain", "logistics", "freight", "shipping", "port",
    "manufacturing", "factory", "industrial", "production",
    "warehouse", "distribution", "procurement", "inventory",
    "lead time", "backlog", "bottleneck", "capacity",
    "nearshoring", "reshoring", "friendshoring", "offshoring",
    "just in time", "stockpile", "supplier",

    # ── Disruption types ──
    "disruption", "shortage", "delay", "closure", "strike",
    "blockage", "congestion", "embargo", "sanction",
    "earthquake", "flood", "typhoon", "hurricane", "cyclone",
    "tsunami", "fire", "explosion", "landslide", "drought",
    "heatwave", "volcanic", "storm", "monsoon",
    "blackout", "power outage", "grid failure",
    "cyber attack", "ransomware",
    "bankruptcy", "insolvency", "liquidation",
    "recall", "contamination", "quality",
    "labor dispute", "work stoppage", "walkout", "lockout",
    "protest", "unrest", "coup", "civil war",

    # ── Trade & policy ──
    "tariff", "trade war", "import duty", "export control",
    "anti-dumping", "countervailing", "safeguard",
    "sanction", "quota", "restriction", "ban",
    "trade agreement", "free trade", "customs",
    "WTO", "RCEP", "USMCA",
    "derisking", "decoupling", "trade bloc",
    "carbon border", "CBAM", "green deal",
    "section 301", "section 232",

    # ── Maritime & chokepoints ──
    "container", "vessel", "tanker", "bulk carrier",
    "canal", "strait", "maritime", "chokepoint", "rerouting",
    "TEU", "freight rate", "charter rate",
    "Suez", "Malacca", "Hormuz", "Panama", "Bosporus",
    "Red Sea", "Houthi", "Cape of Good Hope",
    "Rotterdam", "Hamburg", "Antwerp", "Gothenburg",
    "Shanghai", "Ningbo", "Busan",
    "piracy", "boarding", "naval",

    # ── SKF material inputs ──
    "steel", "bearing", "roller", "ball bearing",
    "stainless steel", "chrome steel", "carbon steel",
    "specialty steel", "tool steel", "high-speed steel",
    "hot rolled", "cold rolled", "flat steel", "long steel",
    "iron ore", "scrap metal", "pig iron", "billet",
    "rare earth", "neodymium", "cobalt", "tungsten",
    "molybdenum", "vanadium", "nickel", "chromium",
    "manganese", "silicon", "lithium",
    "alloy", "superalloy", "titanium",
    "rubber", "polymer", "elastomer", "seal",
    "lubricant", "grease", "hydraulic fluid",
    "ceramic", "silicon nitride",
    "magnetic material", "ferrite", "permanent magnet",
    "forging", "casting", "machining", "heat treatment",
    "commodity", "raw material", "critical mineral",
    "energy cost", "oil price", "natural gas", "electricity price",
    "copper", "aluminum", "zinc", "palladium", "platinum",

    # ── All 53 supplier countries ──
    "germany", "united states", "china", "india", "france",
    "italy", "united kingdom", "bulgaria", "sweden", "finland",
    "argentina", "brazil", "austria", "spain", "mexico",
    "japan", "south korea", "korea", "netherlands", "poland",
    "czech republic", "turkey", "morocco", "malaysia",
    "indonesia", "thailand", "vietnam", "philippines",
    "singapore", "taiwan", "australia",
    "canada", "colombia", "chile", "peru",
    "south africa", "nigeria", "egypt", "kenya",
    "saudi arabia", "UAE", "qatar", "israel",
    "ukraine", "russia", "romania", "hungary",
    "slovakia", "slovenia", "croatia", "serbia",
    "portugal", "ireland", "denmark", "norway", "belgium",
    "switzerland", "luxembourg", "greece",

    # ── SKF manufacturing regions (city-level) ──
    "gothenburg", "schweinfurt", "landskrona", "hofors",
    "steyr", "judenburg", "bietigheim",
    "pune", "chakan", "bangalore", "ahmedabad", "mysore",
    "dalian", "wuhu", "xinchang", "suzhou", "jinan",
    "monterrey", "guadalupe", "zapopan",
    "sofia", "sopot", "kalofer",
    "villar perosa", "airasca", "massa", "cassino",
    "lons-le-saunier", "valenciennes",
    "falconer", "muskegon", "elgin",
    "calgary", "tanger",

    # ── Key geographies & regions ──
    "europe", "european union", "eurozone",
    "asia pacific", "southeast asia", "ASEAN",
    "middle east", "gulf", "levant",
    "sub-saharan africa", "north africa", "maghreb",
    "latin america", "central america",
    "baltic", "nordic", "mediterranean",
    "pearl river delta", "yangtze", "ruhr",

    # ── Industry verticals (SKF end markets) ──
    "automotive", "EV", "electric vehicle",
    "aerospace", "aviation", "defense",
    "wind energy", "wind turbine", "renewable",
    "railway", "rail", "locomotive",
    "mining", "heavy equipment", "construction",
    "pulp and paper", "textile", "food processing",
    "marine", "offshore", "oil and gas",
    "semiconductor", "electronics",
    "medical device", "pharmaceutical",
    "power generation", "turbine", "compressor",
    "OEM", "tier 1", "tier 2",

    # ── Financial / macro ──
    "currency", "devaluation", "depreciation",
    "inflation", "recession", "GDP",
    "interest rate", "central bank",
    "bond yield", "credit rating", "sovereign debt",
    "forex", "peso", "lira", "rupee", "yuan", "real", "won",
]

_RELEVANCE_PATTERN = re.compile(
    "|".join(re.escape(kw) for kw in _RELEVANCE_KEYWORDS),
    re.IGNORECASE,
)

# ── Configuration ─────────────────────────────────────────────────

_CACHE_TTL_SECONDS = 30 * 60       # 30 minutes
_PRUNE_AGE_HOURS = 48              # auto-delete old articles
_MAX_ARTICLES_PER_SCAN = 150       # articles injected into prompt (headlines + full text)
_MAX_FULL_TEXT_ARTICLES = 50       # articles to extract full body from
_ARTICLE_BODY_MAX_WORDS = 300      # truncate body (shorter per article, more articles)
_FEED_TIMEOUT = 12.0               # HTTP timeout per feed
_ARTICLE_FETCH_TIMEOUT = 10.0      # HTTP timeout for article body
_GOOGLE_NEWS_BASE = "https://news.google.com/rss/search"


def _title_hash(title: str) -> str:
    return hashlib.sha256(title.strip().lower().encode()).hexdigest()[:16]


def _is_relevant(title: str, summary: str = "") -> bool:
    """Check if an article is relevant to SKF supply chain monitoring."""
    text = f"{title} {summary}".lower()
    return bool(_RELEVANCE_PATTERN.search(text))


def _truncate_body(text: str, max_words: int = _ARTICLE_BODY_MAX_WORDS) -> str:
    """Truncate article body to max_words, breaking at sentence boundary."""
    words = text.split()
    if len(words) <= max_words:
        return text
    truncated = " ".join(words[:max_words])
    # Try to break at last sentence boundary
    for sep in (". ", ".\n", "! ", "? "):
        last = truncated.rfind(sep)
        if last > len(truncated) // 2:
            return truncated[:last + 1]
    return truncated + "..."


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip() if "<" in text else text.strip()


def _parse_published_date(date_str: str) -> datetime | None:
    """Try to parse an RSS date string into a datetime."""
    if not date_str:
        return None
    from email.utils import parsedate_to_datetime
    try:
        return parsedate_to_datetime(date_str)
    except Exception:
        pass
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None


def _is_recent(date_str: str, max_age_days: int = 7) -> bool:
    """Check if a published date is within max_age_days. Unknown dates pass."""
    dt = _parse_published_date(date_str)
    if dt is None:
        return True  # benefit of the doubt for unparseable dates
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - dt).days <= max_age_days


# ── Google News RSS fetching ──────────────────────────────────────


async def _fetch_google_news(query: str) -> list[dict[str, Any]]:
    """Fetch articles from Google News RSS for a search query."""
    import feedparser

    url = f"{_GOOGLE_NEWS_BASE}?q={query.replace(' ', '+')}&hl=en&gl=US&ceid=US:en"

    try:
        async with httpx.AsyncClient(
            timeout=_FEED_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; SCHub/1.0)"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except Exception as exc:
        logger.debug("Google News fetch failed for '%s': %s", query, exc)
        return []

    feed = await asyncio.to_thread(feedparser.parse, resp.text)

    articles = []
    for entry in feed.entries[:30]:  # top 30 per query
        title = (entry.get("title") or "").strip()
        if not title:
            continue

        published = entry.get("published") or ""
        if not _is_recent(published, max_age_days=7):
            continue

        # Google News source metadata
        source_name = ""
        if hasattr(entry, "source") and isinstance(entry.source, dict):
            source_name = entry.source.get("title", "")

        # Google News doesn't give useful summaries — title is the content
        articles.append({
            "title": title,
            "source": source_name or "Google News",
            "url": entry.get("link", ""),
            "summary": "",
            "published": published,
            "title_hash": _title_hash(title),
        })

    return articles


# ── Direct RSS feed fetching + article extraction ─────────────────


async def _fetch_direct_feed(name: str, url: str) -> list[dict[str, Any]]:
    """Fetch a direct RSS feed and parse entries."""
    import feedparser

    try:
        async with httpx.AsyncClient(
            timeout=_FEED_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": "SCHub-DisruptionMonitor/1.0 (RSS reader)"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except Exception as exc:
        logger.debug("Feed fetch failed for %s: %s", name, exc)
        return []

    feed = await asyncio.to_thread(feedparser.parse, resp.text)
    articles = []

    for entry in feed.entries[:25]:
        title = (entry.get("title") or "").strip()
        if not title:
            continue

        published = entry.get("published") or entry.get("updated") or ""
        if not _is_recent(published, max_age_days=7):
            continue

        summary = _strip_html(entry.get("summary") or entry.get("description") or "")[:500]
        link = entry.get("link") or ""

        articles.append({
            "title": title,
            "source": name,
            "url": link,
            "summary": summary,
            "published": published,
            "title_hash": _title_hash(title),
        })

    return articles


async def _extract_article_body(url: str) -> str | None:
    """Fetch and extract article body text using trafilatura."""
    if not url or "news.google.com" in url:
        return None

    try:
        import trafilatura
        downloaded = await asyncio.to_thread(
            trafilatura.fetch_url, url,
        )
        if not downloaded:
            return None
        text = await asyncio.to_thread(
            trafilatura.extract, downloaded,
            include_comments=False,
            include_tables=False,
        )
        if text and len(text) > 100:
            return _truncate_body(text)
        return None
    except Exception as exc:
        logger.debug("Article extraction failed for %s: %s", url[:80], exc)
        return None


_EXTRACT_SEMAPHORE = asyncio.Semaphore(10)  # max 10 concurrent article fetches


async def _extract_with_limit(url: str) -> str | None:
    async with _EXTRACT_SEMAPHORE:
        return await _extract_article_body(url)


async def _enrich_with_full_text(articles: list[dict[str, Any]]) -> None:
    """Extract full article body for the top N relevant articles (in-place)."""
    extractable = [
        a for a in articles
        if a.get("url")
        and "news.google.com" not in a["url"]
        and _is_relevant(a["title"], a.get("summary", ""))
    ][:_MAX_FULL_TEXT_ARTICLES]

    if not extractable:
        return

    tasks = [_extract_with_limit(a["url"]) for a in extractable]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    extracted_count = 0
    for article, result in zip(extractable, results):
        if isinstance(result, str) and result:
            article["body"] = result
            extracted_count += 1

    if extracted_count:
        logger.info("Extracted full text from %d/%d articles", extracted_count, len(extractable))


# ── Formatting for prompt injection ───────────────────────────────


def _format_articles(articles: list[dict[str, Any]]) -> str:
    """Format articles into a text block for Claude prompt injection.

    Articles with extracted body text get full treatment.
    Headline-only articles (Google News) get compact format.
    """
    if not articles:
        return ""

    seen: set[str] = set()
    sections: list[str] = []

    # First: articles with full body text (most valuable)
    for a in articles:
        h = a.get("title_hash") or _title_hash(a["title"])
        if h in seen or "body" not in a:
            continue
        seen.add(h)

        source = a.get("source", "")
        published = a.get("published", a.get("published_at", ""))
        tag = f"{source}, {published}" if source and published else (source or published)

        sections.append(
            f"### {a['title']} ({tag})\n{a['body']}"
        )

    # Then: articles with summaries
    for a in articles:
        h = a.get("title_hash") or _title_hash(a["title"])
        if h in seen:
            continue
        summary = a.get("summary", "")
        if not summary:
            continue
        seen.add(h)

        source = a.get("source", "")
        published = a.get("published", a.get("published_at", ""))
        tag = f"{source}, {published}" if source and published else (source or published)
        sections.append(f"- {a['title']} ({tag})\n  {summary}")

    # Finally: headline-only articles
    for a in articles:
        h = a.get("title_hash") or _title_hash(a["title"])
        if h in seen:
            continue
        seen.add(h)

        source = a.get("source", "")
        sections.append(f"- {a['title']} ({source})")

    return "\n\n".join(sections)


# ── Main entry point ──────────────────────────────────────────────


def _cache_is_warm(mode: str) -> bool:
    from ..db.database import get_news_cache_age
    age = get_news_cache_age(mode)
    return age is not None and age < _CACHE_TTL_SECONDS


async def fetch_search_context(mode: str) -> str | None:
    """Fetch live news context for a scan mode.

    Drop-in replacement for the old Serper integration. Returns formatted
    text block of recent articles with full body text where available.

    Two-layer strategy:
      1. Google News RSS — broad, SKF-targeted search queries
      2. Industry RSS feeds — deep, with article body extraction
    """
    from ..db.database import get_cached_news, save_news_articles, prune_old_news

    # Return cached articles if fresh enough
    if _cache_is_warm(mode):
        articles = get_cached_news(mode, max_age_hours=24, limit=_MAX_ARTICLES_PER_SCAN)
        if articles:
            logger.info("News cache hit for %s: %d articles", mode, len(articles))
            return _format_articles(articles) or None

    # ── Layer 1: Google News RSS (breadth) ────────────────────────
    queries = _GOOGLE_NEWS_QUERIES.get(mode, _GOOGLE_NEWS_QUERIES["disruptions"])
    gnews_tasks = [_fetch_google_news(q) for q in queries]

    # ── Layer 2: Direct RSS feeds (depth) ─────────────────────────
    feeds = [(n, u) for n, u, modes in _DIRECT_FEEDS if mode in modes]
    feed_tasks = [_fetch_direct_feed(n, u) for n, u in feeds]

    # Fetch both layers concurrently
    logger.info("Fetching news for %s: %d Google queries + %d RSS feeds", mode, len(queries), len(feeds))
    all_results = await asyncio.gather(
        *gnews_tasks, *feed_tasks,
        return_exceptions=True,
    )

    all_articles: list[dict[str, Any]] = []
    sources_ok = 0
    for r in all_results:
        if isinstance(r, list) and r:
            all_articles.extend(r)
            sources_ok += 1
        elif isinstance(r, Exception):
            logger.debug("News source failed: %s", r)

    if not all_articles:
        logger.warning("No news articles fetched for %s", mode)
        return None

    # Deduplicate by title hash
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for a in all_articles:
        h = a["title_hash"]
        if h not in seen:
            seen.add(h)
            unique.append(a)

    # Filter for SKF relevance (Google News headlines are pre-filtered by query,
    # but general feeds like BBC/Al Jazeera need filtering)
    relevant = [a for a in unique if _is_relevant(a["title"], a.get("summary", ""))]

    # Cap total articles
    relevant = relevant[:_MAX_ARTICLES_PER_SCAN]

    # Extract full article text for top direct-feed articles
    await _enrich_with_full_text(relevant)

    # Tag all articles with mode
    for a in relevant:
        a["mode_tags"] = [mode]
        # Merge body into summary for caching
        if "body" in a and a["body"]:
            a["summary"] = a["body"]

    # Persist to cache
    try:
        save_news_articles(relevant, mode)
        prune_old_news(max_age_hours=_PRUNE_AGE_HOURS)
    except Exception as exc:
        logger.warning("News cache write failed (non-fatal): %s", exc)

    body_count = sum(1 for a in relevant if a.get("body"))
    logger.info(
        "News: %d relevant articles (%d with full text) from %d/%d sources for %s",
        len(relevant), body_count, sources_ok, len(queries) + len(feeds), mode,
    )
    return _format_articles(relevant) or None

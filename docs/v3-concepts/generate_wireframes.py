"""Generate V3 concept wireframe mockups using Pillow (default font only)."""

from PIL import Image, ImageDraw, ImageFont
import math
import os

W, H = 1200, 800
FONT = ImageFont.load_default()
# Larger font via scaling trick: we'll draw text at 1x and note sizes
# Colors
BG = "#F0F0F0"
BG_DARK = "#1A1A2E"
CARD_BG = "#FFFFFF"
CARD_DARK = "#16213E"
BORDER = "#CCCCCC"
TEXT_DARK = "#2C2C2C"
TEXT_MED = "#666666"
TEXT_LIGHT = "#999999"
TEXT_WHITE = "#E8E8E8"
ACCENT_BLUE = "#3B82F6"
ACCENT_RED = "#EF4444"
ACCENT_ORANGE = "#F97316"
ACCENT_YELLOW = "#EAB308"
ACCENT_GREEN = "#22C55E"
ACCENT_TEAL = "#14B8A6"
ACCENT_PURPLE = "#8B5CF6"
MAP_LAND = "#D4D8DD"
MAP_BG = "#E8ECF0"
MAP_DARK_LAND = "#2A3A5C"
MAP_DARK_BG = "#0F1629"


def rounded_rect(draw, xy, radius=8, fill=None, outline=None, width=1):
    """Draw a rounded rectangle."""
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def draw_text_large(draw, pos, text, fill, scale=1):
    """Draw text. scale is ignored (default font), but we use it for spacing."""
    draw.text(pos, text, fill=fill, font=FONT)


def text_width(text):
    """Approximate text width with default font."""
    return len(text) * 6 + 2


def draw_chip(draw, x, y, text, bg_color, text_color="#FFFFFF", w=None):
    """Draw a small chip/badge."""
    tw = text_width(text)
    chip_w = w or (tw + 16)
    rounded_rect(draw, (x, y, x + chip_w, y + 22), radius=11, fill=bg_color)
    draw.text((x + 8, y + 5), text, fill=text_color, font=FONT)
    return chip_w


# Simplified world map continent outlines (very rough polygons, normalized 0-1)
CONTINENTS = {
    "north_america": [(0.05, 0.15), (0.12, 0.10), (0.20, 0.12), (0.25, 0.18),
                      (0.22, 0.30), (0.18, 0.38), (0.15, 0.42), (0.10, 0.40),
                      (0.08, 0.35), (0.04, 0.25)],
    "south_america": [(0.20, 0.50), (0.24, 0.48), (0.28, 0.52), (0.30, 0.60),
                      (0.28, 0.72), (0.25, 0.82), (0.22, 0.85), (0.20, 0.78),
                      (0.18, 0.65), (0.17, 0.55)],
    "europe": [(0.42, 0.12), (0.48, 0.10), (0.52, 0.12), (0.54, 0.18),
               (0.52, 0.25), (0.48, 0.28), (0.44, 0.30), (0.42, 0.25),
               (0.40, 0.18)],
    "africa": [(0.42, 0.32), (0.48, 0.30), (0.54, 0.35), (0.56, 0.45),
               (0.54, 0.58), (0.50, 0.68), (0.46, 0.70), (0.42, 0.62),
               (0.40, 0.50), (0.40, 0.40)],
    "asia": [(0.55, 0.08), (0.65, 0.06), (0.75, 0.10), (0.82, 0.15),
             (0.88, 0.20), (0.85, 0.30), (0.78, 0.38), (0.70, 0.40),
             (0.62, 0.35), (0.58, 0.28), (0.55, 0.20)],
    "oceania": [(0.78, 0.55), (0.85, 0.52), (0.92, 0.55), (0.93, 0.62),
                (0.88, 0.68), (0.82, 0.65), (0.78, 0.60)],
    "middle_east": [(0.55, 0.28), (0.60, 0.26), (0.64, 0.30), (0.62, 0.36),
                    (0.58, 0.38), (0.54, 0.34)],
}


def draw_world_map(draw, rect, land_color, bg_color, dot_color=None, dots=None):
    """Draw simplified world map within rect."""
    x0, y0, x1, y1 = rect
    mw, mh = x1 - x0, y1 - y0

    draw.rectangle(rect, fill=bg_color)

    for name, points in CONTINENTS.items():
        scaled = [(int(x0 + px * mw), int(y0 + py * mh)) for px, py in points]
        draw.polygon(scaled, fill=land_color, outline=None)

    # Draw dots if provided
    if dots:
        for dx, dy, color, radius in dots:
            cx = int(x0 + dx * mw)
            cy = int(y0 + dy * mh)
            draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color)


def draw_sparkline(draw, x, y, w, h, color, values=None):
    """Draw a mini sparkline chart."""
    if values is None:
        values = [3, 5, 4, 7, 6, 8, 5, 9, 7, 6, 8, 10, 7]
    max_v = max(values)
    min_v = min(values)
    rng = max_v - min_v or 1
    points = []
    for i, v in enumerate(values):
        px = x + int(i / (len(values) - 1) * w)
        py = y + h - int((v - min_v) / rng * h)
        points.append((px, py))
    for i in range(len(points) - 1):
        draw.line([points[i], points[i + 1]], fill=color, width=2)


# ============================================================
# CONCEPT A — Mission Control
# ============================================================
def generate_concept_a():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Full-bleed world map background
    map_dots = [
        (0.47, 0.18, ACCENT_RED, 6),      # Europe - critical
        (0.50, 0.22, ACCENT_RED, 5),       # Mediterranean
        (0.70, 0.25, ACCENT_ORANGE, 5),    # East Asia
        (0.62, 0.30, ACCENT_ORANGE, 4),    # Middle East
        (0.15, 0.30, ACCENT_YELLOW, 4),    # North America
        (0.25, 0.60, ACCENT_GREEN, 3),     # South America
        (0.48, 0.50, ACCENT_YELLOW, 4),    # Africa
        (0.85, 0.58, ACCENT_GREEN, 3),     # Oceania
        (0.75, 0.18, ACCENT_RED, 5),       # China
        (0.20, 0.25, ACCENT_ORANGE, 4),    # US East
        (0.44, 0.16, ACCENT_ORANGE, 4),    # UK
        (0.65, 0.22, ACCENT_YELLOW, 3),    # India
    ]
    draw_world_map(draw, (0, 40, W, H - 50), "#C8CED6", "#DDE2E8", dots=map_dots)

    # Title bar (semi-transparent feel)
    draw.rectangle((0, 0, W, 40), fill="#2C2C2C")
    draw.text((20, 12), "V3 CONCEPT A  |  MISSION CONTROL", fill="#FFFFFF", font=FONT)
    draw.text((W - 200, 12), "SC Hub Disruption Monitor", fill=TEXT_LIGHT, font=FONT)

    # Floating KPI badges top-left
    kpi_y = 58
    rounded_rect(draw, (16, kpi_y, 190, kpi_y + 80), radius=10, fill="#FFFFFFDD", outline=BORDER)
    draw.text((28, kpi_y + 8), "ACTIVE EVENTS", fill=TEXT_LIGHT, font=FONT)
    draw.text((28, kpi_y + 24), "12", fill=TEXT_DARK, font=FONT)
    draw.text((52, kpi_y + 24), "events tracked", fill=TEXT_MED, font=FONT)
    draw.text((28, kpi_y + 42), "CRITICAL: 3", fill=ACCENT_RED, font=FONT)
    draw.text((28, kpi_y + 56), "SITES AFFECTED: 47", fill=ACCENT_ORANGE, font=FONT)

    # Floating severity chips overlaying the map
    # Critical event card near Europe
    cx, cy = 520, 130
    rounded_rect(draw, (cx, cy, cx + 240, cy + 100), radius=10, fill="#FFFFFFEE", outline=ACCENT_RED, width=2)
    draw.rectangle((cx, cy, cx + 6, cy + 100), fill=ACCENT_RED)
    draw.text((cx + 14, cy + 8), "CRITICAL", fill=ACCENT_RED, font=FONT)
    draw.text((cx + 14, cy + 24), "Baltic Port Shutdown", fill=TEXT_DARK, font=FONT)
    draw.text((cx + 14, cy + 40), "Northern Europe | 2h ago", fill=TEXT_MED, font=FONT)
    draw.text((cx + 14, cy + 56), "Impact: 14 sites, 89 suppliers", fill=TEXT_DARK, font=FONT)
    draw.text((cx + 14, cy + 72), "Severity: 92/100", fill=ACCENT_RED, font=FONT)
    # Severity bar
    draw.rectangle((cx + 120, cy + 74, cx + 228, cy + 82), fill="#E0E0E0")
    draw.rectangle((cx + 120, cy + 74, cx + 120 + int(108 * 0.92), cy + 82), fill=ACCENT_RED)

    # High event card near Asia
    cx2, cy2 = 790, 200
    rounded_rect(draw, (cx2, cy2, cx2 + 220, cy2 + 80), radius=10, fill="#FFFFFFEE", outline=ACCENT_ORANGE, width=2)
    draw.rectangle((cx2, cy2, cx2 + 6, cy2 + 80), fill=ACCENT_ORANGE)
    draw.text((cx2 + 14, cy2 + 8), "HIGH", fill=ACCENT_ORANGE, font=FONT)
    draw.text((cx2 + 14, cy2 + 24), "Semiconductor Shortage", fill=TEXT_DARK, font=FONT)
    draw.text((cx2 + 14, cy2 + 40), "East Asia | 5h ago", fill=TEXT_MED, font=FONT)
    draw.text((cx2 + 14, cy2 + 56), "Impact: 8 sites", fill=TEXT_DARK, font=FONT)

    # Medium event chip near Middle East
    cx3, cy3 = 660, 320
    rounded_rect(draw, (cx3, cy3, cx3 + 200, cy3 + 60), radius=10, fill="#FFFFFFDD", outline=ACCENT_YELLOW, width=2)
    draw.rectangle((cx3, cy3, cx3 + 6, cy3 + 60), fill=ACCENT_YELLOW)
    draw.text((cx3 + 14, cy3 + 8), "MEDIUM", fill=ACCENT_YELLOW, font=FONT)
    draw.text((cx3 + 14, cy3 + 24), "Red Sea Rerouting", fill=TEXT_DARK, font=FONT)
    draw.text((cx3 + 14, cy3 + 40), "Middle East | 1d ago", fill=TEXT_MED, font=FONT)

    # Expanded card example — bottom left overlaying map
    ex, ey = 16, 420
    rounded_rect(draw, (ex, ey, ex + 380, ey + 310), radius=12, fill="#FFFFFFFA", outline="#3B82F6", width=2)
    draw.rectangle((ex, ey, ex + 380, ey + 36), fill=ACCENT_BLUE)
    draw.text((ex + 12, ey + 10), "EVENT DETAIL  |  Baltic Port Shutdown", fill="#FFFFFF", font=FONT)
    # Detail content
    dy = ey + 46
    draw.text((ex + 16, dy), "Status: Active", fill=ACCENT_RED, font=FONT)
    draw.text((ex + 16, dy + 18), "Severity: 92/100 (Critical)", fill=TEXT_DARK, font=FONT)
    draw.text((ex + 16, dy + 36), "Region: Northern Europe", fill=TEXT_DARK, font=FONT)
    draw.text((ex + 16, dy + 54), "Mode: Supply Chain Disruption", fill=TEXT_DARK, font=FONT)

    # Separator
    draw.line((ex + 16, dy + 74, ex + 364, dy + 74), fill=BORDER)
    draw.text((ex + 16, dy + 82), "AFFECTED SITES", fill=TEXT_LIGHT, font=FONT)
    sites_list = ["Gothenburg (MFG)", "Luton (MFG)", "Schweinfurt (MFG)",
                  "Hamburg (Logistics)", "Rotterdam (Logistics)"]
    for i, s in enumerate(sites_list):
        draw.ellipse((ex + 20, dy + 100 + i * 16, ex + 26, dy + 106 + i * 16), fill=ACCENT_RED)
        draw.text((ex + 32, dy + 97 + i * 16), s, fill=TEXT_DARK, font=FONT)

    draw.line((ex + 16, dy + 185, ex + 364, dy + 185), fill=BORDER)
    draw.text((ex + 16, dy + 193), "RECOMMENDED ACTIONS", fill=TEXT_LIGHT, font=FONT)
    actions = ["Activate backup suppliers in Southern EU",
               "Reroute shipments via Antwerp corridor",
               "Notify aerospace BU of 72h delay risk"]
    for i, a in enumerate(actions):
        draw.text((ex + 20, dy + 211 + i * 16), f"{i+1}.", fill=ACCENT_BLUE, font=FONT)
        draw.text((ex + 36, dy + 211 + i * 16), a, fill=TEXT_DARK, font=FONT)

    # Bottom dock bar
    dock_y = H - 50
    draw.rectangle((0, dock_y, W, H), fill="#2C2C2CEC")
    modes = [("Disruptions", ACCENT_RED, True), ("Geopolitical", ACCENT_PURPLE, False),
             ("Trade", ACCENT_TEAL, False)]
    mx = W // 2 - 180
    for label, color, active in modes:
        tw = text_width(label)
        bw = tw + 28
        if active:
            rounded_rect(draw, (mx, dock_y + 10, mx + bw, dock_y + 34), radius=12, fill=color)
            draw.text((mx + 14, dock_y + 15), label, fill="#FFFFFF", font=FONT)
        else:
            rounded_rect(draw, (mx, dock_y + 10, mx + bw, dock_y + 34), radius=12, fill="#444444", outline=color)
            draw.text((mx + 14, dock_y + 15), label, fill=color, font=FONT)
        mx += bw + 16

    # Quick action buttons in dock
    draw.text((W - 260, dock_y + 15), "Last scan: 4m ago", fill=TEXT_LIGHT, font=FONT)
    rounded_rect(draw, (W - 130, dock_y + 8, W - 20, dock_y + 36), radius=14, fill=ACCENT_BLUE)
    draw.text((W - 112, dock_y + 15), "Scan Now", fill="#FFFFFF", font=FONT)

    # Connection lines from expanded card to map dot
    draw.line((396, 500, 520, 170), fill=ACCENT_BLUE, width=1)

    return img


# ============================================================
# CONCEPT B — News Feed First
# ============================================================
def generate_concept_b():
    img = Image.new("RGB", (W, H), BG_DARK)
    draw = ImageDraw.Draw(img)

    # Title bar
    draw.rectangle((0, 0, W, 44), fill="#0D1117")
    draw.text((20, 14), "V3 CONCEPT B  |  NEWS FEED FIRST", fill="#FFFFFF", font=FONT)
    draw.text((W - 200, 14), "SC Hub Disruption Monitor", fill=TEXT_LIGHT, font=FONT)

    # Top bar with search and filters
    draw.rectangle((0, 44, W, 84), fill="#161B22")
    # Search box
    rounded_rect(draw, (16, 52, 320, 76), radius=6, fill="#0D1117", outline="#30363D")
    draw.text((28, 58), "Search events, regions, suppliers...", fill="#484F58", font=FONT)
    # Filter chips
    filters = [("All", True), ("Critical", False), ("High", False), ("24h", False)]
    fx = 340
    for label, active in filters:
        tw = text_width(label) + 16
        if active:
            rounded_rect(draw, (fx, 54, fx + tw, 74), radius=10, fill=ACCENT_BLUE)
            draw.text((fx + 8, 58), label, fill="#FFFFFF", font=FONT)
        else:
            rounded_rect(draw, (fx, 54, fx + tw, 74), radius=10, fill="#21262D", outline="#30363D")
            draw.text((fx + 8, 58), label, fill=TEXT_LIGHT, font=FONT)
        fx += tw + 8

    # Mode toggle
    modes = [("Disruptions", True), ("Geopolitical", False), ("Trade", False)]
    mx = fx + 40
    for label, active in modes:
        tw = text_width(label) + 16
        if active:
            rounded_rect(draw, (mx, 54, mx + tw, 74), radius=10, fill=ACCENT_RED)
            draw.text((mx + 8, 58), label, fill="#FFFFFF", font=FONT)
        else:
            rounded_rect(draw, (mx, 54, mx + tw, 74), radius=10, fill="#21262D", outline="#30363D")
            draw.text((mx + 8, 58), label, fill="#8B949E", font=FONT)
        mx += tw + 8

    # Left 65% — vertical feed
    feed_w = int(W * 0.65)
    feed_x = 0
    draw.line((feed_w, 84, feed_w, H), fill="#30363D")

    # Feed header
    draw.rectangle((0, 84, feed_w, 110), fill="#161B22")
    draw.text((20, 92), "LIVE FEED", fill=ACCENT_RED, font=FONT)
    draw.ellipse((76, 94, 82, 100), fill=ACCENT_RED)  # live dot
    draw.text((90, 92), "12 active events", fill=TEXT_LIGHT, font=FONT)
    draw.text((feed_w - 120, 92), "Sort: Severity", fill=TEXT_LIGHT, font=FONT)

    # Event cards in feed
    events = [
        ("CRITICAL", ACCENT_RED, "Baltic Port Shutdown", "Northern Europe", "2h ago", "92", [8,10,9,12,11,14,12]),
        ("CRITICAL", ACCENT_RED, "Taiwan Strait Tensions Escalate", "East Asia", "3h ago", "89", [5,7,8,10,12,11,13]),
        ("HIGH", ACCENT_ORANGE, "Semiconductor Supply Constraint", "Global", "5h ago", "76", [4,5,6,5,7,8,7]),
        ("HIGH", ACCENT_ORANGE, "Suez Canal Congestion", "Middle East", "8h ago", "71", [6,6,7,8,7,9,8]),
        ("MEDIUM", ACCENT_YELLOW, "EU Carbon Border Tax Phase 2", "Europe", "12h ago", "58", [3,4,3,5,4,5,4]),
        ("MEDIUM", ACCENT_YELLOW, "India Export Controls Update", "South Asia", "1d ago", "52", [2,3,4,3,4,5,4]),
        ("LOW", ACCENT_GREEN, "Brazil Logistics Modernization", "South America", "1d ago", "34", [2,2,3,2,3,3,2]),
    ]

    cy = 114
    for sev_label, sev_color, title, region, time, score, sparkdata in events:
        card_h = 72
        if cy + card_h > H - 10:
            break
        # Card background
        rounded_rect(draw, (12, cy, feed_w - 12, cy + card_h), radius=8, fill=CARD_DARK)
        # Severity bar on left edge
        draw.rectangle((12, cy, 18, cy + card_h), fill=sev_color)
        # Severity label
        draw_chip(draw, 26, cy + 6, sev_label, sev_color)
        # Title
        draw.text((26, cy + 32), title, fill=TEXT_WHITE, font=FONT)
        # Region and time
        draw.text((26, cy + 50), f"{region}  |  {time}", fill="#8B949E", font=FONT)
        # Impact score on right
        draw.text((feed_w - 100, cy + 10), "IMPACT", fill="#484F58", font=FONT)
        draw.text((feed_w - 100, cy + 26), f"{score}/100", fill=sev_color, font=FONT)
        # Mini sparkline
        draw_sparkline(draw, feed_w - 100, cy + 44, 70, 18, sev_color, sparkdata)

        cy += card_h + 8

    # Right 35% — small map + summary
    map_x = feed_w + 1
    # Map section header
    draw.rectangle((map_x, 84, W, 110), fill="#161B22")
    draw.text((map_x + 12, 92), "GLOBAL VIEW", fill=TEXT_WHITE, font=FONT)

    # Map
    map_dots = [
        (0.47, 0.18, ACCENT_RED, 5), (0.75, 0.18, ACCENT_RED, 5),
        (0.62, 0.30, ACCENT_ORANGE, 4), (0.15, 0.30, ACCENT_YELLOW, 3),
        (0.50, 0.50, ACCENT_YELLOW, 3), (0.85, 0.58, ACCENT_GREEN, 2),
        (0.25, 0.60, ACCENT_GREEN, 2),
    ]
    draw_world_map(draw, (map_x + 8, 118, W - 8, 380), MAP_DARK_LAND, MAP_DARK_BG, dots=map_dots)
    rounded_rect(draw, (map_x + 8, 118, W - 8, 380), radius=8, outline="#30363D")

    # Summary stats below map
    stats_y = 395
    draw.text((map_x + 12, stats_y), "RISK SUMMARY", fill=TEXT_LIGHT, font=FONT)

    stats = [("Critical", "3", ACCENT_RED), ("High", "4", ACCENT_ORANGE),
             ("Medium", "3", ACCENT_YELLOW), ("Low", "2", ACCENT_GREEN)]
    for i, (label, count, color) in enumerate(stats):
        sy = stats_y + 22 + i * 30
        rounded_rect(draw, (map_x + 12, sy, W - 12, sy + 24), radius=4, fill="#21262D")
        draw.rectangle((map_x + 12, sy, map_x + 18, sy + 24), fill=color)
        draw.text((map_x + 26, sy + 6), label, fill=TEXT_WHITE, font=FONT)
        draw.text((W - 40, sy + 6), count, fill=color, font=FONT)

    # Region breakdown
    rb_y = stats_y + 150
    draw.text((map_x + 12, rb_y), "TOP AFFECTED REGIONS", fill=TEXT_LIGHT, font=FONT)
    regions = [("Northern Europe", 0.85, ACCENT_RED), ("East Asia", 0.72, ACCENT_ORANGE),
               ("Middle East", 0.58, ACCENT_YELLOW), ("South Asia", 0.40, ACCENT_YELLOW),
               ("Americas", 0.25, ACCENT_GREEN)]
    bar_max = W - map_x - 30
    for i, (region, pct, color) in enumerate(regions):
        ry = rb_y + 20 + i * 28
        draw.text((map_x + 12, ry), region, fill=TEXT_LIGHT, font=FONT)
        bar_x = map_x + 130
        bar_w = int((W - map_x - 142) * pct)
        rounded_rect(draw, (bar_x, ry, bar_x + bar_w, ry + 14), radius=3, fill=color)
        rounded_rect(draw, (bar_x, ry, W - 12, ry + 14), radius=3, outline="#30363D")

    # Last scan indicator
    draw.rectangle((map_x, H - 36, W, H), fill="#0D1117")
    draw.text((map_x + 12, H - 26), "Last scan: 4 min ago", fill="#484F58", font=FONT)
    draw.ellipse((W - 30, H - 24, W - 22, H - 16), fill=ACCENT_GREEN)
    draw.text((W - 80, H - 26), "Online", fill=ACCENT_GREEN, font=FONT)

    return img


# ============================================================
# CONCEPT C — Radial Command Center
# ============================================================
def generate_concept_c():
    img = Image.new("RGB", (W, H), "#0F1923")
    draw = ImageDraw.Draw(img)

    # Title bar
    draw.rectangle((0, 0, W, 44), fill="#0A1018")
    draw.text((20, 14), "V3 CONCEPT C  |  RADIAL COMMAND CENTER", fill="#FFFFFF", font=FONT)
    draw.text((W - 200, 14), "SC Hub Disruption Monitor", fill=TEXT_LIGHT, font=FONT)

    # Breadcrumb
    draw.rectangle((0, 44, W, 68), fill="#131D2A")
    draw.text((20, 50), "All Sites", fill=ACCENT_BLUE, font=FONT)
    draw.text((82, 50), ">", fill=TEXT_LIGHT, font=FONT)
    draw.text((96, 50), "Industrial", fill=ACCENT_BLUE, font=FONT)
    draw.text((156, 50), ">", fill=TEXT_LIGHT, font=FONT)
    draw.text((170, 50), "Gothenburg", fill=TEXT_WHITE, font=FONT)

    # Radial visualization area (left 70%)
    radial_w = int(W * 0.68)
    panel_x = radial_w

    # Center hub
    cx, cy = radial_w // 2, (H - 68) // 2 + 68
    hub_r = 40
    # Draw concentric rings
    for r, alpha in [(280, "#1A2A3D"), (220, "#1E3045"), (160, "#22364D")]:
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline="#2A3A4D", width=1)

    # SKF hub
    draw.ellipse((cx - hub_r, cy - hub_r, cx + hub_r, cy + hub_r), fill=ACCENT_BLUE, outline="#FFFFFF", width=2)
    draw.text((cx - 12, cy - 10), "SKF", fill="#FFFFFF", font=FONT)
    draw.text((cx - 16, cy + 4), "Global", fill="#CCE0FF", font=FONT)

    # BU groups with site nodes
    bus = [
        ("Industrial", 32, ACCENT_BLUE, 140, -40),
        ("Aerospace", 10, ACCENT_PURPLE, 140, 140),
        ("Seals", 14, ACCENT_TEAL, 140, -160),
        ("Lubrication", 12, ACCENT_GREEN, 140, 60),
    ]

    bu_positions = []
    angles = [(-0.6), (0.5), (-1.8), (1.8)]
    for i, (bu_name, count, color, dist, _) in enumerate(bus):
        angle = angles[i]
        bx = cx + int(dist * math.cos(angle))
        by = cy + int(dist * math.sin(angle))
        bu_positions.append((bx, by, color, bu_name))

        # Line from hub to BU node
        draw.line((cx, cy, bx, by), fill=color, width=2)

        # BU node
        r = 24
        draw.ellipse((bx - r, by - r, bx + r, by + r), fill=color, outline="#FFFFFF", width=1)
        # Center text in node
        tw = text_width(bu_name[:4])
        draw.text((bx - tw // 2, by - 8), bu_name[:4], fill="#FFFFFF", font=FONT)
        draw.text((bx - 6, by + 4), str(count), fill="#FFFFFFAA", font=FONT)

        # Site nodes radiating from BU
        num_sites = min(count // 4, 6)
        site_dist = 70
        for j in range(num_sites):
            sa = angle + (j - num_sites / 2) * 0.35
            sx = bx + int(site_dist * math.cos(sa))
            sy = by + int(site_dist * math.sin(sa))
            sr = 8
            # Some sites affected (red outline)
            affected = j < 2
            fill_c = "#1A2A3D" if not affected else "#3D1A1A"
            outline_c = color if not affected else ACCENT_RED
            draw.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=fill_c, outline=outline_c, width=2)
            draw.line((bx, by, sx, sy), fill=color + "66", width=1)

    # Threat nodes on outer ring
    threats = [
        ("Baltic\nShutdown", ACCENT_RED, -0.3, 270),
        ("Taiwan\nTension", ACCENT_RED, 0.8, 270),
        ("Suez\nCongestion", ACCENT_ORANGE, 2.2, 250),
        ("Carbon\nTax", ACCENT_YELLOW, -1.4, 240),
        ("India\nExport", ACCENT_YELLOW, 3.5, 240),
    ]
    for label, color, angle, dist in threats:
        tx = cx + int(dist * math.cos(angle))
        ty = cy + int(dist * math.sin(angle))
        # Threat node — diamond shape
        d = 18
        diamond = [(tx, ty - d), (tx + d, ty), (tx, ty + d), (tx - d, ty)]
        draw.polygon(diamond, fill=color, outline="#FFFFFF", width=1)
        # Label
        lines = label.split("\n")
        for li, line in enumerate(lines):
            draw.text((tx + d + 6, ty - 8 + li * 14), line, fill=color, font=FONT)

        # Connection lines to affected BU nodes
        for bx, by, bc, bn in bu_positions[:2]:  # connect to first 2 BUs
            draw.line((tx, ty, bx, by), fill=color + "44", width=1)

    # Right panel — selected threat detail
    draw.rectangle((panel_x, 68, W, H), fill="#131D2A")
    draw.line((panel_x, 68, panel_x, H), fill="#2A3A4D")

    # Panel header
    draw.rectangle((panel_x, 68, W, 104), fill="#1A2838")
    draw.text((panel_x + 16, 80), "THREAT DETAIL", fill=TEXT_LIGHT, font=FONT)

    # Selected threat
    py = 116
    draw.rectangle((panel_x + 12, py, panel_x + 18, py + 60), fill=ACCENT_RED)
    draw.text((panel_x + 26, py), "Baltic Port Shutdown", fill=TEXT_WHITE, font=FONT)
    draw.text((panel_x + 26, py + 16), "Severity: 92/100", fill=ACCENT_RED, font=FONT)
    draw.text((panel_x + 26, py + 32), "Northern Europe", fill=TEXT_LIGHT, font=FONT)
    draw.text((panel_x + 26, py + 48), "Active since: 2h ago", fill=TEXT_LIGHT, font=FONT)

    # Affected sites
    py += 80
    draw.text((panel_x + 16, py), "AFFECTED SITES (14)", fill=TEXT_LIGHT, font=FONT)
    affected_sites = [
        ("Gothenburg", "MFG", ACCENT_RED), ("Luton", "MFG", ACCENT_RED),
        ("Schweinfurt", "MFG", ACCENT_ORANGE), ("Hamburg", "LOG", ACCENT_ORANGE),
        ("Rotterdam", "LOG", ACCENT_YELLOW), ("Steyr", "MFG", ACCENT_YELLOW),
    ]
    for i, (name, typ, color) in enumerate(affected_sites):
        sy = py + 20 + i * 24
        draw.ellipse((panel_x + 20, sy + 2, panel_x + 28, sy + 10), fill=color)
        draw.text((panel_x + 36, sy), f"{name} ({typ})", fill=TEXT_WHITE, font=FONT)

    # Impact metrics
    py += 175
    draw.line((panel_x + 16, py, W - 16, py), fill="#2A3A4D")
    draw.text((panel_x + 16, py + 10), "IMPACT METRICS", fill=TEXT_LIGHT, font=FONT)

    metrics = [("Revenue at Risk", "$14.2M"), ("Lead Time Impact", "+12 days"),
               ("Suppliers Affected", "89"), ("Alt Routes Available", "3")]
    for i, (label, value) in enumerate(metrics):
        my = py + 30 + i * 36
        rounded_rect(draw, (panel_x + 16, my, W - 16, my + 30), radius=6, fill="#1A2838")
        draw.text((panel_x + 24, my + 4), label, fill=TEXT_LIGHT, font=FONT)
        draw.text((panel_x + 24, my + 16), value, fill=TEXT_WHITE, font=FONT)

    # Action buttons at bottom
    by = H - 50
    rounded_rect(draw, (panel_x + 16, by, panel_x + 140, by + 32), radius=6, fill=ACCENT_RED)
    draw.text((panel_x + 32, by + 10), "Send Alert", fill="#FFFFFF", font=FONT)
    rounded_rect(draw, (panel_x + 150, by, W - 16, by + 32), radius=6, fill=ACCENT_BLUE)
    draw.text((panel_x + 166, by + 10), "View Briefing", fill="#FFFFFF", font=FONT)

    return img


# ============================================================
# CONCEPT D — Dashboard Tiles
# ============================================================
def generate_concept_d():
    img = Image.new("RGB", (W, H), "#F5F5F5")
    draw = ImageDraw.Draw(img)

    # Title bar
    draw.rectangle((0, 0, W, 44), fill="#1E293B")
    draw.text((20, 14), "V3 CONCEPT D  |  DASHBOARD TILES", fill="#FFFFFF", font=FONT)
    draw.text((W - 200, 14), "SC Hub Disruption Monitor", fill=TEXT_LIGHT, font=FONT)

    # Mode tabs below title
    draw.rectangle((0, 44, W, 72), fill="#FFFFFF")
    draw.line((0, 72, W, 72), fill=BORDER)
    modes = [("Disruptions", True), ("Geopolitical", False), ("Trade", False), ("All Modes", False)]
    mx = 16
    for label, active in modes:
        tw = text_width(label) + 20
        if active:
            draw.rectangle((mx, 70, mx + tw, 72), fill=ACCENT_BLUE)
            draw.text((mx + 10, 52), label, fill=ACCENT_BLUE, font=FONT)
        else:
            draw.text((mx + 10, 52), label, fill=TEXT_MED, font=FONT)
        mx += tw + 8

    # Time range selector
    draw.text((W - 200, 52), "Last 30 days", fill=TEXT_MED, font=FONT)
    rounded_rect(draw, (W - 110, 50, W - 16, 68), radius=4, fill=ACCENT_BLUE)
    draw.text((W - 100, 54), "Scan Now", fill="#FFFFFF", font=FONT)

    # 3x3 grid
    margin = 10
    top_offset = 80
    tile_w = (W - 4 * margin) // 3
    tile_h = (H - top_offset - 4 * margin) // 3

    def tile_rect(col, row):
        x = margin + col * (tile_w + margin)
        y = top_offset + margin + row * (tile_h + margin)
        return (x, y, x + tile_w, y + tile_h)

    def draw_tile_header(x, y, w, title):
        # Drag handle dots
        for di in range(3):
            for dj in range(2):
                draw.ellipse((x + 8 + di * 6, y + 10 + dj * 6, x + 11 + di * 6, y + 13 + dj * 6), fill="#CCCCCC")
        draw.text((x + 32, y + 8), title, fill=TEXT_DARK, font=FONT)
        draw.line((x, y + 28, x + w, y + 28), fill="#E5E5E5")

    # Tile 1: World heatmap
    tx, ty, tx2, ty2 = tile_rect(0, 0)
    rounded_rect(draw, (tx, ty, tx2, ty2), radius=8, fill=CARD_BG, outline=BORDER)
    draw_tile_header(tx, ty, tile_w, "WORLD RISK HEATMAP")
    map_dots = [
        (0.47, 0.20, ACCENT_RED, 4), (0.75, 0.18, ACCENT_RED, 4),
        (0.62, 0.32, ACCENT_ORANGE, 3), (0.15, 0.28, ACCENT_YELLOW, 3),
        (0.50, 0.52, ACCENT_GREEN, 2), (0.85, 0.58, ACCENT_GREEN, 2),
    ]
    draw_world_map(draw, (tx + 6, ty + 32, tx2 - 6, ty2 - 6), "#D8DDE4", "#EDF0F4", dots=map_dots)

    # Tile 2: Active events list
    tx, ty, tx2, ty2 = tile_rect(1, 0)
    rounded_rect(draw, (tx, ty, tx2, ty2), radius=8, fill=CARD_BG, outline=BORDER)
    draw_tile_header(tx, ty, tile_w, "ACTIVE EVENTS")
    events = [
        ("Baltic Port Shutdown", "CRT", ACCENT_RED),
        ("Taiwan Strait Tensions", "CRT", ACCENT_RED),
        ("Semiconductor Shortage", "HGH", ACCENT_ORANGE),
        ("Suez Canal Congestion", "HGH", ACCENT_ORANGE),
        ("EU Carbon Tax Phase 2", "MED", ACCENT_YELLOW),
        ("India Export Controls", "MED", ACCENT_YELLOW),
        ("Brazil Logistics", "LOW", ACCENT_GREEN),
    ]
    for i, (name, sev, color) in enumerate(events):
        ey = ty + 36 + i * 22
        if ey + 18 > ty2 - 4:
            break
        draw.rectangle((tx + 10, ey, tx + 16, ey + 16), fill=color)
        draw.text((tx + 22, ey + 2), sev, fill=color, font=FONT)
        draw.text((tx + 48, ey + 2), name[:28], fill=TEXT_DARK, font=FONT)

    # Tile 3: Severity donut chart
    tx, ty, tx2, ty2 = tile_rect(2, 0)
    rounded_rect(draw, (tx, ty, tx2, ty2), radius=8, fill=CARD_BG, outline=BORDER)
    draw_tile_header(tx, ty, tile_w, "SEVERITY BREAKDOWN")
    dcx = tx + tile_w // 2
    dcy = ty + 32 + (tile_h - 32) // 2
    dr = min(tile_w, tile_h - 32) // 2 - 20
    # Draw donut segments (approximate with arcs)
    segments = [(ACCENT_RED, 0, 75), (ACCENT_ORANGE, 75, 180),
                (ACCENT_YELLOW, 180, 270), (ACCENT_GREEN, 270, 360)]
    for color, start, end in segments:
        draw.arc((dcx - dr, dcy - dr, dcx + dr, dcy + dr), start - 90, end - 90, fill=color, width=20)
    # Center text
    draw.text((dcx - 8, dcy - 12), "12", fill=TEXT_DARK, font=FONT)
    draw.text((dcx - 16, dcy + 2), "events", fill=TEXT_MED, font=FONT)
    # Legend
    legend = [("Critical: 3", ACCENT_RED), ("High: 4", ACCENT_ORANGE),
              ("Medium: 3", ACCENT_YELLOW), ("Low: 2", ACCENT_GREEN)]
    for i, (label, color) in enumerate(legend):
        lx = tx + 8 + (i % 2) * (tile_w // 2)
        ly = ty2 - 32 + (i // 2) * 14
        draw.ellipse((lx, ly + 2, lx + 8, ly + 10), fill=color)
        draw.text((lx + 12, ly), label, fill=TEXT_MED, font=FONT)

    # Tile 4: Timeline chart
    tx, ty, tx2, ty2 = tile_rect(0, 1)
    rounded_rect(draw, (tx, ty, tx2, ty2), radius=8, fill=CARD_BG, outline=BORDER)
    draw_tile_header(tx, ty, tile_w, "EVENTS OVER 30 DAYS")
    # Bar chart
    chart_y = ty + 40
    chart_h = tile_h - 60
    chart_x = tx + 30
    chart_w = tile_w - 50
    # Y axis
    draw.line((chart_x, chart_y, chart_x, chart_y + chart_h), fill=BORDER)
    # X axis
    draw.line((chart_x, chart_y + chart_h, chart_x + chart_w, chart_y + chart_h), fill=BORDER)
    # Bars (daily events)
    daily = [2,1,3,2,4,3,2,5,4,3,6,4,3,2,5,7,4,3,2,4,3,5,4,3,2,6,5,3,4,3]
    max_d = max(daily)
    bw = max(2, chart_w // len(daily) - 1)
    for i, d in enumerate(daily):
        bh = int(d / max_d * chart_h * 0.85)
        bx = chart_x + 4 + i * (bw + 1)
        color = ACCENT_RED if d >= 6 else ACCENT_ORANGE if d >= 4 else ACCENT_YELLOW if d >= 3 else ACCENT_BLUE
        draw.rectangle((bx, chart_y + chart_h - bh, bx + bw, chart_y + chart_h), fill=color)
    # Labels
    draw.text((chart_x - 8, chart_y), str(max_d), fill=TEXT_LIGHT, font=FONT)
    draw.text((chart_x - 6, chart_y + chart_h - 10), "0", fill=TEXT_LIGHT, font=FONT)
    draw.text((chart_x + 4, chart_y + chart_h + 4), "Mar 13", fill=TEXT_LIGHT, font=FONT)
    draw.text((chart_x + chart_w - 36, chart_y + chart_h + 4), "Apr 12", fill=TEXT_LIGHT, font=FONT)

    # Tile 5: Top affected sites bar chart
    tx, ty, tx2, ty2 = tile_rect(1, 1)
    rounded_rect(draw, (tx, ty, tx2, ty2), radius=8, fill=CARD_BG, outline=BORDER)
    draw_tile_header(tx, ty, tile_w, "TOP AFFECTED SITES")
    sites = [("Gothenburg", 92), ("Luton", 78), ("Schweinfurt", 71),
             ("Steyr", 65), ("Shanghai", 58), ("Pune", 45), ("Dalian", 38)]
    bar_max_w = tile_w - 110
    for i, (name, score) in enumerate(sites):
        sy = ty + 38 + i * 22
        if sy + 18 > ty2 - 4:
            break
        draw.text((tx + 10, sy + 2), name[:12], fill=TEXT_DARK, font=FONT)
        bx = tx + 88
        bw = int(bar_max_w * score / 100)
        color = ACCENT_RED if score >= 80 else ACCENT_ORANGE if score >= 60 else ACCENT_YELLOW
        rounded_rect(draw, (bx, sy + 2, bx + bw, sy + 14), radius=3, fill=color)
        draw.text((bx + bw + 4, sy + 2), str(score), fill=TEXT_MED, font=FONT)

    # Tile 6: Risk by region stacked bars
    tx, ty, tx2, ty2 = tile_rect(2, 1)
    rounded_rect(draw, (tx, ty, tx2, ty2), radius=8, fill=CARD_BG, outline=BORDER)
    draw_tile_header(tx, ty, tile_w, "RISK BY REGION")
    regions = [("N. Europe", [40, 25, 15, 10]), ("E. Asia", [30, 30, 20, 10]),
               ("Middle East", [15, 25, 30, 15]), ("S. Asia", [10, 15, 30, 25]),
               ("Americas", [5, 15, 25, 35]), ("Africa", [5, 10, 20, 30])]
    colors = [ACCENT_RED, ACCENT_ORANGE, ACCENT_YELLOW, ACCENT_GREEN]
    bar_max_w = tile_w - 90
    for i, (name, vals) in enumerate(regions):
        ry = ty + 38 + i * 24
        if ry + 18 > ty2 - 4:
            break
        draw.text((tx + 8, ry + 2), name, fill=TEXT_DARK, font=FONT)
        bx = tx + 80
        total = sum(vals)
        for j, v in enumerate(vals):
            seg_w = int(bar_max_w * v / total)
            draw.rectangle((bx, ry + 2, bx + seg_w, ry + 16), fill=colors[j])
            bx += seg_w

    # Tile 7: KPI numbers
    tx, ty, tx2, ty2 = tile_rect(0, 2)
    rounded_rect(draw, (tx, ty, tx2, ty2), radius=8, fill=CARD_BG, outline=BORDER)
    draw_tile_header(tx, ty, tile_w, "KEY METRICS")
    kpis = [("Active Events", "12", ACCENT_RED), ("Critical", "3", ACCENT_RED),
            ("Sites at Risk", "47", ACCENT_ORANGE), ("Avg Severity", "68", ACCENT_YELLOW),
            ("Suppliers Hit", "142", ACCENT_ORANGE), ("Scans Today", "24", ACCENT_BLUE)]
    kpi_w = (tile_w - 20) // 3
    kpi_h = (tile_h - 50) // 2
    for i, (label, value, color) in enumerate(kpis):
        col, row = i % 3, i // 3
        kx = tx + 10 + col * kpi_w
        ky = ty + 36 + row * kpi_h
        rounded_rect(draw, (kx, ky, kx + kpi_w - 6, ky + kpi_h - 6), radius=6, fill="#F8F9FA", outline="#E5E5E5")
        draw.text((kx + 8, ky + 8), label, fill=TEXT_LIGHT, font=FONT)
        # Large value text (simulated with multiple draws)
        draw.text((kx + 8, ky + 24), value, fill=color, font=FONT)
        # Underline accent
        draw.rectangle((kx + 8, ky + kpi_h - 14, kx + 8 + len(value) * 8, ky + kpi_h - 12), fill=color)

    # Tile 8: Recent scan log
    tx, ty, tx2, ty2 = tile_rect(1, 2)
    rounded_rect(draw, (tx, ty, tx2, ty2), radius=8, fill=CARD_BG, outline=BORDER)
    draw_tile_header(tx, ty, tile_w, "RECENT SCANS")
    scans = [
        ("Disruptions", "4m ago", "3 new", ACCENT_RED),
        ("Geopolitical", "12m ago", "1 new", ACCENT_PURPLE),
        ("Trade", "28m ago", "0 new", ACCENT_TEAL),
        ("Disruptions", "19m ago", "2 new", ACCENT_RED),
        ("Geopolitical", "42m ago", "0 new", ACCENT_PURPLE),
        ("Trade", "1h ago", "1 new", ACCENT_TEAL),
        ("Disruptions", "34m ago", "1 new", ACCENT_RED),
    ]
    for i, (mode, time, result, color) in enumerate(scans):
        sy = ty + 36 + i * 22
        if sy + 18 > ty2 - 4:
            break
        draw.ellipse((tx + 10, sy + 4, tx + 18, sy + 12), fill=color)
        draw.text((tx + 24, sy + 2), mode, fill=TEXT_DARK, font=FONT)
        draw.text((tx + tile_w // 2, sy + 2), time, fill=TEXT_LIGHT, font=FONT)
        draw.text((tx + tile_w - 50, sy + 2), result, fill=color, font=FONT)

    # Tile 9: Supplier exposure table
    tx, ty, tx2, ty2 = tile_rect(2, 2)
    rounded_rect(draw, (tx, ty, tx2, ty2), radius=8, fill=CARD_BG, outline=BORDER)
    draw_tile_header(tx, ty, tile_w, "SUPPLIER EXPOSURE")
    # Table header
    thy = ty + 32
    draw.rectangle((tx + 4, thy, tx2 - 4, thy + 18), fill="#F1F5F9")
    draw.text((tx + 10, thy + 3), "Country", fill=TEXT_LIGHT, font=FONT)
    draw.text((tx + 100, thy + 3), "Suppliers", fill=TEXT_LIGHT, font=FONT)
    draw.text((tx + 170, thy + 3), "At Risk", fill=TEXT_LIGHT, font=FONT)
    draw.text((tx + 240, thy + 3), "Exposure", fill=TEXT_LIGHT, font=FONT)

    suppliers = [
        ("Germany", "842", "124", "14.7%", ACCENT_RED),
        ("China", "634", "89", "14.0%", ACCENT_RED),
        ("Sweden", "421", "47", "11.2%", ACCENT_ORANGE),
        ("India", "389", "38", "9.8%", ACCENT_ORANGE),
        ("USA", "356", "22", "6.2%", ACCENT_YELLOW),
        ("Japan", "312", "18", "5.8%", ACCENT_YELLOW),
        ("Italy", "289", "15", "5.2%", ACCENT_GREEN),
    ]
    for i, (country, total, risk, pct, color) in enumerate(suppliers):
        sy = thy + 22 + i * 20
        if sy + 16 > ty2 - 4:
            break
        if i % 2 == 0:
            draw.rectangle((tx + 4, sy, tx2 - 4, sy + 18), fill="#FAFAFA")
        draw.text((tx + 10, sy + 2), country, fill=TEXT_DARK, font=FONT)
        draw.text((tx + 110, sy + 2), total, fill=TEXT_MED, font=FONT)
        draw.text((tx + 180, sy + 2), risk, fill=color, font=FONT)
        draw.text((tx + 248, sy + 2), pct, fill=color, font=FONT)

    return img


# ============================================================
# Generate all
# ============================================================
if __name__ == "__main__":
    out_dir = "/home/ubuntu/disruption-monitor/docs/v3-concepts"

    concepts = [
        ("concept-a-mission-control.png", generate_concept_a),
        ("concept-b-newsfeed.png", generate_concept_b),
        ("concept-c-radial.png", generate_concept_c),
        ("concept-d-dashboard-tiles.png", generate_concept_d),
    ]

    for filename, gen_func in concepts:
        img = gen_func()
        path = os.path.join(out_dir, filename)
        img.save(path, "PNG", optimize=True)
        size = os.path.getsize(path)
        print(f"  {path}  ({size:,} bytes, {size/1024:.1f} KB)")

    print("\nAll 4 wireframes generated.")

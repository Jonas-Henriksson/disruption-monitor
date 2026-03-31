"""UI Audit — SC Hub Disruption Monitor
Captures screenshots of all major states and inspects the rendered DOM.
"""
from playwright.sync_api import sync_playwright
import os, json, time

OUT = "C:/Users/la_fr/disruption-monitor/.claude/ui-audit"
os.makedirs(OUT, exist_ok=True)

def screenshot(page, name, full_page=False):
    path = f"{OUT}/{name}.png"
    page.screenshot(path=path, full_page=full_page)
    print(f"  Screenshot: {name}.png")
    return path

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})

    # Capture console errors
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

    print("=== SC Hub Disruption Monitor — UI Audit ===\n")

    # 1. Initial Load
    print("1. INITIAL LOAD")
    page.goto("http://localhost:3100", timeout=15000)
    page.wait_for_load_state("networkidle", timeout=15000)
    time.sleep(2)  # Let animations settle
    screenshot(page, "01-initial-load")

    # Check if header rendered
    header_text = page.text_content("body")
    has_sc_hub = "SC Hub" in (header_text or "")
    print(f"   SC Hub title visible: {has_sc_hub}")

    # 2. Check what's visible on load
    print("\n2. VISIBLE ELEMENTS")

    # Count visible buttons
    buttons = page.locator("button").all()
    print(f"   Buttons visible: {len(buttons)}")

    # Check for KPI strip
    body_html = page.content()
    has_kpi = "MFG sites" in body_html or "affected" in body_html
    print(f"   KPI strip visible: {has_kpi}")

    # Check for drawer
    has_drawer = "Active Disruptions" in body_html or "Talking Points" in body_html or "Geopolitical" in body_html
    print(f"   Drawer visible: {has_drawer}")

    # Check for timeline
    has_timeline = "Risk Timeline" in body_html
    print(f"   Timeline strip visible: {has_timeline}")

    # Check for LIVE indicator
    has_live = "LIVE" in body_html or "API" in body_html or "OFFLINE" in body_html
    print(f"   Data source indicator: {has_live}")

    # 3. Screenshot the drawer if open
    print("\n3. DRAWER STATE")
    if has_drawer:
        screenshot(page, "02-drawer-open")
        print("   Drawer is open (auto-opened or has data)")
    else:
        print("   Drawer is closed — trying to trigger scan")
        # Click the Disruptions tab
        disruption_btn = page.locator("button", has_text="Disruptions").first
        if disruption_btn.is_visible():
            disruption_btn.click()
            print("   Clicked Disruptions tab")
            page.wait_for_timeout(3000)
            screenshot(page, "02-after-scan-click")
            # Check if drawer opened
            body_html = page.content()
            has_drawer = "Active Disruptions" in body_html or "Talking Points" in body_html
            print(f"   Drawer opened after click: {has_drawer}")

    # 4. Screenshot with drawer content
    if has_drawer:
        screenshot(page, "03-drawer-content")

        # Check for talking points
        has_talking_points = "Talking Points" in body_html or "HEADLINE" in body_html
        print(f"\n4. TALKING POINTS")
        print(f"   Talking points format: {has_talking_points}")

        # Check for severity badges
        has_severity = "Critical" in body_html or "High" in body_html or "Medium" in body_html
        print(f"   Severity badges visible: {has_severity}")

        # Check for alarm state (dark red KPI bg)
        print(f"   Alarm state rendering: checking...")

    # 5. Try different scan modes
    print("\n5. SCAN MODES")
    for mode in ["Geopolitical", "Trade"]:
        mode_btn = page.locator("button", has_text=mode).first
        if mode_btn.is_visible():
            mode_btn.click()
            page.wait_for_timeout(3000)
            screenshot(page, f"04-mode-{mode.lower()}")
            print(f"   {mode} mode: screenshot captured")

    # 6. Map interaction
    print("\n6. MAP STATE")
    screenshot(page, "05-map-full")

    # Check for SVG map
    svg_count = len(page.locator("svg").all())
    print(f"   SVG elements: {svg_count}")

    # Check for site markers
    site_markers = page.locator("svg g[data-click]").all()
    print(f"   Interactive map elements: {len(site_markers)}")

    # 7. Check the legend
    print("\n7. LEGEND")
    has_legend = "Manufacturing" in body_html and "Logistics" in body_html
    print(f"   Legend visible: {has_legend}")

    # 8. Timeline strip
    print("\n8. TIMELINE")
    timeline_area = page.locator("text=Risk Timeline").first
    if timeline_area.is_visible():
        timeline_area.click()
        page.wait_for_timeout(500)
        screenshot(page, "06-timeline-expanded")
        print("   Timeline expanded: screenshot captured")

        # Check for empty state vs data
        has_no_data = "No timeline data" in page.content() or "accumulates" in page.content()
        has_chart = "tl-gradient" in page.content()
        print(f"   Empty state: {has_no_data}")
        print(f"   Chart data: {has_chart}")

    # 9. Filter panel
    print("\n9. FILTERS")
    filter_btn = page.locator("button", has_text="Filters").first
    if filter_btn.is_visible():
        filter_btn.click()
        page.wait_for_timeout(500)
        screenshot(page, "07-filters-open")
        print("   Filters panel: screenshot captured")

    # 10. Empty state (if no data loaded)
    print("\n10. EMPTY STATE")
    has_empty = "Ready to scan" in page.content()
    print(f"   Empty state visible: {has_empty}")

    # 11. Responsive check — 1280px laptop
    print("\n11. RESPONSIVE (1280px)")
    page.set_viewport_size({"width": 1280, "height": 800})
    page.wait_for_timeout(500)
    screenshot(page, "08-responsive-1280")

    # 12. Console errors
    print("\n12. CONSOLE ERRORS")
    if errors:
        for e in errors[:10]:
            print(f"   ERROR: {e}")
    else:
        print("   No console errors detected")

    # Final summary
    print("\n=== AUDIT COMPLETE ===")
    print(f"Screenshots saved to: {OUT}/")
    print(f"Total screenshots: {len(os.listdir(OUT))}")

    browser.close()

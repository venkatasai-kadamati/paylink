"""Deterministic real-component visual/a11y gates. All API traffic is local fixtures.

Default: compare against hash-locked reference files. A reference-lock PR only
proposes those files; owner merge into main accepts the current look, not a
design-review PASS. --candidate cannot overwrite references or approve itself.
Run against a current-source Next production server on localhost:3100.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import platform
import sys
from urllib.parse import parse_qs, urlparse

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "frontend/tests/visual"
REFERENCE = TESTS / "references"
WORKSPACE = json.loads((TESTS / "fixtures/workspace.json").read_text())
TODAY = date(2026, 11, 24)
WIDTHS = (360, 390, 768, 1280, 1440)
TABS = ("Overview", "Accounts", "Activity", "Insights", "Balance")
AXE = ROOT / "frontend/node_modules/axe-core/axe.min.js"


def report(workspace, days, account):
    """Fixture projection, not production accounting or a ledger assertion."""
    start = TODAY - timedelta(days=days - 1)
    daily = {str(start + timedelta(days=i)): dict(day=str(start + timedelta(days=i)),
        sent_cents=0, received_cents=0, transfer_count=0) for i in range(days)}
    people = defaultdict(lambda: dict(transfer_count=0, amount_cents=0))
    for t in workspace["transfers"]:
        if t["direction"] == "internal" or (account and account not in
                (t["source_account_id"], t["destination_account_id"])):
            continue
        key = str(datetime.fromisoformat(t["created_at"]).date())
        if key not in daily:
            continue
        direction = t["direction"]
        daily[key][direction + "_cents"] += t["amount_cents"]
        daily[key]["transfer_count"] += 1
        name = t["source_label"] if direction == "received" else t["destination_label"]
        person = people[(name, direction)]
        person["transfer_count"] += 1
        person["amount_cents"] += t["amount_cents"]
    summary = {k: sum(d[k] for d in daily.values())
               for k in ("received_cents", "sent_cents", "transfer_count")}
    return dict(period=dict(start=str(start), end=str(TODAY), days=days),
        daily=list(daily.values()), summary=summary,
        previous=dict(received_cents=0, sent_cents=0, transfer_count=0),
        counterparties=[dict(name=n, direction=d, **v) for (n, d), v in
                        sorted(people.items(), key=lambda p: -p[1]["amount_cents"])][:6])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:3100")
    parser.add_argument("--candidate", action="store_true")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/design-quality/after/automated")
    args = parser.parse_args()
    assert urlparse(args.base_url).hostname in {"localhost", "127.0.0.1"}, "Local only"
    assert AXE.is_file(), "Run npm ci --prefix frontend first"
    assert not args.output.resolve().is_relative_to(REFERENCE.resolve()), "References are read-only"
    args.output.mkdir(parents=True, exist_ok=True)
    approved = {} if args.candidate else json.loads((REFERENCE / "approved.json").read_text())
    failures, images, unexpected, page_errors = [], [], [], []
    source = hashlib.sha256()
    dialogs_fixture_path = TESTS / "fixtures/dialogs.json"
    dialogs_fixture = json.loads(dialogs_fixture_path.read_text())
    harness_sha256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    for path in sorted((ROOT / "frontend/app").rglob("*")):
        if path.suffix in {".tsx", ".ts", ".css"}:
            source.update(path.relative_to(ROOT).as_posix().encode() + path.read_bytes())

    def check(condition, message):
        if not condition:
            failures.append(message)

    with sync_playwright() as p:
        # Use the pinned Playwright build, not the machine's arbitrary Chrome.
        browser = p.chromium.launch()

        def context(width, authenticated=True, mode="normal"):
            ctx = browser.new_context(viewport=dict(width=width, height=844 if width < 768 else 1000),
                device_scale_factor=1, locale="en-US", timezone_id="America/Chicago",
                reduced_motion="reduce", color_scheme="light")
            if authenticated:
                ctx.add_cookies([dict(name="paylink_session", value="visual-fixture-not-a-credential",
                    url=args.base_url, httpOnly=True, sameSite="Strict")])
            workspace = deepcopy(WORKSPACE)
            if mode == "empty":
                workspace.update(accounts=[], transfers=[], invitations=[],
                    insights=dict(monthly=dict(transfer_count=0, sent_cents=0, received_cents=0), weekly=[]))
            if mode == "long":
                for a in workspace["accounts"]:
                    a.update(label="Long-term household savings · International relocation reserve", balance_cents=99999999)
                for t in workspace["transfers"]:
                    t.update(counterparty="Alexandria-Josephine Montgomery-Wellington", memo="Shared household reimbursement · " * 5)

            def api(route):
                path = urlparse(route.request.url).path
                params = parse_qs(urlparse(route.request.url).query)
                if path == "/api/workspace":
                    if mode == "error":
                        route.fulfill(status=503, json=dict(detail="Connection interrupted. Please retry."))
                    elif mode == "loading":
                        return  # Held locally until the context closes.
                    else:
                        route.fulfill(json=workspace)
                elif path == "/api/insights/report":
                    route.fulfill(json=report(workspace, int(params.get("days", [30])[0]), params.get("account_id", [""])[0]))
                elif path == "/api/paybot":
                    route.fulfill(json=dict(answer="Your available balance is $9,705.00.", provider="local",
                        display=dict(heading="Your balances", rows=[dict(label="All accounts", value="$9,705.00")], note="Simulated funds only.")))
                elif path == "/api/recipients" and route.request.method == "GET":
                    route.fulfill(json=dialogs_fixture["recipients"] if params.get("q") == ["siddhardth"] else [])
                elif path.startswith("/api/accounts/") and path.endswith("/holders") and route.request.method == "GET":
                    route.fulfill(json=dialogs_fixture["owners"])
                else:
                    unexpected.append(path)
                    route.fulfill(status=418, json=dict(detail="Unexpected visual-fixture API call"))
            ctx.route("**/api/**", api)
            page = ctx.new_page()
            page.on("pageerror", lambda e: page_errors.append(str(e)))
            page.clock.set_fixed_time(datetime(2026, 11, 24, 18, tzinfo=timezone.utc))
            page.goto(args.base_url)
            if authenticated and mode not in {"error", "loading"}:
                expect(page.locator(".app-shell")).to_be_visible()
                expect(page.get_by_role("heading", name="Hello, Sai.")).to_be_visible()
            elif mode in {"error", "loading"}:
                expect(page.get_by_role("heading", name="Opening your workspace")).to_be_visible()
                if mode == "error":
                    expect(page.locator(".session-content [role=alert]")).to_be_visible()
            else:
                expect(page.get_by_role("heading", name="Welcome back")).to_be_visible()
            return ctx, page

        def nav(page, tab):
            button = page.get_by_role("button", name=tab, exact=True)
            if not button.is_visible():
                page.get_by_role("button", name="Toggle navigation").click()
            button.click()
            if tab == "Insights":
                expect(page.get_by_role("heading", name="Cash flow over time")).to_be_visible()

        def capture(page, name, width):
            page.evaluate("async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}")
            page.mouse.move(0, 0)
            bounds = page.evaluate("""()=>({scroll:document.documentElement.scrollWidth,
                width:document.documentElement.clientWidth,fonts:document.fonts.status,
                missingImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),
                inputSizes:[...document.querySelectorAll('input,select')].filter(e=>e.getClientRects().length).map(e=>parseFloat(getComputedStyle(e).fontSize)),
                viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
                elements:[...document.querySelectorAll('.accounts-section h2,.activity-panel tbody tr,.cashflow-chart,.cashflow-explorer select,dialog[open] .modal,dialog[open] h2')].map(e=>({selector:e.tagName+'.'+e.className,text:e.textContent.trim().slice(0,100),rect:e.getBoundingClientRect().toJSON(),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth})),
                dialog:[...document.querySelectorAll('dialog[open]')].map(e=>({nativeModal:e.matches(':modal'),label:e.getAttribute('aria-label'),focusInside:e.contains(document.activeElement)}))})""")
            check(bounds["scroll"] <= bounds["width"] + 1, name + ": horizontal overflow")
            check(bounds["fonts"] == "loaded" and not bounds["missingImages"], name + ": font/asset failure")
            check(all(n >= 16 for n in bounds["inputSizes"]), name + ": input smaller than 16px")
            for modal in bounds["dialog"]:
                check(modal["nativeModal"], name + ": dialog not in native top layer")
                check(modal["focusInside"], name + ": dialog focus escaped")
            for node in bounds["elements"]:
                if node["selector"].startswith("DIV.modal"):
                    check(node["rect"]["x"] >= -1 and node["rect"]["right"] <= bounds["width"] + 1,
                          name + ": modal outside horizontal viewport")
            if not page.evaluate("typeof window.axe !== 'undefined'"):
                page.add_script_tag(path=str(AXE))
            axe = page.evaluate("""async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:
                ['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return {version:axe.version,
                violations:r.violations,incomplete:r.incomplete}}""")
            check(not axe["violations"], name + ": axe " + ",".join(v["id"] for v in axe["violations"]))
            filename = f"{name}-{width}.png"
            target = args.output / filename
            page.screenshot(path=str(target), full_page=True, animations="disabled", caret="hide")
            sha = hashlib.sha256(target.read_bytes()).hexdigest()
            comparison = None
            if not args.candidate:
                ref = REFERENCE / filename
                expected_sha = approved.get("images", {}).get(filename)
                check(ref.is_file() and expected_sha is not None, filename + ": missing reference lock entry")
                if ref.is_file() and expected_sha:
                    check(hashlib.sha256(ref.read_bytes()).hexdigest() == expected_sha, filename + ": reference differs from locked hash")
                    actual, expected_image = Image.open(target).convert("RGB"), Image.open(ref).convert("RGB")
                    check(actual.size == expected_image.size, filename + ": size changed")
                    if actual.size == expected_image.size:
                        channels = ImageChops.difference(actual, expected_image).split()
                        mask = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2]).point(lambda v: 255 if v > 16 else 0)
                        comparison = mask.histogram()[255] / (actual.width * actual.height)
                        check(comparison <= 0.001, f"{filename}: pixel difference {comparison:.4%}")
                        if comparison > 0.001:
                            mask.save(args.output / f"{name}-{width}.diff.png")
            (args.output / f"{name}-{width}.json").write_text(json.dumps(dict(geometry=bounds, axe=axe), indent=2))
            images.append(dict(file=filename, sha256=sha, width=width, pixel_difference=comparison))
            print(f"Captured {filename}; axe={len(axe['violations'])}", flush=True)

        try:
            for width in WIDTHS:
                ctx, page = context(width, False)
                capture(page, "signin", width)
                page.get_by_role("button", name="Create account", exact=True).click()
                capture(page, "signup", width)
                ctx.close()
                ctx, page = context(width)
                for tab in TABS:
                    nav(page, tab)
                    page.evaluate("async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}")
                    if tab in {"Overview", "Activity"}:
                        first = page.locator(".activity-panel tbody tr").first.bounding_box()
                        if tab == "Activity" or width == 1440:
                            check(first is not None and first["y"] + first["height"] <= (844 if width < 768 else 1000), f"{tab}-{width}: first transaction below fold ({first})")
                    if tab == "Overview" and width < 768:
                        heading = page.get_by_role("heading", name="Accounts", exact=True).bounding_box()
                        check(heading is not None and heading["y"] < 844, f"Overview-{width}: accounts below fold")
                    capture(page, tab.lower(), width)
                    if tab == "Activity":
                        page.locator(".activity-filter-disclosure summary").click()
                        page.get_by_label("Filter by account").select_option(WORKSPACE["accounts"][0]["id"])
                        expect(page.locator(".activity-filter-disclosure summary")).to_contain_text("1 applied")
                        capture(page, "activity-filter", width)
                    if tab == "Insights":
                        for days in (7, 90, 30):
                            page.get_by_role("button", name=f"{days} days", exact=True).click()
                            expect(page.locator(".cashflow-day")).to_have_count(days)
                            chart = page.locator(".cashflow-chart")
                            check(chart.evaluate("e=>e.scrollWidth<=e.clientWidth+1"), f"Insights-{width}-{days}: period clipped")
                            check(page.locator("button.cashflow-day").count() == 0, "Undersized chart targets restored")
                            explorer = page.locator(".cashflow-explorer select")
                            check(explorer.bounding_box()["height"] >= 44, "Day explorer target smaller than 44px")
                            zero = page.locator('.cashflow-pair i[style*="height: 0px"]')
                            check(all(b.bounding_box()["height"] == 0 for b in zero.all()), "Zero day has positive mark")
                            if days != 30:
                                capture(page, f"insights-{days}d", width)
                        page.locator(".cashflow-explorer select").select_option("2026-11-20")
                        expect(page.locator(".cashflow-selection")).to_contain_text("$125.00")
                        capture(page, "insights-selected", width)
                nav(page, "Accounts")
                page.locator(".account-row").first.click()
                account_dialog = page.get_by_role("dialog")
                expect(account_dialog.get_by_text("@sai", exact=True)).to_be_visible()
                capture(page, "dialog-account-details", width)
                page.keyboard.press("Escape")
                expect(account_dialog).to_have_count(0)
                nav(page, "Overview")
                page.get_by_role("button", name="Send money", exact=True).click()
                send = page.get_by_role("dialog")
                send.get_by_role("textbox", name="Username, email, or phone").fill("siddhardth")
                send.get_by_role("button", name="Find", exact=True).click()
                send.locator(".recipient-list button").first.click()
                capture(page, "dialog-send-recipient", width)
                send.get_by_role("button", name="Continue", exact=True).click()
                send.get_by_label("From account").select_option(WORKSPACE["accounts"][1]["id"])
                send.get_by_label("Amount", exact=True).fill("12.34")
                send.get_by_label("Note", exact=False).fill("Declared visual fixture — no payment will be sent")
                capture(page, "dialog-send-details", width)
                send.get_by_role("button", name="Review transfer", exact=True).click()
                capture(page, "dialog-send-review", width)
                page.keyboard.press("Escape")
                expect(send).to_have_count(0)
                if not page.get_by_role("button", name="PayBot", exact=True).is_visible():
                    page.get_by_role("button", name="Toggle navigation").click()
                page.get_by_role("button", name="PayBot", exact=True).click()
                bot = page.get_by_role("dialog", name="PayBot")
                bot.get_by_role("button", name="Show my balances").click()
                expect(bot.get_by_text("$9,705.00", exact=True)).to_be_visible()
                bot.get_by_role("button", name="Close PayBot").click()
                # On a phone PayBot can leave the navigation sheet open underneath.
                if page.locator(".sidebar.mobile-open").count():
                    page.keyboard.press("Escape")
                page.get_by_role("button", name="Hide balance", exact=True).click()
                if not page.get_by_role("button", name="PayBot", exact=True).is_visible():
                    page.get_by_role("button", name="Toggle navigation").click()
                page.get_by_role("button", name="PayBot", exact=True).click()
                expect(bot.get_by_text("Your amounts are hidden", exact=True)).to_be_visible()
                check("$" not in bot.inner_text(), "PayBot leaks a masked amount")
                capture(page, "privacy-paybot", width)
                bot.get_by_role("button", name="Show balances", exact=True).click()
                expect(bot.get_by_text("$9,705.00", exact=True)).to_be_visible()
                expect(bot.get_by_label("Your question")).to_be_focused()
                ctx.close()

            for width in (360, 1440):
                for mode in ("empty", "long", "error", "loading"):
                    ctx, page = context(width, mode=mode)
                    if mode in {"error", "loading"}:
                        capture(page, "session-" + mode, width)
                    else:
                        for tab in ("Overview", "Accounts", "Activity"):
                            nav(page, tab)
                            capture(page, mode + "-" + tab.lower(), width)
                    ctx.close()
        except Exception as exc:
            failures.append(f"Execution stopped before complete coverage: {type(exc).__name__}: {exc}")
        finally:
            check(not unexpected, f"Unexpected API calls: {unexpected}")
            check(not page_errors, f"Uncaught page errors: {page_errors}")
            # A deleted capture must not silently reduce the compared coverage.
            if not args.candidate:
                check({i['file'] for i in images} == set(approved.get('images', {})), "Approved capture inventory changed")
            result = dict(mode="UNAPPROVED CANDIDATES" if args.candidate else "comparison",
                source_fingerprint=source.hexdigest(), browser=browser.version,
                platform=platform.platform(), fixture="deterministic local interception; no API writes",
                fixture_date=str(TODAY), fixture_sha256=hashlib.sha256((TESTS / "fixtures/workspace.json").read_bytes()).hexdigest(),
                supplemental_fixture_sha256=hashlib.sha256(dialogs_fixture_path.read_bytes()).hexdigest(),
                harness_sha256=harness_sha256,
                widths=list(WIDTHS), device_scale_factor=1, locale="en-US", timezone="America/Chicago",
                reduced_motion=True, images=images, failures=failures,
                screenshot_policy=dict(channel_threshold=16, maximum_different_pixel_ratio=0.001))
            (args.output / "results.json").write_text(json.dumps(result, indent=2))
            browser.close()
    for failure in failures:
        print("FAIL:", failure, file=sys.stderr)
    print(f"{len(images)} captures; {len(failures)} failures; " + result['mode'])
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(main())

"""Browser acceptance for an explicitly approved, disposable CloudFront stack."""

import argparse
import csv
import json
import os
from pathlib import Path
from secrets import token_urlsafe
from urllib.parse import urlsplit
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright


def api(page, base, path, *, method="GET", data=None, status=200):
    response = page.request.fetch(
        base + "/api" + path, method=method, data=data,
        headers={"Origin": base} if method != "GET" else {},
    )
    assert response.status == status, f"{method} {path}: expected {status}, got {response.status}"
    return response.json()


def run(base, artifacts):
    steps = []

    def passed(message):
        steps.append(message)
        print("PASS:", message, flush=True)

    def shot(page, name):
        page.screenshot(path=str(artifacts / f"{name}.png"), animations="disabled")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.getenv("CHROMIUM_EXECUTABLE_PATH"))
        options = {"viewport": {"width": 1400, "height": 960}, "timezone_id": "America/Chicago"}
        sender = browser.new_page(**options)
        recipient = browser.new_page(**options)
        errors = []
        for page in (sender, recipient):
            page.on("pageerror", lambda error: errors.append(str(error)))

        sender.goto(base)
        expect(sender.get_by_role("heading", name="Welcome back")).to_be_visible()
        assert api(sender, base, "/health") == {"status": "ok", "database": "connected", "simulation": True}
        api(sender, base, "/accounts", status=401)
        shot(sender, "01-sign-in")
        passed("CloudFront HTTPS, API and PostgreSQL health; signed-out accounts return 401")

        for name in ("Sai", "Siddhardth"):
            sender.get_by_role("button", name=f"Sign in as {name}").click()
            heading = sender.get_by_role("heading", name=f"Hello, {name}.")
            expect(heading).to_be_visible()
            cookie = next(c for c in sender.context.cookies() if c["name"] == "paylink_session")
            assert cookie["secure"] and cookie["httpOnly"] and cookie["sameSite"] == "Strict"
            sender.reload()
            expect(heading).to_be_visible()
            if name == "Sai":
                shot(sender, "02-sai-workspace")
            sender.get_by_role("button", name="Sign out").click()
            expect(sender.get_by_role("heading", name="Welcome back")).to_be_visible()
            api(sender, base, "/me", status=401)
            passed(f"{name} demo login, secure session reload and logout")

        suffix = uuid4().hex[:8]
        credentials = {}
        for page, name in ((sender, "Sender"), (recipient, "Recipient")):
            username = f"cloud_{name.lower()}_{suffix}"
            password = token_urlsafe(24)
            credentials[name] = (username, password)
            page.goto(base)
            page.get_by_role("button", name="Create account", exact=True).click()
            page.get_by_label("Full name", exact=True).fill(f"{name} Cloud Fixture")
            page.get_by_label("Username", exact=True).fill(username)
            page.get_by_label("Email address").fill(username + "@paylink.test")
            page.get_by_label("Password", exact=True).fill(password)
            page.get_by_role("button", name="Create account", exact=True).click()
            expect(page.get_by_role("heading", name=f"Hello, {name}.")).to_be_visible()
            accounts = api(page, base, "/accounts")
            assert len(accounts) == 1 and accounts[0]["balance_cents"] == 20_000
        passed("Two synthetic registrations each create one $200 starter account")

        sender.get_by_role("button", name="Sign out").click()
        username, password = credentials["Sender"]
        sender.get_by_label("Username or email").fill(username)
        sender.get_by_label("Password", exact=True).fill("incorrect-test-password")
        with sender.expect_response(lambda response: urlsplit(response.url).path == "/api/auth/login") as rejected:
            sender.get_by_role("button", name="Sign in", exact=True).click()
        assert rejected.value.status == 401
        expect(sender.get_by_role("alert").filter(has_text="Incorrect username or password")).to_be_visible()
        sender.get_by_label("Password", exact=True).fill(password)
        sender.get_by_role("button", name="Sign in", exact=True).click()
        expect(sender.get_by_role("heading", name="Hello, Sender.")).to_be_visible()
        passed("Password login succeeds; wrong password is rejected with visible feedback")

        label = f"Cloud validation {suffix}"
        sender.get_by_role("button", name="Link a bank account").click()
        dialog = sender.get_by_role("dialog")
        dialog.locator('select[name=bank_id]').select_option(label="Meridian Bank")
        dialog.get_by_label("Give it a name").fill(label)
        dialog.get_by_role("button", name="Create simulated account").click()
        expect(sender.get_by_role("button").filter(has_text=label)).to_be_visible()
        source = next(a for a in api(sender, base, "/accounts") if a["label"] == label)
        destination, = api(recipient, base, "/accounts")
        assert source["balance_cents"] == 20_000
        recipient_name = credentials["Recipient"][0]
        assert api(sender, base, f"/recipients?q={recipient_name}")[0]["account_id"] == destination["id"]
        passed("Account opening and username recipient lookup")

        memo = f"Cloud test transfer {suffix}"
        amount = 1_234
        transfer_payload = {
            "source_account_id": source["id"], "destination_account_id": destination["id"],
            "amount_cents": amount, "memo": memo, "idempotency_key": str(uuid4()),
        }
        api(sender, base, "/transfers", method="POST", data={**transfer_payload, "amount_cents": 20_001}, status=409)
        api(sender, base, "/transfers", method="POST", data={**transfer_payload, "amount_cents": 0}, status=422)
        sender.get_by_role("button", name="Send money", exact=True).click()
        dialog.get_by_placeholder("e.g. siddhardth").fill(recipient_name)
        dialog.get_by_role("button", name="Find", exact=True).click()
        dialog.get_by_role("button", name=f"Recipient Cloud Fixture @{recipient_name}", exact=False).click()
        dialog.get_by_role("button", name="Continue", exact=True).click()
        dialog.get_by_label("From account").select_option(source["id"])
        dialog.get_by_role("textbox", name="Amount", exact=True).fill("9999")
        dialog.get_by_role("button", name="Review transfer").click()
        expect(dialog.get_by_role("alert")).to_contain_text("does not have enough funds")
        dialog.get_by_role("textbox", name="Amount", exact=True).fill("12.34")
        dialog.get_by_placeholder("e.g. Lunch").fill(memo)
        dialog.get_by_role("button", name="Review transfer").click()
        shot(sender, "03-transfer-review")
        with sender.expect_response(lambda response: urlsplit(response.url).path == "/api/transfers" and response.request.method == "POST") as event:
            dialog.get_by_role("button", name="Confirm & send").click()
        expect(dialog.get_by_role("heading", name="Transfer completed")).to_be_visible()
        assert event.value.status == 201
        transfer = event.value.json()
        payload = event.value.request.post_data_json
        assert api(sender, base, "/transfers", method="POST", data=payload, status=201)["id"] == transfer["id"]
        checked = api(sender, base, "/accounts")
        assert next(a for a in checked if a["id"] == source["id"])["balance_cents"] == 20_000 - amount
        assert api(recipient, base, "/accounts")[0]["balance_cents"] == 20_000 + amount
        shot(sender, "04-transfer-complete")
        dialog.get_by_role("button", name="Back to overview").click()
        passed("Transfer UI, insufficient funds, invalid amount, and duplicate key produce one balanced debit/credit")

        sender.reload()
        expect(sender.get_by_role("heading", name="Hello, Sender.")).to_be_visible()
        sender.get_by_role("button", name="Activity", exact=True).click()
        sender.get_by_role("textbox", name="Search activity").fill(transfer["id"])
        expect(sender.locator("tbody tr")).to_have_count(1)
        with sender.expect_download() as downloaded:
            sender.get_by_role("link", name="Export CSV").click()
        records = list(csv.reader(Path(downloaded.value.path()).read_text().splitlines()))
        assert any(any(memo in cell for cell in row) for row in records)
        passed("Transfer history persists after reload and exports to CSV")

        recipient.reload()
        expect(recipient.get_by_role("heading", name="Hello, Recipient.")).to_be_visible()
        recipient.get_by_role("button", name="Activity", exact=True).click()
        recipient.get_by_role("textbox", name="Search activity").fill(transfer["id"])
        recipient.locator("tbody .transaction-name").first.click()
        receipt = recipient.get_by_role("dialog", name="Transfer details")
        receipt.get_by_role("button", name="Return this payment").click()
        receipt.get_by_role("textbox", name="Reason", exact=True).fill("Cloud rehearsal verification")
        receipt.get_by_role("button", name="Confirm return").click()
        expect(receipt.get_by_text("Returned transfer", exact=True)).to_be_visible()
        detail = api(recipient, base, f"/transfers/{transfer['id']}/detail")
        reversal_id = detail["reversal"]["reversing_transfer_id"]
        assert sum(posting["delta_cents"] for posting in detail["postings"]) == 0
        assert api(recipient, base, "/accounts")[0]["balance_cents"] == 20_000
        assert next(a for a in api(sender, base, "/accounts") if a["id"] == source["id"])["balance_cents"] == 20_000
        shot(recipient, "05-returned-transfer")
        receipt.get_by_role("button", name="Close dialog").click()
        passed("Recipient reversal retains original history and restores both balances")

        sender.get_by_role("button", name="Accounts", exact=True).click()
        sender.get_by_role("button", name="Add joint owner", exact=True).click()
        dialog.get_by_label("Account to share").select_option(source["id"])
        dialog.get_by_label("New owner's username").fill(recipient_name)
        dialog.get_by_role("button", name="Send invitation").click()
        expect(dialog).not_to_be_visible()
        assert len(api(sender, base, f"/accounts/{source['id']}/holders")) == 1
        api(recipient, base, f"/accounts/{source['id']}/holders", status=404)
        recipient.reload()
        expect(recipient.get_by_role("heading", name="Hello, Recipient.")).to_be_visible()
        recipient.get_by_role("button", name="Accounts", exact=True).click()
        invitation = recipient.locator(".invitation-card").filter(has_text=label)
        invitation.get_by_role("button", name="Accept invitation").click()
        expect(invitation).not_to_be_visible()
        owners = api(recipient, base, f"/accounts/{source['id']}/holders")
        assert {owner["username"] for owner in owners} == {username, recipient_name}
        invite = next(i for i in api(recipient, base, "/account-invitations") if i["account_id"] == source["id"])
        assert invite["status"] == "accepted"
        shot(recipient, "06-joint-account")
        passed("Invitation is pending before acceptance; both joint owners have access after acceptance")

        recipient.get_by_role("button", name="Insights", exact=True).click()
        expect(recipient.get_by_role("heading", name="Cash flow over time")).to_be_visible()
        assert api(recipient, base, "/insights")["weekly"]
        shot(recipient, "07-insights")
        passed("PostgreSQL-backed insights load in the browser")
        assert not errors, errors
        passed("No browser JavaScript errors")
        browser.close()

    evidence = {
        "url": base, "checks": steps, "sent_amount_cents": amount,
        "sender": username, "recipient": recipient_name, "account_id": source["id"],
        "destination_id": destination["id"], "transfer_id": transfer["id"],
        "idempotency_key": payload["idempotency_key"], "reversal_id": reversal_id,
        "invitation_id": invite["id"],
    }
    (artifacts / "browser-checks.json").write_text(json.dumps(evidence, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--allow-synthetic-writes", action="store_true")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    url = urlsplit(base)
    if not args.allow_synthetic_writes or url.scheme != "https" or not url.netloc.endswith(".cloudfront.net") or url.path or url.query or url.fragment:
        parser.error("An approved disposable CloudFront HTTPS URL and --allow-synthetic-writes are required.")
    args.artifacts.mkdir(parents=True, exist_ok=True)
    run(base, args.artifacts)

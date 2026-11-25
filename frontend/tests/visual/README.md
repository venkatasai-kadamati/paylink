# PayLink visual quality gates

These tests drive the real Next.js components with **explicit local API fixtures**,
not fabricated HTML. They make no hosted requests or banking writes. The existing
`scripts/browser_test.py` remains the separate real-API/DB banking regression;
fixture success is not proof of ledger correctness.

## Run

```sh
npm ci --prefix frontend
.venv/bin/python -m pip install -r scripts/requirements-visual.txt
.venv/bin/python -m playwright install --with-deps chromium
npm run build --prefix frontend
# In a separate terminal, keep this foreground process running:
npm run start --prefix frontend -- --port 3100
# Compare against the checked-out lock (not an approval action):
.venv/bin/python scripts/visual_test.py
```

The runner uses the Chromium build pinned by Playwright, not system Chrome/CDP.
It fixes locale, timezone, time, data, zoom/DPR and reduced motion; waits for
fonts; disables screenshot animations/carets; checks page overflow, assets,
input typography, day exploration, plot visibility, zero values, initial-fold
hierarchy, PayBot masking/reveal/focus and axe WCAG2/2.1/2.2 AA tags. It captures
all seven main screens at 360/390/768/1280/1440 plus period, selected-day, filter,
privacy, empty, long-data, loading and error states. Browser errors and unexpected
API calls fail. Incomplete axe checks remain review work, not automatic passes.
Account-details and Send recipient/details/review dialogs are captured at every
required width; these fixtures deliberately never confirm a payment.

## Owner-merge reference lock — approval is still pending

**Merging this separate reference-lock PR into `main` is Venkatasai's approval
of the current look as the visual reference. Until he merges it, these files are
an unapproved proposal. Devin must not merge this PR.** The merge event is the
approval record; merely checking out `approved.json`, generating screenshots or
getting an equal pixel comparison is not acceptance.

This is the owner's explicitly requested exception to the normal independent-PASS
reference policy, not a lower review threshold or another review cycle. It locks
the current look, including known limitations; it does not certify correctness,
accessibility or production readiness. No application UI/behavior changes are
part of the proposal.

| Full independent review | Score | Recorded verdict |
| --- | ---: | --- |
| 1 | 89/100 | FAIL |
| 2 | 92/100 provisional | FAIL / incomplete |
| 3 | 96/100 | FAIL |

The focused C3-01 Amount resting-border check passed at **3.4945:1**. That was
finding-only: no fourth full review, new overall score or overall PASS exists.
PayBot's raw axe scrolling flag and the native-mobile, Safari/Firefox,
screen-reader and forced-colors coverage gaps remain recorded. See the
[original review handoff](https://github.com/venkatasai-kadamati/paylink/pull/7).

The proposal contains **96 full-page PNGs**, an exact SHA-256 inventory and capture
metadata in `references/approved.json`, generated from the merged application's
unchanged frontend using the pinned fixture runner. Viewports are 360/390×844
and 768/1280/1440×1000, DPR1, 100% zoom. Full-page PNGs may be taller than their
viewport. Data and exceptional states are explicitly local fixtures, not real
banking requests or evidence of ledger correctness.

### Inspect the proposed pixels

| Main state | 360 | 390 | 768 | 1280 | 1440 |
| --- | --- | --- | --- | --- | --- |
| Sign in | [PNG](references/signin-360.png) | [PNG](references/signin-390.png) | [PNG](references/signin-768.png) | [PNG](references/signin-1280.png) | [PNG](references/signin-1440.png) |
| Sign up | [PNG](references/signup-360.png) | [PNG](references/signup-390.png) | [PNG](references/signup-768.png) | [PNG](references/signup-1280.png) | [PNG](references/signup-1440.png) |
| Overview | [PNG](references/overview-360.png) | [PNG](references/overview-390.png) | [PNG](references/overview-768.png) | [PNG](references/overview-1280.png) | [PNG](references/overview-1440.png) |
| Accounts | [PNG](references/accounts-360.png) | [PNG](references/accounts-390.png) | [PNG](references/accounts-768.png) | [PNG](references/accounts-1280.png) | [PNG](references/accounts-1440.png) |
| Activity | [PNG](references/activity-360.png) | [PNG](references/activity-390.png) | [PNG](references/activity-768.png) | [PNG](references/activity-1280.png) | [PNG](references/activity-1440.png) |
| Insights | [PNG](references/insights-360.png) | [PNG](references/insights-390.png) | [PNG](references/insights-768.png) | [PNG](references/insights-1280.png) | [PNG](references/insights-1440.png) |
| Balance | [PNG](references/balance-360.png) | [PNG](references/balance-390.png) | [PNG](references/balance-768.png) | [PNG](references/balance-1280.png) | [PNG](references/balance-1440.png) |

The directory and manifest also include account details, Send recipient/details/
review, masked/revealed PayBot, chart periods/day selection, Activity filters,
empty/long content, loading and error states. No payment is confirmed by the
capture harness; these images do not replace the separate banking regression.

CI fetches `main` and requires its accepted reference lock to exist **and be
unchanged by the PR** before comparing. Consequently this initial proposal's
reference-acceptance check intentionally stays blocked even though its local
capture/hash/pixel checks can pass. After the owner merges it, subsequent code
PRs compare against that accepted lock; any future reference-changing PR is
blocked again until the owner explicitly merges that proposal. A manually
dispatched workflow on an unmerged branch cannot self-approve either.

Pixel comparison permits channel noise <=16 and at most 0.1% different pixels;
size changes fail. This is a rasterization tolerance, not permission to waive a
rendered defect. Failing actual/difference images and per-state measurements are
saved under `artifacts/design-quality/after/automated/`.

## Capturing candidates — never auto-update a failure

`--candidate --output artifacts/design-quality/candidates/<fresh-directory>` writes
**unapproved candidates only**. It has no update/approve command and cannot write
under `references/`. Keep the current approved references while investigating a
failure. Preserve original before images separately.

The normal design-acceptance path remains independent review with
`.agents/skills/strict-design-reviewer/SKILL.md` and its critical-path API/state
evidence. The owner's narrow current-look exception above does not turn the
existing FAIL into PASS or authorize additional full review cycles.

For this proposal, capture once into a new directory outside `references/`, then
copy those exact PNGs with an `approved.json` manifest recording their source,
environment, fixture/harness hashes, unchanged review record and **conditional
owner-merge acceptance**. Commit images/manifest together. Only the owner's merge
accepts them; no update/approve command exists. The comparator checks reference
hashes and the complete capture inventory, with the same tolerances below.
Never regenerate pixels merely to suppress a failure.

The numeric score is the reviewer's evidence-linked design judgment, not the
automated assertion percentage. Neither an axe pass nor screenshot equality is
a complete WCAG certification or a production-readiness declaration. Actual
screen-reader/native-browser coverage and hosted timing need separate evidence.

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
# Compare against reviewed references:
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

There are currently **no approved references**. The three full independent
reviews returned FAIL; the authorized Amount-border follow-up accepted that
finding only, not the application. CI intentionally fails its approval preflight
until a future independent acceptance provides references. Do not replace that
failure with candidate-only success or an empty approval inventory.

Pixel comparison permits channel noise <=16 and at most 0.1% different pixels;
size changes fail. This is a rasterization tolerance, not permission to waive a
rendered defect. Failing actual/difference images and per-state measurements are
saved under `artifacts/design-quality/after/automated/`.

## Reference approval — never auto-update a failure

`--candidate --output artifacts/design-quality/candidates/<review-cycle>` writes
**unapproved candidates only**. It has no update/approve command and cannot write
under `references/`. Keep the current approved references while investigating a
failure. Preserve original before images separately.

A reviewer who did not implement the UI must inspect the exact candidate images
with `.agents/skills/strict-design-reviewer/SKILL.md`, including the additional
critical-path real-API and state evidence. Only after PASS, copy those reviewed
PNGs into `references/` and record `approved.json` with the review URL/path, source
fingerprint, environment, fixture hash, approval scope and `images` mapping each
filename to its SHA-256. Commit image/manifest changes together with the reason
and review evidence. The comparator verifies the reference hashes and complete
capture inventory before accepting them; never regenerate them just to pass CI.

The numeric score is the reviewer's evidence-linked design judgment, not the
automated assertion percentage. Neither an axe pass nor screenshot equality is
a complete WCAG certification or a production-readiness declaration. Actual
screen-reader/native-browser coverage and hosted timing need separate evidence.

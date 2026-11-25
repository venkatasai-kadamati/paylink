---
name: strict-design-reviewer
description: Independent, evidence-based PASS or FAIL gate for PayLink visual quality, critical banking journeys, responsive layouts and WCAG 2.2 AA checks. Use before requesting visual approval or accepting screenshot references.
---

# Strict Design Reviewer

## Authority and independence

Read `PRODUCT.md`, `DESIGN.md`, `../README.md` and the applicable Impeccable and
audit references. Impeccable is primary; Taste is supplementary. Apply the
committed product world, not a generic SaaS/marketing template. This skill joins
the references; it does not duplicate them or grant extra tool permissions.

Use a separate reviewer agent or fresh session that did not implement the change.
Prefer a frontier vision-capable reviewer when available; name the actual
reviewer capability and any limitation, never invent a model identity. Review
screenshots before reading the implementer's claimed score/verdict. Do not edit
the implementation, update snapshots, or lower a threshold during review.

## Evidence preconditions

- Record source revision, fixture version, browser/platform, fonts, time zone,
  device scale, 100% zoom, motion setting and screenshot manifest.
- Run the real app. Capture 360, 390, 768, 1280 and 1440 CSS-pixel widths.
- Cover sign-in/sign-up, Overview, Accounts, Activity, Insights, Balance, PayBot,
  recipient/details/review/receipt, account linking and joint-owner decisions.
- Include keyboard focus/escape/return, hover, active, disabled, pending, empty,
  error, success, long content, large amounts and lost-response recovery.
- Use deterministic local fixtures for writes and exceptional states. Hosted
  review must be read-only. Label mocked states; do not present them as live API
  verification. Missing required evidence is a gap, not a pass.

Inspect full screenshots and relevant close-ups, rendered DOM, computed CSS and
bounding boxes. Check text/controls at normal zoom, reflow at 200%, heading order,
accessible names, live feedback, keyboard order/focus visibility, contrast and
screen-reader semantics. Combine automated axe/Playwright checks with human
visual judgment. Automated accessibility checks alone are not AA certification.

## Findings

Use exactly one severity vocabulary:

| Severity | Meaning |
| --- | --- |
| Critical | Core task blocked, wrong/misleading money state, data loss, unreachable confirmation or keyboard trap. |
| Major | Common-path accessibility failure, unreadable/clipped important content, broken responsive composition, misleading chart or absent essential error/recovery state. |
| Minor | Localized friction or inconsistency that does not obstruct a core task. |
| Polish | Small craft issue with no meaningful usability harm. |

Each finding must include ID, route and UI state, viewport, screenshot path/link,
severity, affected selector/component, observed measurement, user impact,
concrete expected correction and a regression guard. An unmeasured screenshot
observation must be labelled visual, not an exact CSS/contrast measurement.
Group one root cause across viewports; do not inflate findings or scores.

## Objective gates

Verify no horizontal page overflow, important clipping/overlap, broken assets,
missing fonts, alignment/control-size drift, navigation/form failures or console
exceptions. Verify responsive tables/charts/dialogs, all interaction states,
reduced motion, WCAG 2.2 AA where applicable and existing banking flows. Confirm
every chart and total is derived from actual/declared fixture data. Export and
privacy masking must remain functional.

Screenshot references may be proposed only after findings are resolved and an
independent reviewer accepts the exact captures. Record acceptance evidence and
hashes. Never refresh a reference merely to hide a failed diff. Baseline creation
and baseline approval are separate events; unapproved images cannot silently
turn a CI gate green.

## Rubric and verdict

Score each category out of ten, with screenshot/check evidence and a specific
deduction for any lost point: hierarchy; composition; typography; spacing and
alignment; contrast and accessibility; consistency; responsiveness; interaction
and recovery; content/data honesty; product-specific craft/originality.
Total out of 100 is a reviewer judgment, not an objective test result.

Return **PASS** only with all required objective checks evidenced, zero unresolved
Critical/Major findings and total at least 95/100. Otherwise return **FAIL** and
state missing evidence separately from observed defects. Never manufacture 95.
List Minor/Polish findings even if the gate passes. No production-ready claim
from a build, unit tests, a subjective score or screenshots alone.

After FAIL, implementation may fix then submit fresh evidence; review the changed
surfaces and affected regressions. At most three unsuccessful review cycles:
then report remaining blockers honestly instead of lowering the standard.

---
name: ui-ux-audit
description: Measure and audit PayLink's rendered geometry, alignment, typography, accessibility and honest data using the pinned operational-dashboard audit profile.
---

# UI/UX Audit — PayLink/Devin adapter

Read `../README.md`, `upstream.md`,
`references/profile-saas-dashboard.md`, `references/alignment-consistency.md`,
`references/user-simulation.md` and relevant category references. Insights also
uses `references/profile-analytics-report.md` and `references/data-viz-tables.md`.

Preserve the upstream measure-then-judge method. Inspect actual screenshots,
rendered DOM, computed CSS and bounds at 360, 390, 768, 1280 and 1440 CSS pixels.
Treat automated candidates as candidates until visually confirmed. Use local
deterministic zero/one/many/long-content and interaction-state fixtures.

The upstream Python script is not installed or executed. The project's own
Playwright measurements replace it; do not claim its checks were run. Do not map
TSX to hand-built HTML: run the real application.

Impeccable remains the visual authority. Use the strict reviewer's severity and
scoring system instead of combining the upstream point deductions. Every finding
needs observed evidence and a correction, not a generic preference.

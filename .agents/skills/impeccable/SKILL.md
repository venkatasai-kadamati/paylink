---
name: impeccable
description: Primary design authority for PayLink UI work, critique, typography, hierarchy, responsive behavior and visual craft. Adapted from pinned Impeccable guidance for Devin without its external runtime.
---

# Impeccable — PayLink/Devin adapter

This entry point is modified for this repository. Attribution, original guidance
and license remain in `upstream.md` and `LICENSE`; commit pins are in
`../sources.lock.json`. Read `../README.md` for integration boundaries.

Read `PRODUCT.md` and `DESIGN.md` if present, then the actual incumbent interface.
If they do not exist, record that fact; do not invent an approved design system.
PayLink is an **Operate/Read** product: precision, restraint and familiar controls
are its ambition, not spectacle. The brief wins over stylistic defaults.

For an audit read `reference/critique.md`, `reference/critique-rubric.md` and
`reference/audit.md`. Immediately before UI edits read `reference/craft-floor.md`.
Load other references only for the specific surface/change. Use the core design
principles in `upstream.md`, with this adapter replacing its Setup/runtime steps.

The upstream CLI and hooks are deliberately not installed. Do not attempt to run,
download, or claim results from `impeccable`, `npx impeccable`, context or detector
commands. Read project context directly and use the existing authorized browser,
computed styles, DOM bounds and project-owned Playwright gates instead. Capture
the rendered result at the requested widths; batch related checks and fixes.

The final gate is `../strict-design-reviewer/SKILL.md`. Successful compilation is
not visual approval. Keep product identity and real functionality intact; measure
and inspect before judging, and never invent data to improve a screenshot.

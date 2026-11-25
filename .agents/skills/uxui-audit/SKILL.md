---
name: uxui-audit
description: Screenshot-first independent PayLink review across usability, accessibility, responsive behavior, trust, recovery and critical journey states.
---

# UXUI Audit — PayLink/Devin adapter

Read `../README.md`, `upstream.md`, `workflow.md`, `dimensions.md`,
`report-template.md` and `regression-guards.md` when performing a complete review.
Use `capture.md` as capture guidance, not permission to install or execute scripts.

Review real pixels first, then measure questionable states. Cover all thirteen
upstream dimensions without restating them as a second design system. Review
protected focus, loading, empty, error, success, stale session, long content and
the complete send-money journey, not just an attractive overview.

The upstream Node capture script is intentionally omitted. Use authorized native
browser/Playwright tools and project fixtures. Never commit authenticated browser
state. Never make hosted banking writes while validating the shared preview.

Return the strict reviewer's evidence schema, severity labels and PASS/FAIL gate.
Do not convert the upstream Nielsen score into a claimed WCAG certification.

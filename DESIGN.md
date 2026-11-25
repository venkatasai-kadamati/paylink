# PayLink design system

## Direction and authority

**Mode: Operate / Read.** A calm, precise, blue-and-ink banking workspace, not a
marketing landing page. Distinctiveness comes from readable financial figures,
the transfer-mark identity, exact alignment and a coherent transaction journey.
Keep the existing identity: the latest brief asks for evidence-based refinement
and repeatable quality, not another arbitrary wholesale re-theme.

Established reference patterns are Mercury/Mobbin's persistent navigation and
structured activity, Nexbank/Dribbble's balance hierarchy, and
[PrimeBank's split sign-in](https://dribbble.com/shots/21163635-PrimeBank-Login).
These are pattern references, not licensed assets or pixel-copy targets. Current
rendered PayLink evidence and product needs decide what to preserve. Impeccable
is primary; Taste's marketing-site requirements are not defaults for this app.

`PRODUCT.md` governs functionality and product truth. This file governs the visual
system. The strict reviewer's evidence-based gate governs acceptance. If the CSS
and this file drift, investigate rendered behavior and resolve the drift rather
than treating the document itself as proof of quality.

## Typography

One family: **IBM Plex Sans**, loaded/self-hosted by `next/font` with Latin subset.
Do not add a display font, decorative monospace or external runtime font fetch.
Use tabular numerals for money and tables; monospace only for a reference/ID.

| Role | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| Body and form input | 16px / 1.5 | 400 | Readable at 100% zoom; prevents mobile input zoom. |
| Page title | 28–36px / 1.25 | 600 | One primary heading per view. |
| Section heading | 21px / 1.25 | 600 | Clear, plain hierarchy. |
| Compact heading | 17–19px / 1.25 | 600 | Dialog and data-detail groups. |
| Supporting/UI text | 14–15px / 1.5 | 400–600 | Labels, descriptions and controls. |
| Secondary data | 12–13px / at least 1.4 | 400–500 | Dates/ticks only; not core instructions. |
| Primary balance | 42–52px / 1.15 | 500–600 | One dominant total, not every metric. |
| Account / metric value | 24–34px / 1.2 | 500–600 | Keep each currency value intact. |

Heading tracking may tighten to -0.035em, never below -0.04em. Avoid all-caps
kickers/eyebrows over headings: they repeat hierarchy instead of clarifying it.
Use ordinary labels where a label carries real meaning (“Available balance”).
Long prose stays near 65–75ch; data tables are not prose columns. Long names and
IDs wrap within their region. Never split a monetary amount across arbitrary
lines or silently clip an important value; restructure its row or use an
explicitly labelled compact chart scale with exact values still available.

## Semantic tokens

Define shared values in `frontend/app/globals.css`; use them in components.

| Token | Value | Meaning |
| --- | --- | --- |
| `--paper` | `#f4f6fa` | Workspace canvas. |
| `--surface` | `#ffffff` | Content and control surface. |
| `--ink` | `#17243c` | Primary text. |
| `--muted` | `#59677d` | Supporting text, not disabled by default. |
| `--line` | `#dce2ec` | Decorative separators, not a focus indicator. |
| `--accent` | `#2459d3` | Primary action and outgoing series. |
| `--accent-deep` | `#1844ab` | Hover/action emphasis. |
| `--tint` | `#edf3ff` | Selection and quiet supporting surface. |
| `--navy` | `#142d61` | Main balance / net-flow emphasis. |
| `--positive` | `#187052` | Received / completed text. |
| `--chart-in` | `#208064` | Incoming chart series, with a text legend. |
| `--error` | `#aa2e36` | Error / destructive text, never color alone. |
| `--focus` | `#155eef` | Visible keyboard outline. |

Additional shared tokens cover spacing, control sizes, radii and subtle elevation.
Use a four-pixel rhythm: 4, 8, 12, 16, 20, 24, 32, 40 and 48px; 6/10px may be
used as optical icon/text gaps. Keep exceptions local and justified. Decorative
lines need not satisfy text contrast; meaningful control boundaries, states and
focus indicators must satisfy their applicable non-text contrast requirements.

## Layout, spacing and responsive composition

- Desktop sidebar: 240px, persistent, with one active item and a separate PayBot
  action. Topbar: 80px. Main content gutters: 40px desktop, 20px tablet, 16px phone.
- Use 24–32px between sections, 16–24px within panels, and 8–12px within a group.
  Headings sit closer to the content they introduce than to the previous group.
- One primary page action. Preserve useful density; do not create an empty
  “luxury” dashboard by pushing data below the fold. Avoid nested card scaffolds.
- Account and summary grids use `minmax(0, 1fr)` so real content can shrink/wrap.
  Shared row anatomy and baselines matter more than identical card heights.
- At 1020px and below use the existing collapsible navigation; below 760px compose
  Insights detail sections vertically; below 560px use single-column account and
  summary layouts. At 480px Insights metrics stack; at 360/390 verify the actual
  result rather than assuming a breakpoint proves it.
- No page-wide horizontal overflow. Contained table scrolling is permitted only
  when necessary, keyboard accessible and clearly indicated. A chart should show
  the selected period without quietly hiding recent data offscreen.
- Keep chart axes distinct from the plot; currency labels must remain intact.
  Exact daily data and exploration must be keyboard/touch accessible without
  dozens of undersized targets. Never render a zero as a fabricated positive bar.
- Dialogs fit the viewport with contained vertical scrolling and reachable close
  and confirmation controls. Focus must not be obscured by fixed UI.

## Components and variants

Use existing React components and semantic HTML rather than introducing another
UI framework. Reuse shared button, field, modal, account-row and table primitives.

| Component | Contract |
| --- | --- |
| Primary button | Accent fill, white text, 48px minimum height, one main intent. |
| Secondary button | Surface, visible boundary, 44–48px height, supporting intent. |
| Text action | Accent text, 44px target where practical, underline on hover. |
| Icon button | Accessible name, consistent Lucide stroke, 44px target. |
| Input/select | Persistent label, 16px text, 50px normal height; error/help association. |
| Amount input | Currency prefix inside a single control; exact cents; inline validation. |
| Navigation/segmented control | Clear active/pressed state, native buttons, no color-only state. |
| Account row | Identity, ownership and available balance; equal content edges. |
| Transaction row | Name/note/date, status and aligned signed amount; receipt drill-down. |
| Chart | Real scoped data, honest axes, legend/text alternative, exact daily details. |
| Dialog | Named dialog, protected focus, Escape where safe, return focus to opener. |
| Alert/status | Error uses alert; asynchronous neutral/success feedback uses status. |

Standard radii: 8px controls, 12px panels, 16px dialogs; smaller chips 5–6px.
Nested radii follow the containing padding instead of repeating arbitrary large
rounding. Use one restrained soft shadow for raised controls and one dialog
elevation; no colored halos, glass, hard offset shadows or decorative gradients.

## Interaction and state contracts

Every interactive component needs hover, keyboard focus, active/pressed and
disabled/pending behavior. Focus uses a 3px outline with sufficient contrast and
space; never remove it without an equivalent. Disabled controls are truly
disabled, not just dim. Pending actions state what is happening and block double
submission, while completion and recovery stay discoverable.

Errors explain the problem and a recovery action, preserve safe input and move
focus to the appropriate error/field/heading. Empty states distinguish zero data,
no search match and a failed request; provide a relevant next action without fake
charts or metrics. Session restoration stays neutral and recoverable. Confirmation
recovery must preserve the original payment key and the uncertainty warning.

Theme selection, caret, numeric alignment and focus from the same palette.
Support reduced motion without hiding pending/outcome feedback. Use motion only
for useful state change; no gratuitous entrances, parallax, hover magnets or
animation dependencies. The workspace is intentionally light-only, not a broken
or untested dark-mode promise. Respect forced-colors and native controls.

## Accessibility and integrity

Target WCAG 2.2 AA where applicable: 4.5:1 normal text, 3:1 large text and
meaningful UI/focus contrast. Touch targets aim for 44px; never use adjacent
sub-24px targets without an actual applicable exception. All tasks work by
keyboard. Provide labels, correct roles/states, logical heading order, skip
navigation and live recovery feedback. Test reflow/200% zoom and content growth.

Masking hides monetary values consistently, including chart/data alternatives.
Exports require an intentional user action and remain accurate. Color is never
the only distinction between sent/received, error/success or selection. Copy and
numeric comparisons must not imply growth, profit or financial advice.

## Explicit anti-patterns and acceptance

No arbitrary re-theme, generic hero-and-three-feature-cards scaffold, redundant
eyebrows, decorative graphs, fake balances/metrics, unsupported badges, stock
imagery, testimonial blocks, gratuitous gradients or excessive nested cards.
No tiny text as a substitute for responsive composition. No hidden clipping or
global `overflow-x: hidden` used to conceal a broken layout.

Use `.agents/skills/strict-design-reviewer/SKILL.md` for the ten-category rubric,
findings schema and PASS/FAIL gate. Capture before editing the app. Preserve
immutable before images; create after images separately. Run deterministic
Playwright geometry, accessibility, interaction and screenshot checks. Only an
independent evidence review can approve reference captures; never update a
snapshot simply to suppress a failure. Zero unresolved Critical/Major findings
and at least 95/100 are required for PASS; a score does not replace objective
checks or establish production readiness.

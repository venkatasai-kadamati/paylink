# PayLink

## Product truth

PayLink is an English-language **banking simulation** for managing personal and
joint simulated accounts and sending ledger-backed simulated payments. No real
money moves. It is a course project reviewed by professors and its student
authors, not a regulated bank or a live payment provider.

Primary audience: a returning demo user checking balances, reviewing transfers
or sending money; a new user creating a simulated profile; and an evaluator
walking the complete banking and database journeys. Use on a normal-zoom laptop
is primary, with fully usable phone and tablet layouts. Do not require knowledge
of the implementation or a walkthrough to operate it.

## Core jobs and journeys

1. Sign in with credentials or one of the existing demo profiles; create a new
   profile; restore a valid session without a sign-in flash; recover from a
   transient failure without losing the session; sign out.
2. Understand the total and per-account available balances. Mask amounts, inspect
   account details and owners, and move money between one's own accounts.
3. Find a recipient, choose source/destination, enter an exact amount and optional
   note, review the destination and amount, confirm once, and see a useful receipt.
   A lost response must recover with the same payment key, not a second debit.
4. Link a simulated account, invite a joint owner and accept/decline a request
   within Accounts. There is no separate Invitations page to restore.
5. Search/filter Activity, inspect ledger-backed receipts, export CSV and return
   an eligible payment through the existing confirmed reversal flow.
6. Understand actual external money in/out, compare periods/accounts in Insights,
   explore a day, open its Activity, inspect accessible daily amounts and export.
7. Ask read-only PayBot about one's own account activity. Never imply that it can
   send money, make a financial recommendation or see another user's workspace.

## Information architecture and important states

The implemented product has **one application URL, `/`**, not separate page URLs
for each tab. Signed-out states are Sign in and Create account. Signed-in
navigation is Overview, Activity, Accounts, Balance and Insights. Modal/panel
states include PayBot, recipient/details/review/confirmation recovery/success,
receipt/return, account details, account linking and joint ownership decisions.

Every core journey needs pending, empty, error and success handling as applicable.
Review zero/one/many accounts and transfers, long names/notes, large amounts,
insufficient funds, no search matches, expired sessions, stale responses and
temporary API failures. Do not confuse zero activity with a failed data request.

## Architecture to preserve

- Next.js App Router and React client workspace; IBM Plex Sans through
  `next/font`. Shared CSS and existing components remain the implementation base.
- Server cookie-presence hint for the initial view; it is not authorization.
  One authenticated `/api/workspace` bootstrap verifies data through the API.
- Same-origin session reads/logout in Next; other `/api/*` calls use the existing
  backend rewrite. FastAPI and PostgreSQL enforce account access and payments.
- Existing eight-table schema, transaction postings, invitation decisions and
  transfer reversals are behavioral contracts, not decorative demo features.
- Dynamic Insights loading and the current abort/session-generation protection
  remain intact. A styling change must not add startup API calls or auth delays.

## Product language and trust

Use plain, specific language: “Send money”, “From account”, “Amount”, “Review
transfer”, “Transfer completed”. Explain errors and recovery without exposing
internal exception names. Keep the simulation disclosure readable and factual;
avoid unsupported security, uptime, savings or compliance claims.

All totals, charts and observations come from the signed-in user's API data.
Fixture screenshots must say that they use deterministic local simulation data.
No fabricated customers, testimonials, rankings, growth metrics or feature claims.
No “How to test” or quick walkthrough content in the product.

## Delivery boundaries

Evolve the presented MVP instead of replacing its architecture. Preserve every
existing flow. Keep review PRs unmerged until the owner acts; production changes
need authorization. Hosted checks are read-only because production and the review
preview share demo data. Full write verification uses the isolated local DB.

Keep AWS unchanged unless explicitly approved. The model-only Bedrock key stays
on Render; Vercel preview PayBot uses local answers. Do not describe local answers
as verified Bedrock generation. Hosting improvements do not prove zero cold-start
latency or unlimited free-plan capacity.

## Design authority and acceptance

`DESIGN.md` defines the incumbent blue/ink world and its component/state rules.
The pinned `.agents/skills/impeccable` guidance is the primary design authority;
Taste contributes supplementary art direction only. The strict reviewer defines
the single evidence, severity and scoring contract. Preserve observed strengths,
fix rendered defects first, and require independent screenshot review plus
objective accessibility, responsive and banking checks before visual acceptance.

The owner's explicitly requested current-look reference-lock PR is a narrow
exception: Venkatasai merging it accepts the visual reference, not the overall
design review, accessibility certification, or production readiness. While that
PR is unmerged its snapshots remain proposals and cannot unlock CI. The three
full-review FAIL results and Amount-only finding PASS remain unchanged.

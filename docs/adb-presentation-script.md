# PayLink — CS 5600 Advanced Database Systems Final Presentation Script

**Presenters:** Venkata Sai Kadamati (**Sai**) and **Siddhardth**  
**Deck:** `docs/adb-final-presentation.pptx` (14 slides)  
**Companion Report:** `docs/adb-final-report.pdf`  
**Live App:** `https://paylink-radiant690s-projects.vercel.app/`  
**Target Pace:** ~14–16 minutes total + Q&A *(presentation time limit was not specified in the supplied professor guide `info.md`; adjust live demo depth to fit the slot)*

---

## Speaker Split Overview

Sai leads the core database-engineering halves (schema evolution, ER design, constraints/triggers, normalization, transactions/concurrency, complex SQL, indexing, EXPLAIN benchmarks, and technical Q&A). Siddhardth leads product features/scope, dataset provenance, end-to-end UI→API→DB request flow, live UI driving, and engineering challenges.

| Slide | Section (Presentation Guide) | Lead Speaker | Focus |
|---:|---|---|---|
| 1 | Title & Opening | **Sai** | Framing as an evolution of the presented MVP |
| 2 | 1. Project Overview | **Sai** | 5-table MVP → 8-table ledger evolution & headline metrics |
| 3 | 1. Project Overview | **Siddhardth** | Working live features & honest scope disclosures |
| 4 | 2. Database Design | **Sai** | 8-table ER model & relationship cardinalities |
| 5 | 2. Database Design | **Sai** | Constraints, 2 deferred triggers, RLS & `SECURITY DEFINER` |
| 6 | 2. Database Design | **Sai** | 1NF → BCNF decomposition & deliberate 3NF on `transfer_postings` |
| 7 | 2. Database Design | **Sai** | `execute_transfer()`, advisory/ordered locks, `FOR NO KEY UPDATE` |
| 8 | 3. Dataset | **Siddhardth** | Hosted live vs. local 2,000,007-transfer benchmark & BRIN disclosure |
| 9 | 4. Queries & Indexing | **Sai** | Production SQL (`LATERAL`, `MATERIALIZED`, window function, reconciliation) |
| 10 | 4. Queries & Indexing | **Sai** | 24 indexes & why 32 KB BRIN beat an 81 MB B-tree |
| 11 | 4. Queries & Indexing | **Sai** | Local `EXPLAIN (ANALYZE, BUFFERS)` speedups (78.8× / 4,344×) |
| 12 | 5. App Architecture | **Siddhardth** | End-to-end UI Frontend → FastAPI → PostgreSQL request trace |
| 13 | 5. Live Demo | **Siddhardth + Sai** | Siddhardth drives the live UI; Sai narrates the DB work underneath |
| 14 | 6. Challenges & Q&A | **Siddhardth + Sai** | Real bugs encountered, database lessons learned, and Q&A |

---

## Slide-by-Slide Spoken Script

### Slide 1 — Title Slide *(~0:30)*
**Speaker: Sai**  
*[Cue: Stand on title slide with live PayLink tab already open in a background browser window.]*

> **Sai:** Good afternoon Professor and everyone. I’m Sai, and I’m presenting with Siddhardth. Today we’re walking through the final Advanced Database Systems submission for **PayLink** — our simulated USD peer-to-peer banking application built on PostgreSQL, FastAPI, and Next.js.
>
> Quick framing up front: this is a direct evolution of the five-table MVP we already presented, tagged `mvp-presented-baseline` in our repo — not a separate product. Everything we built since the MVP was driven directly by your feedback on schema complexity, explicit constraints, normalization depth, dataset scale, indexing rationale, complex SQL, and full UI-to-database request tracing. And just to be explicit on scope: this is purely our Advanced Database submission on Vercel, Render, and Supabase PostgreSQL — no AWS services are part of this deliverable. Let’s jump in.

---

### Slide 2 — Project Overview: Evolution from the Presented MVP *(~1:00)*
**Speaker: Sai**  
*[Cue: Advance to Slide 2. Gesture briefly to the 4 KPI cards, then the comparison table.]*

> **Sai:** Here is what changed between our presented MVP and `main` today.
>
> At the MVP stage, PayLink had five tables, basic checks, small demo data, and `OR`-predicate queries that worked fine on a dozen rows but collapsed at scale.
>
> For the final submission, we expanded the schema to **eight tables** by adding double-entry `transfer_postings`, consent-based `account_invitations`, and compensating `transfer_reversals`. We hardened integrity with **13 `NO ACTION` foreign keys**, **two deferred constraint triggers**, **ten `SECURITY DEFINER` routines**, and Row-Level Security on every table.
>
> To actually test physical database design rather than guessing, we built a **2,000,007-transfer local benchmark dataset** — 1.45 gigabytes — with zero balance drift. On that local dataset, rewriting our history and weekly insight queries gave us **78.8× to 4,344× speedups**, and adding a **32-kilobyte BRIN index** sped up monthly insights by **14.1×** while avoiding an 81-megabyte B-tree trap.
>
> I’ll hand it to Siddhardth to cover the live features and our exact scope boundaries.

---

### Slide 3 — Implemented Features & Honest Scope *(~1:00)*
**Speaker: Siddhardth**  
*[Cue: Advance to Slide 3.]*

> **Siddhardth:** Thanks Sai. On the left are the working features live right now on Vercel, Render, and Supabase.
>
> Users can register with Argon2id-hashed passwords and signed `HttpOnly` cookie sessions, or use the one-click Sai and Siddhardth demo sign-in. Every new user gets an auto-funded $200 checking account, can hold up to four accounts, and can invite another user to a joint account with a 168-hour expiration window so ownership only happens after explicit consent.
>
> Transfers use exact recipient lookup by username, email, or phone, show a review-before-send confirmation modal with a client-generated UUID idempotency key, and write paired double-entry postings. Recipients can issue a compensating reversal without deleting history, and users get searchable activity, formula-safe CSV export, time-zone-aware 7/30/90-day insights, and a read-only PayBot assistant.
>
> On the right, we want to be completely transparent about four scope boundaries:
> 1. PayLink is a USD-only simulation — no real bank rails or real money.
> 2. Our hosted Supabase database only holds 12 transfers, so PostgreSQL legitimately chooses sequential scans there and **does not** use the BRIN index in production. Every query and index speedup we present was measured on our local 2-million-transfer dataset.
> 3. Our independent visual design review of the rebuilt UI ended **FAIL** with scores of 89, 92, and 96 out of 100 and no overall pass; we merged the UI as our current look, so we are not claiming a design-review pass.
> 4. PayBot runs read-only SQL and returns deterministic local template answers because our AWS Bedrock quota is still zero.
>
> With scope clear, Sai will walk through our 8-table database design.

---

### Slide 4 — Database Design: 8-Table ER Model *(~1:15)*
**Speaker: Sai**  
*[Cue: Advance to Slide 4. Point to navy MVP tables vs. teal post-MVP tables.]*

> **Sai:** Let’s look at the relational schema inside our private `paylink` schema. Dark navy boxes are the five MVP tables; teal boxes are the three tables we added after your feedback.
>
> Notice two deliberate structural choices right away:
> - First, `bank_accounts` has **no `user_id` column**. Ownership is modeled through the `account_holders` junction table with a composite primary key `(user_id, account_id)`. That lets a joint account have multiple owners while keeping **one** shared `balance_cents` row — no split balances to drift out of sync.
> - Second, `transfers` references `bank_accounts` twice (`source_account_id` and `destination_account_id` with `source <> destination`), and then fans out in a strict **1-to-2** relationship to `transfer_postings`: one negative debit leg and one positive credit leg. Because `transfers` is append-only, we never `UPDATE` or `DELETE` a completed transfer; instead, `transfer_reversals` links an original transfer 1-to-0..1 to a new compensating transfer, and `account_invitations` holds pending joint-owner requests before any row enters `account_holders`.
>
> One honest modeling note: “every account has at least one owner” is a workflow invariant enforced by our account-opening routine, not a declarative table constraint, because PostgreSQL doesn’t support cross-table `ASSERTION`s.

---

### Slide 5 — Constraints, Deferred Triggers & Security *(~1:15)*
**Speaker: Sai**  
*[Cue: Advance to Slide 5.]*

> **Sai:** Your feedback specifically asked what constraints we applied and why. We enforce integrity in five layers inside PostgreSQL itself — never trusting the frontend or even the FastAPI tier alone.
>
> First, all monetary fields are **integer cents** (`BIGINT`), bounded by `CHECK` constraints — zero floating-point rounding drift. Usernames, lowercase emails, E.164 phones, 9-digit routing numbers, and 12-digit account numbers all have regex `CHECK` constraints.
>
> Second, all **13 foreign keys** are `NOT NULL`, non-deferrable, and `ON DELETE NO ACTION / ON UPDATE NO ACTION`, so financial history cannot be silently cascaded away.
>
> Third, `account_invitations` uses a **partial unique index** on `(account_id, invitee_id) WHERE decision IS NULL`. That enforces at most one open invitation per pair while preserving full historical records of accepted, declined, and cancelled invites.
>
> Fourth — and this is the core ledger invariant — we added **two `DEFERRABLE INITIALLY DEFERRED` constraint triggers** (`transfers_require_postings` and `postings_match_transfer`). At commit time, they verify that every transfer has exactly one debit leg matching `-amount_cents` on the source account and one credit leg matching `+amount_cents` on the destination account.
>
> Finally, on the right: all eight tables have RLS enabled, Supabase’s `anon` and `authenticated` roles have zero grants on `paylink`, and FastAPI connects as a restricted `paylink_api` role that has **zero direct `UPDATE` or `DELETE` privileges** on balances or transfers. Every write goes through one of ten `SECURITY DEFINER` routines pinned to `search_path = pg_catalog, paylink`.

---

### Slide 6 — Normalization Analysis: 1NF → BCNF & Deliberate 3NF *(~1:15)*
**Speaker: Sai**  
*[Cue: Advance to Slide 6.]*

> **Sai:** Next, normalization level and specific design considerations.
>
> Look at the top strip: if you start from an unnormalized ownership table with repeating owners, flattening it to 1NF gives `OwnershipWide(user_id, account_id, bank_id, joined_at, ...)`. That violates 2NF because user attributes depend only on `user_id` and account attributes depend only on `account_id`. Extracting `users` and `bank_accounts` removes those partial dependencies. Then `account_id -> bank_id -> routing_number, bank_name` is a transitive dependency, so extracting `banks` reaches **BCNF** with a lossless join and full dependency preservation.
>
> Now here is the subtle part we want to highlight rather than gloss over: **seven of our eight tables are in BCNF**, but `transfer_postings` is **deliberately 3NF, not BCNF**.
>
> Why? Our sign `CHECK` constraint enforces that negative `delta_cents` is always `'debit'` and positive `delta_cents` is always `'credit'`. That induces the functional dependency `delta_cents -> side`. `delta_cents` is not a superkey, so BCNF is technically violated — yet `side` is a prime attribute of the primary key `(transfer_id, side)`, so it satisfies **3NF**. We intentionally kept both columns because `(transfer_id, side)` gives us a clean composite key and signed `delta_cents` lets reconciliation run a single `SUM(delta_cents)` without `CASE` branching, while the `CHECK` and deferred triggers eliminate update anomalies.
>
> Similarly, `bank_accounts.balance_cents` is a materialized cache of `opening_balance_cents + SUM(delta_cents)` for O(1) locked balance checks; it doesn’t break BCNF, and our reconciliation query verifies zero drift.

---

### Slide 7 — Transactions, Locking & Concurrency *(~1:15)*
**Speaker: Sai**  
*[Cue: Advance to Slide 7.]*

> **Sai:** How do we guarantee ACID transfers under concurrency? PostgreSQL runs at `READ COMMITTED`, and `paylink.execute_transfer()` takes explicit, deterministic locks in six steps.
>
> After input validation, step 2 takes a transaction-scoped advisory lock — `pg_advisory_xact_lock` hashed on `actor_id || ':' || idempotency_key`. If a user double-clicks or a network retry hits concurrently, the second transaction waits, sees the committed transfer on step 3, and returns the exact prior row if arguments match — or raises a conflict if arguments changed.
>
> Step 4 verifies ownership in `account_holders` using the JWT-derived `actor_id`. Step 5 locks **both** `bank_accounts` rows with `ORDER BY id ASC FOR UPDATE`. Deterministic UUID ordering makes circular waits between opposing `A -> B` and `B -> A` transfers impossible. Step 6 checks active status and sufficient balance, updates both balances, inserts the transfer and its two postings, and lets the deferred triggers fire at commit.
>
> One real concurrency detail on the right: when we serialize the 4-account cap on `users` inside `open_account` and `accept_invitation`, we use **`FOR NO KEY UPDATE`** instead of `FOR UPDATE`. Why? Because `transfers.initiated_by` has a foreign key to `users(id)` which acquires `FOR KEY SHARE`. `FOR UPDATE` conflicts with `FOR KEY SHARE` and stalls payments; `FOR NO KEY UPDATE` still serializes account creation while letting concurrent transfers fly through.
>
> All of this is backed by **37 automated pytest tests**, including 8 simultaneous same-key retries, 20 opposing `A <-> B` transfers with zero deadlocks, competing spends, and forced rollback tests.
>
> Now Siddhardth will walk through our dataset provenance and size.

---

### Slide 8 — Dataset Provenance & Scale *(~1:00)*
**Speaker: Siddhardth**  
*[Cue: Advance to Slide 8.]*

> **Siddhardth:** Thanks Sai. Your feedback asked where the data comes from and how big the database is. Because we have a live demo environment and a scale-testing environment, we keep them strictly separated.
>
> Our hosted Supabase PostgreSQL 17.11 database holds clean, curated demo data: 7 users, 3 banks, 9 accounts, 10 ownership links, 12 transfers, and 24 balanced postings — roughly 472 kilobytes total, with zero balance drift.
>
> For realistic indexing and query-plan testing, we wrote `scripts/synthetic_data.py`, which has a hard localhost-only guard so it can never accidentally seed Supabase. Locally on PostgreSQL 16.16, it generated **50,004 users**, **100,006 accounts**, **110,007 ownership rows** (10% joint), and **2,000,007 transfers** spanning 365 days — **1.45 gigabytes** total.
>
> Importantly, the generator doesn’t produce uniform toy data: 20% of transfers target the top 1% of hot accounts, giving heavy users around 840 transfers and typical users around 40, while chronological insertion gives `created_at` a physical heap correlation of 1.0.
>
> Again, because hosted Supabase only has 12 transfers, PostgreSQL uses sequential scans there and does not use BRIN. All of the SQL and index numbers Sai is about to show come from this local 2-million-transfer dataset. Over to you, Sai.

---

### Slide 9 — Complex SQL Queries in Production *(~1:15)*
**Speaker: Sai**  
*[Cue: Advance to Slide 9.]*

> **Sai:** Here are three representative SQL patterns from `backend/app/main.py` and `docs/queries.sql`.
>
> First, on the left, is our production `HISTORY_SQL`. Originally this used `WHERE source_account_id IN (...) OR destination_account_id IN (...) ORDER BY created_at DESC LIMIT 200`. At 2 million rows, that `OR` forced a full sequential scan. We rewrote it using `CROSS JOIN LATERAL` per owned account on the source index, `UNION`ed with `CROSS JOIN LATERAL` on the destination index, took the top 200 IDs, and joined back to `transfers` and `bank_accounts` only for those 200 rows. Both inner branches run as **Index-Only Scans with zero heap fetches**.
>
> Top right is `insights_weekly`. Previously, a `LEFT JOIN` against `generate_series` with an `OR` predicate re-scanned the entire 2-million-row table seven times — once per day bucket. Putting a `MATERIALIZED` CTE with a 7-day `UNION` range scan in front of the `LEFT JOIN` and using `SUM(...) FILTER (WHERE ...)` collapsed it to sub-millisecond latency.
>
> Bottom right shows our analytical running-balance window function using `SUM(change_cents) OVER (ORDER BY created_at, id ROWS UNBOUNDED PRECEDING)` and our ledger reconciliation query that checks every account’s cached balance against `SUM(transfer_postings.delta_cents)`.

---

### Slide 10 — Indexing Strategy & Why BRIN Beat B-Tree *(~1:15)*
**Speaker: Sai**  
*[Cue: Advance to Slide 10.]*

> **Sai:** Across all eight tables, PayLink has **24 indexes** — 16 primary/unique key indexes plus 8 secondary indexes tuned to our actual access paths.
>
> The two workhorse indexes are the composite B-trees on `transfers(source_account_id, created_at DESC, id DESC)` and `(destination_account_id, created_at DESC, id DESC)`. Those are ~200 MB each at 2 million rows and power our `LATERAL` Index-Only Scans. Meanwhile, the unique B-tree on `(initiated_by, idempotency_key)` drops duplicate-submit checks from 112.96 ms to **0.04 ms** — a **2,973×** speedup.
>
> Now, the most interesting indexing lesson was on `transfers(created_at)` for 30-day monthly insights. Our first instinct was a standard B-tree on `(created_at DESC, id DESC)`. It cost **81 megabytes** and — worse — it **hijacked `HISTORY_SQL`**: PostgreSQL’s planner decided to walk backwards through the global 2-million-row time index hoping to stumble across 200 rows for one user.
>
> Replacing it with a **BRIN index (`pages_per_range = 128`)** solved both problems. Because our append-only ledger has 1.0 physical `created_at` correlation, BRIN only stores min/max timestamps per 128 heap pages — **32 kilobytes total, 2,473× smaller than the B-tree**. And because BRIN cannot provide sort order, the planner never misuses it for `HISTORY_SQL`, while monthly insights still drop from 512 ms to 36 ms. On hosted Supabase, we created it with `CREATE INDEX CONCURRENTLY` outside a transaction so writes were never blocked.

---

### Slide 11 — Query Optimization Results (`EXPLAIN ANALYZE`) *(~0:50)*
**Speaker: Sai**  
*[Cue: Advance to Slide 11. Point to Panel A (log scale), then Panel B (BRIN vs B-tree).]*

> **Sai:** Here are the verified local `EXPLAIN (ANALYZE, BUFFERS)` medians across three alternating runs on 2,000,007 transfers with default PostgreSQL planner settings.
>
> On the left, Panel A is on a logarithmic scale:
> - `HISTORY_SQL` dropped from **623.4 ms to 7.91 ms** for a heavy user (**78.8× faster**), and from **536.4 ms to 1.98 ms** for a typical user (**270× faster**).
> - `insights_weekly` dropped from **2,054.5 ms to 0.47 ms** for a heavy user (**4,344× faster**), and **1,973.8 ms to 0.33 ms** for a typical user (**5,999× faster**).
>
> On the right, Panel B shows monthly insights: BRIN-128 achieves **14.1× speedup** (512.1 ms down to 36.3 ms) at **32 KB**, nearly matching the 81 MB B-tree without any plan hijacking.
>
> Now I’ll hand it to Siddhardth to trace how a live UI request flows from Next.js through FastAPI into PostgreSQL and drive our live demo.

---

### Slide 12 — End-to-End Request Flow: UI → FastAPI → PostgreSQL *(~1:00)*
**Speaker: Siddhardth**  
*[Cue: Advance to Slide 12. Trace left-to-right across the three tiers.]*

> **Siddhardth:** Your feedback asked us to show the full interaction from the UI frontend all the way to the database, including the actual requests.
>
> When a user confirms a transfer in the Next.js Review modal on Vercel, the browser sends a same-origin `POST /api/transfers` carrying the `HttpOnly` session cookie, source and destination UUIDs, integer `amount_cents`, memo, and the client-generated `idempotency_key`. Notice it never sends a `user_id` in the body.
>
> Next.js proxies `/api/*` to our FastAPI service on Render. FastAPI verifies the `Origin` header, validates the HS256 JWT cookie to extract the trusted `actor_id`, runs Pydantic validation, and borrows a connection from the `psycopg` pool authenticated as the restricted `paylink_api` role.
>
> FastAPI executes `SELECT * FROM paylink.execute_transfer(...)` inside a single transaction. PostgreSQL runs the advisory lock, idempotency check, ownership check, ordered `FOR UPDATE`, balance updates, transfer + two posting inserts, and deferred triggers. On `COMMIT`, FastAPI returns HTTP 201 and the UI refreshes balances and activity.
>
> Let’s switch to the live app and walk through it.

---

### Slide 13 — Live Application Demo *(~2:30)*
**Speakers: Siddhardth (driving UI) + Sai (narrating database behavior)**  
*[Cue: Advance to Slide 13 briefly, then switch to live browser at `https://paylink-radiant690s-projects.vercel.app/`. Reminder: keep live demo read-only unless professor specifically asks to submit a test transfer.]*

> **Siddhardth:** *(Opens live site)* First, we’ve verified `/api/health` returns `database: connected, simulation: true`. I’ll use the one-click demo sign-in as **Sai (`@sai`)**.
>
> Here on **Overview**, you see Sai’s combined balance across his personal checking, savings, and joint **Shared expenses** account, plus this month’s external cash flow and recent activity.
>
> **Sai:** Behind this single screen, `GET /api/workspace` joins `account_holders`, `bank_accounts`, and `banks`, runs our `LATERAL` `HISTORY_SQL` query, and excludes internal self-transfers from the monthly cash-flow card so moving money between your own accounts never inflates spending.
>
> **Siddhardth:** *(Clicks **Accounts**)* On **Accounts**, you see personal vs. joint badges, the 4-account cap indicator, and the **Joint account requests** section backed by `account_invitations`. If you click **Add joint owner**, it creates a 168-hour pending invitation rather than immediately mutating `account_holders`.
>
> *(Clicks **Activity** and opens a transfer detail)* In **Activity**, clicking any transfer opens its detail drawer showing the memo, counterparty, and the **two double-entry ledger postings** from `transfer_postings` — one negative debit leg and one positive credit leg — plus the compensating **Reverse transfer** action for eligible received transfers.
>
> **Sai:** And if that reversal is triggered, `paylink.reverse_transfer()` locks the original transfer `FOR NO KEY UPDATE`, verifies it hasn’t already been reversed, creates a brand-new compensating transfer with two more postings, and links them in `transfer_reversals` — zero destructive deletes.
>
> **Siddhardth:** *(Clicks **Insights** and toggles 7 / 30 / 90 days)* Here in **Insights**, toggling 7, 30, and 90 days hits `/api/insights/report`, which runs time-zone-aware SQL aggregations with `generate_series` and top-counterparty rankings.
>
> *(Opens **PayBot** and asks "What is my total balance?")* Finally, **PayBot** parses the intent, runs a read-only parameterized SQL query scoped to Sai’s `actor_id`, and returns a deterministic local answer — again, no Bedrock call because our AWS quota is zero.
>
> *(Switches back to Slide 14.)*

---

### Slide 14 — Challenges, Lessons Learned & Q&A *(~1:15)*
**Speakers: Siddhardth (challenges 1–2) + Sai (challenges 3–4, closing & Q&A)**  
*[Cue: Advance to Slide 14.]*

> **Siddhardth:** To wrap up, here are four real engineering challenges we hit and solved:
> 1. **B-tree plan hijacking:** Adding a global `created_at` B-tree sped up monthly insights but broke `HISTORY_SQL` by luring the planner into global backwards scans. Replacing it with a 32 KB BRIN index and the `LATERAL` rewrite taught us to re-run `EXPLAIN ANALYZE` on *every* query after adding an index.
> 2. **Foreign-key lock contention:** Locking `users` with `FOR UPDATE` during account creation collided with `KEY SHARE` locks from concurrent transfers on `initiated_by`. Downgrading to `FOR NO KEY UPDATE` kept the 4-account cap atomic without stalling payments.
>
> **Sai:** And two operational PostgreSQL lessons:
> 3. **Docker `/dev/shm` vacuum failure:** After loading 2 million synthetic transfers in Docker, parallel `VACUUM` aborted against the default 64 MiB shared memory cap. Running `VACUUM (ANALYZE, PARALLEL 0)` rebuilt visibility maps so Index-Only Scans actually achieved zero heap fetches.
> 4. **Hosted vs. local planner reality:** Hosted Supabase tracks migrations in its own `supabase_migrations` ledger and legitimately picks sequential scans on 12 rows. Building indexes `CONCURRENTLY` outside transactions and separating hosted correctness from local 2M-row benchmarking gave us clean, honest evidence.
>
> The core takeaway of PayLink is that database correctness isn’t one feature — it’s layered enforcement across normalization, constraints, deferred triggers, deterministic lock ordering, least-privilege roles, and `EXPLAIN`-verified indexing.
>
> Thank you — we’re happy to take any questions!

---

## Professor Q&A Prep Bank (Lead: Sai)

1. **Q: Why is `transfer_postings` in 3NF instead of BCNF? Why not remove `side`?**  
   **Sai:** Because `delta_cents < 0` implies `side = 'debit'` and `delta_cents > 0` implies `side = 'credit'`, `delta_cents -> side` holds while `delta_cents` is not a superkey. `side` is a prime attribute of `(transfer_id, side)`, so it is in 3NF. Removing `side` would force `(transfer_id, account_id)` to be the sole PK and require `CASE WHEN delta_cents < 0` in every query; keeping both gives a clean debit/credit key and direct `SUM(delta_cents)` reconciliation, while the `CHECK` and deferred triggers prevent any update anomaly.

2. **Q: Why didn’t PostgreSQL use your BRIN index on Supabase?**  
   **Sai:** Our hosted Supabase `transfers` table has 12 rows — literally one 8 KB heap page. Reading a single heap page sequentially is strictly cheaper than probing any index, so PostgreSQL’s cost-based planner rightly chooses a Sequential Scan. BRIN shines when the table spans thousands of heap pages with high physical time correlation, which we proved locally on 2,000,007 rows (512.1 ms → 36.3 ms at 32 KB).

3. **Q: Why `READ COMMITTED` with explicit locks instead of `SERIALIZABLE`?**  
   **Sai:** Under `SERIALIZABLE` (SSI), conflicting transactions fail with `SQLSTATE 40001` and require an application retry loop. Because our transfer conflicts are narrow and deterministic (two account rows plus one idempotency key), `READ COMMITTED` with an advisory lock and `ORDER BY id ASC FOR UPDATE` gives us deadlock-free serialization in a single round trip without serialization aborts.

4. **Q: How do you prevent a transfer from being inserted without its two posting legs?**  
   **Sai:** Two layers: first, `paylink_api` has zero direct `INSERT` privileges on `transfers` or `transfer_postings` — writes only go through `execute_transfer()`. Second, even for a superuser or future routine, our two `DEFERRABLE INITIALLY DEFERRED` constraint triggers (`transfers_require_postings` and `postings_match_transfer`) validate at `COMMIT` that exactly one matching debit leg and one matching credit leg exist, or roll back the entire transaction.

5. **Q: Why did the independent UI review say FAIL, and why doesn’t PayBot use Bedrock?**  
   **Siddhardth / Sai:** We ran an independent visual audit that scored 89, 92, and 96/100 without an overall pass, and we merged the rebuilt UI as our current look rather than inflating the result. For PayBot, our AWS Bedrock model quota is still zero, and Cloud Computing/AWS is a separate course track — so PayBot runs read-only parameterized SQL against PostgreSQL and returns deterministic local answers.

# PayLink — CS 5600 Advanced Database Systems Presentation Script

**Speakers:** Venkata Sai Kadamati (**Sai**) and **Siddhardth**  
**Deck:** `docs/adb-final-presentation.pptx` (17 slides, built on the shared `EcoCraft_Cloud_Presentation.pptx` template)  
**Companion Report:** `docs/adb-final-report.pdf` (built in the exact `EcoCraft_AWS_Deployment_Report.docx` style)  
**Live App:** `https://paylink-radiant690s-projects.vercel.app/`  
**Estimated Time:** ~14–16 minutes + Q&A *(no presentation time limit was specified in the supplied guide `info.md`; shorten or expand the live demo on Slide 15 to fit the room)*

---

## How the Talk Is Split

Sai takes the heavy database-engineering halves (overview & MVP evolution, 8-table schema & ER diagram, constraints & triggers, normalization, transactions & concurrency, core SQL & BRIN indexing, `EXPLAIN ANALYZE` benchmarks, DB narration during the live demo, and Q&A lead). Siddhardth handles live features, application stack, dataset provenance, end-to-end UI→API→DB request flow, driving the live demo, and the first half of challenges.

| Slide | Topic | Lead |
|---:|---|---|
| 1 | Title Slide | **Sai** |
| 2 | Project Overview | **Sai** |
| 3 | Implemented Features | **Siddhardth** |
| 4 | Application & Database Stack | **Siddhardth** |
| 5 | Database Design: 5 MVP → 8 Tables | **Sai** |
| 6 | Eight-Table ER Diagram (Full Slide) | **Sai** |
| 7 | Constraints, Triggers & Security | **Sai** |
| 8 | Normalization & Design Considerations | **Sai** |
| 9 | Transactions, Locking & Concurrency | **Sai** |
| 10 | Dataset Source & Size | **Siddhardth** |
| 11 | Core SQL Queries & Indexing Strategy | **Sai** |
| 12 | Query Optimization Benchmark Chart (Full Slide) | **Sai** |
| 13 | End-to-End Request Flow | **Siddhardth** |
| 14 | Architecture Request Diagram (Full Slide) | **Siddhardth** |
| 15 | Live Demo | **Siddhardth + Sai** |
| 16 | Challenges, Fixes & Honest Scope | **Siddhardth + Sai** |
| 17 | Any Questions? / Thank You | **Sai + Siddhardth** |

---

## Slide-by-Slide Conversational Script

### Slide 1 — Title Slide *(~0:25)*
**Sai:**  
Hi Professor, hi everyone. I’m Sai, and this is Siddhardth. Today we’re presenting the final version of **PayLink** for Advanced Database Systems — our simulated peer-to-peer banking app built with Next.js, FastAPI, and PostgreSQL.

One quick note before we start: you already saw our five-table MVP earlier in the semester — that’s tagged `mvp-presented-baseline` in our repo. What we’re showing today is how we evolved that exact baseline into an eight-table transactional ledger based on your feedback. Everything here runs on Vercel, Render, and Supabase PostgreSQL — no AWS services are part of this database submission.

---

### Slide 2 — Project Introduction & MVP Evolution *(~0:55)*
**Sai:**  
So here’s the big picture of what actually changed since the MVP.

Back at the MVP presentation, we had five tables, basic checks, small demo data, and `OR` queries that worked fine on a handful of rows. When we took your feedback seriously — especially around schema complexity, real constraints, normalization depth, dataset scale, and indexing rationale — we upgraded three major areas:

- First, we expanded from **five tables to eight**, adding double-entry `transfer_postings`, consent-based `account_invitations`, and compensating `transfer_reversals`.
- Second, we built a **2-million-transfer local benchmark** — about 1.45 gigabytes — so we could measure real query plans instead of guessing on twelve demo rows.
- And third, we rewrote our hot queries and added a **32-kilobyte BRIN index**, which took our local history and weekly insight queries from hundreds and thousands of milliseconds down to single-digit and sub-millisecond times.

Let me hand it to Siddhardth to walk through the features that are actually live right now.

---

### Slide 3 — Implemented Features Live on Production *(~0:55)*
**Siddhardth:**  
Thanks Sai. On production right now, all six of these flows work end-to-end.

Users sign up with Argon2id-hashed passwords and signed `HttpOnly` cookie sessions, or click straight into the Sai and Siddhardth demo accounts. Every new user automatically gets a $200 simulated checking account, can hold up to four accounts across banks, and can share joint accounts — except now, instead of instantly adding someone, you send a 168-hour invitation that they have to explicitly accept.

For transfers, you look up a recipient by exact username, email, or phone, review the masked accounts and post-transfer balance, and submit with a client-generated UUID idempotency key. Every transfer writes paired debit and credit legs, and recipients can issue a compensating reversal without deleting history. We also have searchable activity, formula-safe CSV export, 7/30/90-day insights, and a read-only local PayBot.

Sai, do you want to walk through how the eight tables fit together?

---

### Slide 4 — Application & Database Stack *(~0:40)*
**Siddhardth:**  
Quick overview of how the pieces run in production: the frontend is Next.js App Router on Vercel, the backend is Python FastAPI with a `psycopg` pool on Render, and our hosted database is Supabase PostgreSQL 17.11 inside a private `paylink` schema excluded from Supabase’s public Data API. For scale testing, we run a separate local Docker PostgreSQL 16.16 instance with 2 million synthetic transfers. The browser only ever hits same-origin `/api/*`, and FastAPI connects as our restricted `paylink_api` role.

Sai, over to you for the eight-table database design.

---

### Slide 5 — Database Design: 5 MVP → 8 Tables *(~1:00)*
**Sai:**  
Thanks Siddhardth. Here’s how we evolved the five-table MVP into eight tables:
- We kept the five MVP tables (`users`, `banks`, `bank_accounts`, `account_holders`, `transfers`) intact.
- We added `transfer_postings` (strictly 1-to-2: one debit leg, one credit leg), `account_invitations` (168-hour consent queue before inserting into `account_holders`), and `transfer_reversals` (1-to-0..1 compensating transfer link with no deletes and no reversal chains).
- And notice `bank_accounts` intentionally has no `user_id` column — M-to-N ownership through `account_holders` keeps **one** shared `balance_cents` row for joint accounts. Minimum one owner per account is enforced by `open_account()`, not a cross-table SQL `ASSERTION`.

---

### Slide 6 — Eight-Table ER Diagram (Full Slide) *(~0:50)*
**Sai:**  
Here’s the full eight-table ER model inside `paylink`: dark navy boxes are the five MVP tables, and teal boxes are the three post-MVP extensions. Everything pivots cleanly around `bank_accounts` and `transfers` with zero duplicated user or bank attributes.

---

### Slide 7 — Constraints, Triggers & Security *(~1:10)*
**Sai:**  
One of your biggest pieces of feedback was: *what constraints did you actually apply in the database?* We didn’t leave integrity to the frontend or FastAPI — we enforced it in five layers inside PostgreSQL.

- All money is stored as **integer cents (`BIGINT`)** with tight range `CHECK`s — zero floating-point rounding bugs — plus regex `CHECK`s on usernames, lowercase emails, E.164 phones, 9-digit routing numbers, and 12-digit account numbers, plus `source_account_id <> destination_account_id`.
- All **13 foreign keys** are `NOT NULL` and `ON DELETE NO ACTION / ON UPDATE NO ACTION`, so nobody can accidentally cascade-delete financial history.
- On `account_invitations`, we use a **partial unique index** on `(account_id, invitee_id) WHERE decision IS NULL` — that blocks duplicate open offers while still letting us keep the full history of accepted, declined, and cancelled invites.
- For double-entry integrity, we wrote **two `DEFERRABLE INITIALLY DEFERRED` constraint triggers** that fire at `COMMIT` and verify every transfer has one matching debit leg and one matching credit leg.
- And on the right: RLS is enabled on all eight tables, Supabase’s `anon` and `authenticated` roles have zero grants, and FastAPI connects as a restricted `paylink_api` role with **zero direct `UPDATE` or `DELETE` privileges** on balances or transfers. Every write runs through one of ten `SECURITY DEFINER` routines pinned to `search_path = pg_catalog, paylink`.

---

### Slide 8 — Normalization & Design Considerations *(~1:05)*
**Sai:**  
For normalization, we didn’t just stamp "BCNF" on everything and move on.

If you start from an unnormalized ownership table with repeating owners, flattening to 1NF leaves partial dependencies on `user_id` and `account_id`. Extracting `users` and `bank_accounts` gets us to 2NF, and pulling out `banks` removes the transitive dependency `account_id -> bank_id -> routing_number, bank_name`, giving a lossless, dependency-preserving BCNF decomposition.

So **seven of our eight tables are in BCNF**. The one deliberate exception is **`transfer_postings`**, which is in **3NF, not BCNF**. Why? Because our sign `CHECK` enforces that negative `delta_cents` is always `'debit'` and positive `delta_cents` is always `'credit'`. That means `delta_cents -> side` holds even though `delta_cents` isn’t a superkey. Since `side` is a prime attribute of the composite key `(transfer_id, side)`, it satisfies 3NF. We kept both columns intentionally so we get a clean debit/credit primary key *and* a single `SUM(delta_cents)` reconciliation query without `CASE` statements — while our `CHECK` and deferred triggers prevent any update anomaly.

Similarly, `balance_cents` on `bank_accounts` is a materialized cache of `opening_balance_cents + SUM(delta_cents)` so balance checks stay O(1) under lock, and our reconciliation query proves zero drift.

---

### Slide 9 — Transactions, Locking & Concurrency *(~1:10)*
**Sai:**  
Now let’s look at the exact concurrency implementation inside `paylink.execute_transfer()`. We run under PostgreSQL’s default `READ COMMITTED` with explicit deterministic locks, which avoids `SERIALIZABLE` retry aborts.

When a transfer comes in, six things happen inside one transaction:
1. Validate bounds and non-self transfer.
2. Acquire a transaction-scoped advisory lock — `pg_advisory_xact_lock` hashed on `actor_id || ':' || idempotency_key` — so simultaneous double-clicks or retries serialize cleanly.
3. Check `(initiated_by, idempotency_key)`: identical arguments return the prior row; changed arguments raise a conflict.
4. Verify ownership in `account_holders` using the JWT-derived `actor_id`.
5. Lock **both** `bank_accounts` rows using `ORDER BY id ASC FOR UPDATE`. Locking by ascending UUID makes circular waits between opposing `A -> B` and `B -> A` transfers impossible.
6. Update both balances, insert the transfer and its two postings, and let the deferred triggers verify the pair at `COMMIT`.

One subtle concurrency detail we hit: when `open_account()` and `accept_invitation()` serialize the 4-account cap on `users`, we lock the user row with **`FOR NO KEY UPDATE`** instead of `FOR UPDATE`. Because `transfers.initiated_by` has a foreign key to `users(id)` that takes `KEY SHARE`, `FOR NO KEY UPDATE` keeps the 4-account cap atomic without stalling concurrent payments.

All of this is verified by **37 automated pytest tests** — including 8 simultaneous same-key retries, 20 opposing `A <-> B` transfers with zero deadlocks, and forced rollback tests.

Siddhardth, want to cover where our data comes from and how big it is?

---

### Slide 10 — Dataset Source & Size *(~0:55)*
**Siddhardth:**  
Sure. We keep our live demo database and our scale-testing database completely separate.

On the left, hosted Supabase PostgreSQL 17.11 holds our clean demo data: 7 users, 3 banks, 9 accounts, 10 ownership rows, 12 transfers, and 24 balanced postings — about 472 kilobytes total with zero balance drift.

On the right, to test real query plans and indexes at scale, we wrote `scripts/synthetic_data.py` with a hard localhost-only guard so it can never accidentally touch Supabase. Locally on PostgreSQL 16.16, it generated **50,004 users**, **100,006 accounts**, and **2,000,007 transfers** across 365 days — roughly **1.45 gigabytes**. It also models realistic skew: 20% of transfers hit the top 1% of hot accounts, and chronological insertion gives `created_at` a physical heap correlation of 1.0.

One important thing we want to be upfront about: because hosted Supabase only has 12 transfers — literally one 8 KB heap page — PostgreSQL rightly uses a Sequential Scan there and **does not** use the BRIN index in production. Every query and index speedup Sai is about to show was measured on the local 2-million-transfer dataset. Back to you, Sai.

---

### Slide 11 — Core SQL Queries & Indexing Strategy *(~1:30)*
**Sai:**  
Thanks Siddhardth. Here are the three main SQL patterns we actually run in production and analytics.

First, our **`HISTORY_SQL`** query in `backend/app/main.py`. Originally it used `WHERE source_account_id IN (...) OR destination_account_id IN (...) ORDER BY created_at DESC LIMIT 200`. At 2 million rows, that `OR` forced a full sequential scan. We rewrote it using `CROSS JOIN LATERAL` per owned account on the source index, `UNION`ed with `CROSS JOIN LATERAL` on the destination index, took the top 200 IDs, and joined back only for those 200 rows. Both inner branches run as **Index-Only Scans with zero heap fetches**.

Second, **weekly insights**. A `LEFT JOIN` against `generate_series` with an `OR` predicate used to re-scan the entire 2-million-row table seven times — once per day. Putting a `MATERIALIZED` 7-day `UNION` CTE in front of the `LEFT JOIN` and using conditional `SUM(...) FILTER (WHERE ...)` cut it down to under half a millisecond.

Third, in `docs/queries.sql`, we use a `SUM(change_cents) OVER (ORDER BY created_at, id ROWS UNBOUNDED PRECEDING)` window function for deterministic running balances, and a postings-sum reconciliation query that checks every account for zero drift.

---

**Indexing Strategy & Why BRIN Beat B-Tree (still on Slide 11):**
**Sai:**  
Across all eight tables, we have **24 indexes** — 16 primary/unique indexes plus 8 secondary access-path indexes.

Our two per-account composite B-trees on `(source_account_id, created_at DESC, id DESC)` and the destination pair power those `LATERAL` Index-Only Scans. And the unique B-tree on `(initiated_by, idempotency_key)` drops duplicate-submit lookups from 112.96 ms to **0.04 ms** — nearly **3,000× faster**.

The coolest indexing lesson was for 30-day monthly insights on `transfers(created_at)`. Our first instinct was a normal B-tree on `(created_at DESC, id DESC)`. Not only did it cost **81 megabytes**, it actually **hijacked `HISTORY_SQL`** — the planner tried walking backwards through the global 2-million-row time index looking for one user’s transfers!

Switching to a **BRIN index (`pages_per_range = 128`)** fixed both issues. Because our append-only ledger has 1.0 time correlation, BRIN only stores min/max timestamps per 128 heap pages — **32 kilobytes total, 2,473× smaller than the B-tree**. And because BRIN can’t provide sort order, the planner never hijacks `HISTORY_SQL` with it, while monthly insights still run **14.1× faster**. On hosted Supabase, we built it with `CREATE INDEX CONCURRENTLY` outside a transaction so writes were never blocked.

---

### Slide 12 — Query Optimization Benchmark Chart (Full Slide) *(~0:45)*
**Sai:**  
Here are the local `EXPLAIN (ANALYZE, BUFFERS)` results — medians of three alternating runs on 2,000,007 transfers with default planner settings:

- On the left (log scale): **`HISTORY_SQL`** dropped from **623.4 ms to 7.91 ms** for a heavy user (**78.8× faster**), and **536.4 ms to 1.98 ms** for a typical user (**270× faster**).
- **`insights_weekly`** dropped from **2,054.5 ms to 0.47 ms** (**4,344× faster**) for a heavy user, and **1,973.8 ms to 0.33 ms** (**5,999× faster**) for a typical user.
- On the right: **32 KB BRIN** cut monthly insights from **512.1 ms to 36.3 ms** (**14.1× faster**), matching the 81 MB B-tree’s range-scan speed without any plan hijacking.

Now Siddhardth will trace a live request from the UI all the way to PostgreSQL and drive the live demo.

---

### Slide 13 — End-to-End Request Flow *(~0:55)*
**Siddhardth:**  
Your feedback also asked us to trace the full interaction from the UI frontend through the backend to the database.

When a user clicks Confirm in our Next.js Review modal on Vercel, the browser sends a same-origin `POST /api/transfers` with the `HttpOnly` session cookie, source and destination account UUIDs, integer `amount_cents`, memo, and the client-generated `idempotency_key` — never a raw `user_id`.

Next.js proxies `/api/*` server-side to FastAPI on Render. FastAPI checks the `Origin` header, validates the HS256 JWT cookie to derive `actor_id`, runs Pydantic validation, and borrows a `psycopg` connection authenticated as the restricted `paylink_api` role.

FastAPI calls `SELECT * FROM paylink.execute_transfer(...)` inside one transaction. PostgreSQL runs the advisory lock, idempotency check, ownership check, ordered `FOR UPDATE`, balance updates, transfer plus two postings, and deferred triggers. On `COMMIT`, FastAPI returns HTTP 201 and the UI refreshes balances and activity.

Let’s switch to the live browser and show it running.

---

### Slide 14 — Live Application Demo *(~2:30)*
*(Siddhardth shares/switches to `https://paylink-radiant690s-projects.vercel.app/` and drives; Sai narrates the database behavior behind each screen. Keep live demo read-only unless Professor asks to submit a transfer.)*

**Siddhardth:**  
First, `/api/health` is green — `database: connected, simulation: true`. I’ll use the one-click demo login as **Sai (`@sai`)**.

Here on **Overview**, we see Sai’s combined balance across his personal checking, savings, and joint **Shared expenses** account, plus this month’s external cash flow and recent activity.

**Sai:**  
Behind that one page load, `GET /api/workspace` joins `account_holders`, `bank_accounts`, and `banks`, runs our `LATERAL` `HISTORY_SQL` query, and filters out internal self-transfers from the monthly cash-flow card so moving money between your own accounts never inflates spending.

**Siddhardth:**  
*(Opens **Accounts**)* On **Accounts**, you can see personal versus joint badges, the 4-account cap, and the **Joint account requests** queue backed by `account_invitations`. Clicking **Add joint owner** creates a 168-hour pending offer instead of immediately inserting into `account_holders`.

*(Opens **Activity** and clicks a transfer)* In **Activity**, clicking any transfer opens its detail view showing the **two double-entry ledger postings** from `transfer_postings` — one negative debit leg and one positive credit leg — plus the **Reverse transfer** action for eligible received transfers.

**Sai:**  
And behind that reversal button, `paylink.reverse_transfer()` locks the original transfer `FOR NO KEY UPDATE`, makes sure it hasn’t already been reversed, creates a new compensating transfer with two more postings, and links them in `transfer_reversals` — zero destructive deletes.

**Siddhardth:**  
*(Opens **Insights** and toggles 7 / 30 / 90 days)* In **Insights**, switching between 7, 30, and 90 days calls `/api/insights/report`, which runs time-zone-aware SQL aggregations and top-counterparty rankings.

*(Opens **PayBot** and asks "What is my total balance?")* And **PayBot** parses the question, runs a read-only parameterized SQL query scoped to Sai’s `actor_id`, and returns a deterministic local answer.

Let’s jump back to our last slide to wrap up.

---

### Slide 15 — Challenges, Honest Scope & Q&A *(~1:10)*
**Siddhardth:**  
To close out, we hit four real database engineering challenges along the way. On my side, two big ones were **B-tree plan hijacking** — where a global `created_at` B-tree broke `HISTORY_SQL` until we switched to 32 KB BRIN plus `LATERAL` — and **foreign-key lock contention**, where `FOR UPDATE` on `users` blocked concurrent transfers until we downgraded it to `FOR NO KEY UPDATE`.

**Sai:**  
And two operational lessons on PostgreSQL: locally in Docker, parallel `VACUUM` aborted against the default 64 MiB `/dev/shm` limit after loading 2 million rows, so running `VACUUM (ANALYZE, PARALLEL 0)` was essential to refresh visibility maps for zero-heap-fetch Index-Only Scans. And on hosted Supabase, we learned to build indexes `CONCURRENTLY` outside transactions and keep hosted correctness evidence strictly separate from local 2-million-row benchmarks.

On the right, we’re keeping our limitations completely transparent:
- Hosted Supabase only has 12 rows, so it uses Sequential Scans, not BRIN.
- Our independent UI visual review ended **FAIL** (89, 92, 96/100; no overall pass), and we merged the UI as our current look without claiming a pass.
- PayBot returns deterministic local answers because our AWS Bedrock quota is zero.
- And point-in-time backup restore and production-scale load drills were outside our test scope.

Thank you so much — we’d love to take any questions!

---

## Quick Q&A Prep (Lead: Sai)

- **Why is `transfer_postings` 3NF instead of BCNF?**  
  The sign `CHECK` induces `delta_cents -> side` where `delta_cents` isn’t a superkey, violating BCNF. Because `side` is a prime attribute of `(transfer_id, side)`, it’s in 3NF. We kept both so `(transfer_id, side)` is a clean PK and reconciliation is a single `SUM(delta_cents)`, while the `CHECK` and deferred triggers block any drift.
- **Why doesn’t Supabase use the BRIN index?**  
  Hosted `transfers` has 12 rows (one 8 KB page). Reading one page sequentially is cheaper than probing any index, so the cost-based planner rightly picks Seq Scan. BRIN pays off on thousands of time-ordered pages, proven locally on 2,000,007 rows.
- **Why `READ COMMITTED` + explicit locks instead of `SERIALIZABLE`?**  
  Our conflicts are narrow and deterministic (two account rows + one idempotency key). Advisory locking plus `ORDER BY id ASC FOR UPDATE` gives deadlock-free serialization in one round trip without `SQLSTATE 40001` retry aborts.
- **How do you guarantee every transfer has two postings?**  
  `paylink_api` has zero direct `INSERT` on `transfers` or `transfer_postings`, and two `DEFERRABLE INITIALLY DEFERRED` constraint triggers verify the exact debit/credit pair at `COMMIT` or roll back the entire transaction.

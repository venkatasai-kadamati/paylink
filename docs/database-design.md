# PayLink database design

## Scope and assumptions

PayLink is a **USD-only simulation**. There are no real bank links, payment networks, withdrawals, fees, currency conversion, password recovery, or real account numbers. An account number is unique only within its bank. A bank routing number is globally unique in this model. A label is a property of the shared account, not a separate nickname per owner. All joint owners have equal spending permission. A transfer has exactly one source, one destination, and one initiating user. Only completed transfers are stored; a rejected transfer rolls back and is not represented as a completed or pending row.

New profiles automatically receive a $200 checking account; the profile, account, and holder commit or roll back together. Additional accounts also open with $200, while existing balances are preserved.

The application schema has **eight** base relations: the five in the original proposal plus account invitations, transfer postings, and transfer reversals (midterm milestone 6). It runs on hosted Supabase PostgreSQL 17.11; the local verification below used isolated PostgreSQL 16. The local `paylink_meta.migrations` and hosted `supabase_migrations.schema_migrations` ledgers are operational metadata, not domain entities. Keep `paylink` private and out of the exposed Supabase Data API schemas.

## Editable conceptual and logical model

The editable [Mermaid ER model](er-diagram.mmd) describes the current eight-table schema. The Draw.io, Graphviz, SVG, and PNG files show the original five-table MVP.

| Relationship | Cardinality | Implementation and participation |
|---|---|---|
| Bank → BankAccount | 1 : 0..N | Each account has exactly one non-null bank FK. A bank can have no accounts. |
| User ↔ BankAccount | M : N | `account_holders(user_id, account_id)`, with a composite PK and two FKs. A user may initially own zero accounts. |
| BankAccount → AccountHolder | 1 : 1..N intended | The account-opening function inserts account and first holder atomically. SQL FKs alone do **not** enforce an account having at least one holder; administrative SQL can violate that minimum. |
| User → Transfer | 1 : 0..N | One non-null `initiated_by` FK per transfer; not a duplicate of account ownership. |
| BankAccount → Transfer (source) | 1 : 0..N | One non-null source FK. |
| BankAccount → Transfer (destination) | 1 : 0..N | One non-null destination FK; source must differ. |
| BankAccount → AccountInvitation | 1 : 0..N | Each offer concerns one account; accepting, not sending, can add a holder. |
| User → AccountInvitation (inviter and invitee) | 1 : 0..N each | Both roles are required and refer to different users. |
| Transfer → TransferPosting | 1 : exactly 2 | A deferred constraint requires one matching debit and one matching credit at commit. |
| BankAccount → TransferPosting | 1 : 0..N | A posting records signed movement for exactly one account. |
| Transfer → TransferReversal (original and compensation) | 1 : 0..1 each | A reversal links two distinct completed transfers; the controlled workflow does not allow reversal chains. |

No redundant direct `user_id` is stored on `bank_accounts`. A joint account therefore remains one account with one balance. Summing after an owner join can multiply its balance; account-scoped queries deduplicate by account ID.

## Data dictionary

| Relation | Keys | Non-key attributes and domains |
|---|---|---|
| `users` | PK `id`; alternate keys `username`, `email` | UUID id; lowercase username `[a-z][a-z0-9_]{2,29}`; lowercase unique email; nullable unique E.164-style phone; full_name 1–80 chars; Argon2id password_hash; created_at timestamptz. |
| `banks` | PK `id`; alternate key `routing_number` | Nine-digit routing string; name text. A name is not assumed unique. |
| `bank_accounts` | PK `id`; alternate key `(bank_id, account_number)` | Non-null bank FK; 12-digit synthetic account number; checking/savings type; shared label 1–60 chars; bigint balance and opening balance in cents, both 0–900,000,000,000,000; active boolean; created_at. |
| `account_holders` | PK `(user_id, account_id)`; both FKs | joined_at depends on the complete ownership pair. No redundant user name, bank name, or balance. |
| `transfers` | PK `id`; alternate key `(initiated_by, idempotency_key)` | Three non-null FKs; integer amount 1–100,000,000 cents; memo ≤140 chars; UUID idempotency key; timestamptz. Source and destination differ. |
| `account_invitations` | PK `id`; partial unique index on undecided `(account_id, invitee_id)` | Account, inviter and invitee FKs; creation and expiry timestamps; nullable decision and decision time. |
| `transfer_postings` | PK `(transfer_id, side)`; alternate unique key `(transfer_id, account_id)` | Transfer and account FKs; debit/credit side; signed bigint delta. |
| `transfer_reversals` | PK `original_transfer_id`; alternate key `reversing_transfer_id`; both FKs | Short reason explaining a compensating transfer. |

Phone is optional. PostgreSQL's normal UNIQUE semantics permit multiple NULLs, so **phone is not an unconditional candidate key**. For present phone values, uniqueness permits exact lookup. This distinction avoids treating SQL NULL as an ordinary value in the normalization proof. The syntax checks for email/phone establish format, not real-world verification.

Amounts use integer cents to exclude floating-point rounding. The maximum balance is below JavaScript's exact-integer limit. All accounts are USD, so no account currency or exchange-rate FD is introduced. Money is formatted only at the presentation boundary.

## Professor feedback: constraints and normalization

From the [professor feedback notes](../documentation/requirements/advanced%20database/feedback%20from%20professor/feedback.md), verbatim:

> 3. contraints applied

> 5. what level of normailziation is done and what speciic considerations are done

### Item 3: constraints and why they exist

**Primary keys.** `users`, `banks`, `bank_accounts`, `transfers`, and `account_invitations` have an `id` UUID primary key defaulted with `gen_random_uuid()`, independent of display names and mutable business attributes. The `account_holders` PK `(user_id, account_id)` prevents duplicate membership; the `transfer_postings` PK `(transfer_id, side)` identifies each leg and prevents a second debit or credit. The `transfer_reversals` PK `original_transfer_id` prevents a second reversal of the same original.

**Foreign keys.** All 13 are non-null and non-deferrable, with `ON DELETE NO ACTION` and `ON UPDATE NO ACTION`. A referenced row cannot be deleted or its key changed while dependent rows still reference it; there is no cascade or nulling.

| Foreign key | Why |
|---|---|
| `bank_accounts.bank_id → banks.id` | Every account must identify its bank. |
| `account_holders.user_id → users.id` and `account_holders.account_id → bank_accounts.id` | Both endpoints of an ownership relationship must exist. |
| `transfers.initiated_by → users.id` | Every completed transfer records a real profile in this simulation as its initiator. |
| `transfers.source_account_id → bank_accounts.id` and `transfers.destination_account_id → bank_accounts.id` | Both legs of the recorded movement must retain a valid account reference. |
| `account_invitations.account_id → bank_accounts.id`; `inviter_id` and `invitee_id → users.id` | An invitation must identify a real account and two existing participants. |
| `transfer_postings.transfer_id → transfers.id`; `account_id → bank_accounts.id` | Journal legs must belong to an existing transfer and account; they cannot outlive either. |
| `transfer_reversals.original_transfer_id` and `reversing_transfer_id → transfers.id` | Both the original event and its compensation remain independently traceable. |

**UNIQUE and CHECK constraints.** Checks enforce the stored domain regardless of input validation in the API. They do not verify real-world email, phone, routing, or account details.

| Table | UNIQUE (beyond the primary key) and why | CHECK and why |
|---|---|---|
| `users` | `username`, `email`, and `phone` each unique for unambiguous lookup; multiple NULL phones are allowed. | `username` matches `^[a-z][a-z0-9_]{2,29}$` for canonical usernames. `email` equals its lowercase form and matches `^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$` for a canonical, email-shaped lookup value. `phone` may be NULL or must match `^\+[1-9][0-9]{7,14}$` for a consistent international-style format. `full_name` is 1–80 characters for a bounded display name. |
| `banks` | `routing_number` is globally unique in the simulation; bank names need not be. | `routing_number` is exactly nine ASCII digits for a uniform identifier; text preserves leading zeros. |
| `bank_accounts` | `(bank_id, account_number)` prevents duplicate numbers *within* a bank without imposing global uniqueness. | `account_number` is exactly 12 ASCII digits for a fixed-width synthetic identifier; `account_type` is `checking` or `savings` for the supported product types; `label` is 1–60 characters for a bounded shared display label. Both cent balances are independently bounded from 0 to 900,000,000,000,000 inclusive, excluding negative funding/balances and keeping values below JavaScript's exact-integer limit. |
| `account_holders` | None; the composite PK already prevents duplicate pairs. | None; existence and membership identity come from the FKs and PK. |
| `transfers` | `(initiated_by, idempotency_key)` permits only one completed transfer per initiator/key pair; different initiators can use the same key. | `amount_cents` is 1–100,000,000 inclusive to require a positive, capped movement; `memo` is at most 140 characters for a bounded note (empty is valid); source and destination differ so a transfer records movement between accounts. |
| `account_invitations` | A partial unique index on `(account_id, invitee_id) WHERE decision IS NULL` reserves one undecided slot; closed rows survive as history. | Inviter differs from invitee to prevent self-invites; expiry follows creation; decision and decision time are either both absent, or both present with `accepted`, `declined`, or `cancelled` at or after creation and before expiry, or `expired` at or after the deadline. These rules rule out impossible lifecycle states. |
| `transfer_postings` | `(transfer_id, account_id)` prevents posting both legs to one account. | Side is `debit` or `credit`; delta magnitude is 1–100,000,000, negative on debit and positive on credit, so it can be summed directly. |
| `transfer_reversals` | `reversing_transfer_id` is unique so one compensation cannot be reused for another original. | Original and compensation must differ; trimmed reason length is 1–140 to require a bounded nonblank explanation. |

**NOT NULL and defaults.** The only nullable columns are `users.phone` and `account_invitations.decision`/`decided_at` (no recorded decision yet). Beyond keys and relationships, `users` requires login identifiers, display name, credential hash, and creation time (the API hashes credentials; there is no SQL hash-format check). `banks` requires routing and display name. Accounts require number, type, label, both balances, active flag, and creation time so identity, funds, availability, and opening context are known. `joined_at` records when ownership was added. Transfers require amount, memo, idempotency key, and creation time to record movement, retry identity, and time. Invitations require creation and expiry for deadline checks; postings require side and delta to account for movement; reversals require a reason for auditability.

`created_at` on users, accounts, and transfers and `joined_at` on holders default to `now()`, PostgreSQL's transaction timestamp. Invitation `created_at` defaults to `clock_timestamp()` (wall clock); the send routine supplies its actual lock-time timestamp and sets expiry 168 hours later. Accounts default both balances to 20,000 cents ($200 simulated funding) and `active` to true. Transfer memo defaults to the empty string rather than NULL.

**Row-level security and grants.** All eight tables enable RLS without forcing it on owners. The original five have `backend_read` (`SELECT TO paylink_api USING (true)`); only `users` has `backend_register` (`INSERT TO paylink_api WITH CHECK (true)`). The backend role has schema `USAGE`, direct `SELECT` on those five tables, and direct `INSERT` on `users` only. The three new tables have no policies and no direct backend table grants. Hosted `anon`, `authenticated`, and `PUBLIC` have no schema usage or domain table grants. The backend has `EXECUTE` on the six write routines below and the two read routines, not on the trigger helpers. All ten routines are `SECURITY DEFINER` with a fixed `pg_catalog, paylink` search path and no PUBLIC execute grant. Customer-level authorization is checked by the API and SQL routines, not by per-customer RLS policies.

**Triggers.** PostgreSQL's internal triggers enforce the FKs. The application adds two initially deferred constraint triggers: `transfers_require_postings` runs after transfer insert or a referenced amount/endpoint update; `postings_match_transfer` runs after posting insert, update, or delete. They require one debit matching the source and negative amount and one credit matching the destination and positive amount for any surviving transfer. Deferral allows inserting a header and both legs in one transaction while rejecting incomplete or mismatched transfers at commit. Balance updates and invitation rules remain in routines.

**Transaction rules.** The backend uses PostgreSQL's default `READ COMMITTED` isolation (no override) with explicit locks held through transaction end. The connection context commits before success is returned and rolls back on failure.

| Routine | Rule and rationale |
|---|---|
| `execute_transfer` | Rejects missing or invalid inputs. Takes a transaction advisory lock derived from actor and key; a retry with the same source, destination, amount, and memo returns the prior row without moving money or adding postings, while changed details are rejected. For a new transfer, checks source ownership, then locks both account rows `FOR UPDATE` in ascending UUID order so opposing transfers acquire the same locks in the same order. Both accounts must exist and be active, and the locked source balance must cover the amount. Balance updates, transfer header, and both postings are atomic. A failed credit or posting check rolls back the whole movement. |
| `open_account` | Locks the actor's user row `FOR NO KEY UPDATE`, checks that the user exists and holds fewer than four accounts, then inserts the funded account and first holder together. This serializes the account limit for that user and prevents partial account creation. Opening is not idempotent: a successful repeat can open another account until the cap is reached. Registration calls it in the same transaction as inserting the profile. |
| `add_account_holder` | Looks up the target by exact username and locks that user `FOR NO KEY UPDATE` before locking the active account `FOR UPDATE`. The actor must already own the account. If the pair already exists, it returns the target without inserting again; otherwise it checks the target's same four-account cap and inserts only the membership. The user lock serializes grants against openings for that target without conflicting with the `KEY SHARE` lock a transfer's initiator FK needs. |
| `send_account_invitation`, `decide_account_invitation` | Lock the invitee `FOR NO KEY UPDATE`, then the account and any existing invitation `FOR UPDATE`. Sending requires an active account owned by the inviter and an invitee who is not an owner. Same-inviter pending sends return the existing invitation; reissuing after expiry marks the prior row expired and creates a new one. Only the inviter may cancel; only the invitee may accept or decline. Repeating a closed invitation's same authorized decision returns it unchanged. Acceptance rechecks expiry, active account, inviter ownership, and the invitee's four-account cap before adding any missing membership. |
| `reverse_transfer` | Takes the actor/key advisory lock, then locks the original transfer `FOR NO KEY UPDATE`. Only a current holder of its destination may reverse it. A matching actor/key/reason retry returns the existing reversal; conflicting or already-used keys, second reversals, and reversal chains are rejected. Calls `execute_transfer` with the same amount and swapped accounts, so normal activity/funds checks apply; compensation, its postings, and the reversal link commit or roll back together. |

The read routines are `list_account_invitations` (inviter/invitee only; computes pending versus expired when no decision is stored) and `transfer_detail` (current holder of either endpoint only). New authenticated endpoints are `GET /api/account-invitations`, `POST /api/accounts/{id}/invitations`, `POST /api/account-invitations/{id}/decision`, `POST /api/transfers/{id}/reversal`, and `GET /api/transfers/{id}/detail`. Existing routes and their response shapes are unchanged.

The four-account cap, the presence of a first holder, source ownership, active status, and balance conservation are workflow rules, not global table assertions: privileged SQL outside these routines is not governed by all of them.

### Item 5: normal form by relation

Each relation is in **1NF** (scalar values with no repeating groups), **2NF** (no partial dependencies of non-prime attributes), and **3NF** (every nontrivial FD has a superkey determinant or a prime dependent attribute). Seven also reach **BCNF** under the intended functional dependencies (FDs): every nontrivial determinant is a superkey. The posting table is a deliberate exception. These are design FDs, not patterns inferred from demo data.

| Relation | Candidate keys and determinants | Highest established normal form and design consideration |
|---|---|---|
| `users` | `id → username, email, phone, full_name, password_hash, created_at`; `username → id`; `email → id`. Candidate keys: `id`, `username`, `email`. A present phone identifies a row, but nullable `phone` is not an unconditional key. | **BCNF**. Profile facts live once, independently of ownership or transfer rows. |
| `banks` | `id → routing_number, name`; `routing_number → id`. Candidate keys: `id`, `routing_number`. | **BCNF**. Name does not determine bank identity, and routing/name are not copied into accounts. |
| `bank_accounts` | `id → bank_id, account_number, account_type, label, balance_cents, opening_balance_cents, active, created_at`; `(bank_id, account_number) → id`. Candidate keys: `id`, `(bank_id, account_number)`. | **BCNF**. Neither part of the composite key alone determines account facts. All owners share one label and balance through the account, not copies in their membership rows. |
| `account_holders` | `(user_id, account_id) → joined_at`. The pair is the only candidate key. | **BCNF**. The timestamp describes the specific membership, not the user or account alone. Separating the many-to-many relationship removes repeating owners and avoids duplicating user/account facts. |
| `transfers` | `id → initiated_by, source_account_id, destination_account_id, amount_cents, memo, idempotency_key, created_at`; `(initiated_by, idempotency_key) → id`. Candidate keys: `id`, `(initiated_by, idempotency_key)`. | **BCNF**. Neither initiator nor key alone identifies the event. The recorded initiator is an event fact, not inferred from the current owners of the source account. |
| `account_invitations` | `id → account_id, inviter_id, invitee_id, created_at, expires_at, decision, decided_at`. An undecided pair is unique only while its row has no decision; the pair is not a candidate key for all history. | **BCNF**. An invitation has its own identity and lifecycle separate from granted membership. Expiry in the read model can be derived without a second stored status. |
| `transfer_postings` | Candidate keys: `(transfer_id, side)`, `(transfer_id, account_id)`, and the implied `(transfer_id, delta_cents)`. The sign constraint implies `delta_cents → side`; `side` belongs to a candidate key. | **3NF, not BCNF**: `delta_cents` is not a superkey. Keeping explicit side gives each leg a stable debit/credit key; signed amounts simplify reconciliation. The checks and deferred triggers prevent these representations from disagreeing. |
| `transfer_reversals` | `original_transfer_id → reversing_transfer_id, reason`; `reversing_transfer_id → original_transfer_id, reason`. Both IDs are candidate keys. | **BCNF**. The compensation link has a reason of its own and does not duplicate transfer attributes. |

**Deliberate redundancy and historical facts.** `bank_accounts.balance_cents` caches opening funding plus signed postings, so every sufficiency check need not sum history. `opening_balance_cents` is historical funding, not a second current balance. Transfer headers preserve the existing amount and account IDs for API and history queries; postings repeat those facts in per-account form, and deferred triggers enforce agreement. This cross-table redundancy alone does not invalidate BCNF. Transfers do not snapshot account labels, names, or balances; display labels and names use current related rows.

**Verification.** Ran [`scripts/migrate.py`](../scripts/migrate.py) on a fresh PostgreSQL 16 database and a populated five-table copy. The upgrade backfilled two legs per transfer and preserved fingerprints of all five original tables; a deliberately inconsistent copy aborted with no persisted backfill. The hosted additive migrations backfilled the existing transfers and were recorded in the Supabase ledger. Read-only checks matched local and hosted columns, constraints, indexes, triggers, routines, RLS and grants, and found zero hosted balance drift. Local rollback-only probes and integration tests covered key/domain violations, invitation eligibility and expiry, competing account allocation, retries, posting completeness, reversals, and rollback. The local Chromium test verified the existing UI flows. On the hosted site, a fresh synthetic profile signed in and sent one cent to another synthetic profile; the new detail endpoint and a read-only database query confirmed two balanced postings, and the invitation list endpoint responded. No intentional constraint violations were run against hosted data.

## From an unnormalized ownership record to BCNF

Start with a hypothetical ownership record containing user attributes, account attributes, bank attributes, and a repeating collection of owners. Repeating owners violate 1NF. Flattening the collection creates the 1NF relation:

`OwnershipWide(U, username, email, full_name, A, account_number, account_type, balance, B, routing_number, bank_name, joined_at)`

Its key is `(U,A)`. User details depend only on U and account details only on A. This creates partial dependencies and update anomalies: changing a name requires changing many rows; deleting the last ownership row can erase bank facts; a bank cannot be inserted independently.

**2NF:** Extract Users using U and AccountFacts using A; keep AccountHolders(U,A,joined_at). Each non-key holder attribute now depends on the whole key. AccountFacts still contains the transitive dependency `A → B → routing_number, bank_name`.

**3NF:** Extract Banks(B,routing_number,name) and retain only B as an FK on Accounts. User/bank/account descriptions are not copied into Transfers. Each non-key attribute now depends on a key without an intervening non-key determinant inside the relation.

**BCNF:** In the ownership decomposition, every nontrivial determinant is a superkey. The original five relations and two of the additions satisfy BCNF; the signed posting exception is described above. We do not claim 4NF or 5NF without a separate multivalued/join-dependency analysis.

### Lossless decomposition

For each binary split, the intersection determines one side:

1. Split Users from OwnershipWide: the shared attribute U determines the entire Users relation.
2. Split AccountFacts from the remainder: the shared A determines AccountFacts, leaving `(U,A,joined_at)`.
3. Split Banks from AccountFacts: shared B determines the Banks relation.

Each split therefore meets the FD-based binary lossless-join criterion. Their composition is lossless for the ownership relation under its stated dependencies. Transfers, invitations, postings, and reversals are separate event facts, not products of the ownership join. Blindly joining with membership or postings can multiply transfer rows.

### Dependency preservation

The user, bank, account, and ownership determinants remain inside their corresponding relations. Transfer identity and idempotency dependencies remain inside Transfers. PK/UNIQUE constraints enforce those FDs without joining tables. FKs enforce referential integrity but are inclusion dependencies, not a replacement for FD-based normalization.

“Source belongs to initiator,” “sufficient balance,” “both accounts active,” and “money is conserved” span rows/relations. They are **business invariants**, not ordinary FDs or consequences of BCNF. The controlled transfer transaction enforces them. Minimum one holder per account is enforced by the supported creation workflow, not a general SQL assertion.

## Transaction design

`execute_transfer(actor, source, destination, amount, memo, key)`:

1. Validate required fields and amount/domain restrictions.
2. Acquire a transaction advisory lock for the actor/key pair. Hash collisions can cause harmless extra serialization, not duplicate transfers.
3. Find an existing transfer. Return it if every input matches; reject reuse with different details. The unique constraint is an additional database safeguard.
4. Verify source ownership from AccountHolders. Existing owners may add an equal joint owner through the controlled add_account_holder function. Revocation is not implemented; any future revocation workflow must coordinate with transfer authorization.
5. Lock both account rows in ascending UUID order with `FOR UPDATE`.
6. Check that both exist, are active, and source balance covers the amount.
7. Debit, credit, and insert the transfer and its two postings in one transaction. Return the existing transfer shape.

READ COMMITTED with explicit account locks serializes conflicting balance updates. A waiting transaction sees the updated balance before its check. A consistent order prevents the classic A→B / B→A deadlock. The service must return success only after the database connection context commits. Unrelated account pairs can proceed independently; same-key retries serialize even if payload account pairs differ. There is no claim of serializability for arbitrary future workflows.

The actor UUID comes from a verified backend session, **not** an untrusted browser field. The backend role remains a trusted identity boundary: possession of its DB credentials permits impersonating actors via the routines, which is why they must never reach the frontend.

## Balance reconciliation and recovery

For account a:

`current_balance(a) = opening_balance(a) + Σ posting.delta_cents for account a`.

The materialized balance speeds sufficiency checks. It is a cross-relation aggregate redundancy, not an additional FD that invalidates BCNF. The transaction keeps the aggregate consistent; the reconciliation query independently detects divergence. Opening balances record initial simulated funding. New accounts create an explicit simulated allocation; only transfers between existing accounts conserve the total. No physical cash or regulatory balance is implied.

PostgreSQL's normal WAL/commit machinery provides durability and recovery. Tests demonstrate rollback, **not** power-failure recovery, backup restoration, or Supabase point-in-time recovery. Postings are append-only for the application, not tamper-proof against privileged administrators. The paired journal covers inter-account movements; opening allocations remain separate from this journal.

## Physical design and query processing

PKs and UNIQUE constraints create B-tree indexes. The additional indexes have specific jobs:

| Index | Intended access path |
|---|---|
| `account_holders_account_idx` | Reverse membership lookup by account rather than by user. |
| `transfers_source_time_idx`, `transfers_destination_time_idx` | Source/destination history by account, newest first, with descending UUID as a deterministic tie-breaker. |
| `transfers_created_time_idx` | BRIN on transfer time for timestamp ranges; does not supply history ordering. |
| `account_invitations_open_idx` | Partial unique index for the undecided slot and lookup during send/reissue. |
| `account_invitations_inviter_idx`, `account_invitations_invitee_idx` | Look up the signed-in user's outbox and inbox. |
| `transfer_postings_account_idx` | Account-first journal lookup and account-scoped reconciliation. |

The reversal PK and alternate unique index support lookup in either direction. The posting PK supports per-transfer detail. All new indexes were built on new tables in the additive migrations; there was no new index on an already populated existing table.

`queries.sql` demonstrates joins, GROUP BY/HAVING, CTEs, UNION ALL, reconciliation, a windowed running balance, storage inspection, and EXPLAIN(ANALYZE,BUFFERS). The measured 20,000-row microbenchmark is in `artifacts/query-evidence.txt`. Its synthetic rows and index drop are rolled back. It isolates the outgoing-history query; it does not prove that the entire UI history query or hosted workload has the same plan or speed.

## Joint ownership and calendar semantics

The Accounts screen continues to grant immediate joint access by exact username. The new invitation endpoints are a separate API workflow; the existing screen does not use them. Both paths grant equal read/spending access without changing funds; ownership removal is not implemented. User-before-account locking serializes ownership and opening for the same target, and the weaker user lock remains compatible with the transfer initiator FK's `KEY SHARE`.

Monthly and seven-day insights use America/Chicago calendar boundaries. Timestamps remain timestamptz instants and the browser formats them locally. Internal transfers are excluded from monthly money in/out and included on both sides of the weekly volume chart. History and CSV are limited to the latest 200 rows; account totals count each account once per signed-in user.

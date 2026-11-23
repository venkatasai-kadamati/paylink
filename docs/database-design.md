# PayLink database design

## Scope and assumptions

PayLink is a **USD-only simulation**. There are no real bank links, payment networks, withdrawals, fees, currency conversion, password recovery, or real account numbers. An account number is unique only within its bank. A bank routing number is globally unique in this model. A label is a property of the shared account, not a separate nickname per owner. All joint owners have equal spending permission. A transfer has exactly one source, one destination, and one initiating user. Only completed transfers are stored; a rejected transfer rolls back and is not represented as a completed or pending row.

New profiles automatically receive a $200 checking account; the profile, account, and holder commit or roll back together. Additional accounts also open with $200, while existing balances are preserved.

The application schema has exactly five base relations, matching the proposal. It runs on hosted Supabase PostgreSQL 17.11 in primary-org/paylink; independent Mac integration tests use isolated Homebrew PostgreSQL 16.15. `paylink_meta.migrations` records deployment versions and is not a sixth domain entity. `paylink` is private: it must not be added to the exposed Supabase Data API schemas.

## Editable conceptual and logical model

Open `er-diagram.drawio` in diagrams.net using **File → Open From → Device**. Entities, attributes, labels, and connectors are native editable objects. Save the XML file to preserve editability; exporting a PNG alone loses it. `er-diagram.mmd` is the editable Mermaid alternative, and `.dot` is Graphviz source. `.svg` and `.png` are rendered reference copies.

| Relationship | Cardinality | Implementation and participation |
|---|---|---|
| Bank → BankAccount | 1 : 0..N | Each account has exactly one non-null bank FK. A bank can have no accounts. |
| User ↔ BankAccount | M : N | `account_holders(user_id, account_id)`, with a composite PK and two FKs. A user may initially own zero accounts. |
| BankAccount → AccountHolder | 1 : 1..N intended | The account-opening function inserts account and first holder atomically. SQL FKs alone do **not** enforce an account having at least one holder; administrative SQL can violate that minimum. |
| User → Transfer | 1 : 0..N | One non-null `initiated_by` FK per transfer; not a duplicate of account ownership. |
| BankAccount → Transfer (source) | 1 : 0..N | One non-null source FK. |
| BankAccount → Transfer (destination) | 1 : 0..N | One non-null destination FK; source must differ. |

No redundant direct `user_id` is stored on `bank_accounts`. A joint account therefore remains one account with one balance. Summing after an owner join can multiply its balance; account-scoped queries deduplicate by account ID.

## Data dictionary

| Relation | Keys | Non-key attributes and domains |
|---|---|---|
| `users` | PK `id`; alternate keys `username`, `email` | UUID id; lowercase username `[a-z][a-z0-9_]{2,29}`; lowercase unique email; nullable unique E.164-style phone; full_name 1–80 chars; Argon2id password_hash; created_at timestamptz. |
| `banks` | PK `id`; alternate key `routing_number` | Nine-digit routing string; name text. A name is not assumed unique. |
| `bank_accounts` | PK `id`; alternate key `(bank_id, account_number)` | Non-null bank FK; 12-digit synthetic account number; checking/savings type; shared label 1–60 chars; bigint balance and opening balance in cents, both 0–900,000,000,000,000; active boolean; created_at. |
| `account_holders` | PK `(user_id, account_id)`; both FKs | joined_at depends on the complete ownership pair. No redundant user name, bank name, or balance. |
| `transfers` | PK `id`; alternate key `(initiated_by, idempotency_key)` | Three non-null FKs; integer amount 1–100,000,000 cents; memo ≤140 chars; UUID idempotency key; timestamptz. Source and destination differ. |

Phone is optional. PostgreSQL's normal UNIQUE semantics permit multiple NULLs, so **phone is not an unconditional candidate key**. For present phone values, uniqueness permits exact lookup. This distinction avoids treating SQL NULL as an ordinary value in the normalization proof. The syntax checks for email/phone establish format, not real-world verification.

Amounts use integer cents to exclude floating-point rounding. The maximum balance is below JavaScript's exact-integer limit. All accounts are USD, so no account currency or exchange-rate FD is introduced. Money is formatted only at the presentation boundary.

## Professor feedback: constraints and normalization

From the [professor feedback notes](../documentation/requirements/advanced%20database/feedback%20from%20professor/feedback.md), verbatim:

> 3. contraints applied

> 5. what level of normailziation is done and what speciic considerations are done

### Item 3: constraints and why they exist

**Primary keys.** `users`, `banks`, `bank_accounts`, and `transfers` each have an `id` UUID primary key, defaulted with `gen_random_uuid()`. These are stable identities independent of business identifiers or display names. The `account_holders` primary key is `(user_id, account_id)`: it prevents duplicate membership while allowing several users per account and several accounts per user.

**Foreign keys.** All six are non-null and non-deferrable, with the default `ON DELETE NO ACTION` and `ON UPDATE NO ACTION`. A referenced row cannot be deleted, or its referenced key changed, while dependent rows still reference it; there is no cascade or nulling. This prevents orphaned accounts, ownership rows, and transfer history.

| Foreign key | Why |
|---|---|
| `bank_accounts.bank_id → banks.id` | Every account must identify its bank. |
| `account_holders.user_id → users.id` and `account_holders.account_id → bank_accounts.id` | Both endpoints of an ownership relationship must exist. |
| `transfers.initiated_by → users.id` | Every completed transfer records a real profile in this simulation as its initiator. |
| `transfers.source_account_id → bank_accounts.id` and `transfers.destination_account_id → bank_accounts.id` | Both legs of the recorded movement must retain a valid account reference. |

**UNIQUE and CHECK constraints.** Checks enforce the stored domain regardless of input validation in the API. They do not verify real-world email, phone, routing, or account details.

| Table | UNIQUE (beyond the primary key) and why | CHECK and why |
|---|---|---|
| `users` | `username`, `email`, and `phone` each unique for unambiguous lookup; multiple NULL phones are allowed. | `username` matches `^[a-z][a-z0-9_]{2,29}$` for canonical usernames. `email` equals its lowercase form and matches `^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$` for a canonical, email-shaped lookup value. `phone` may be NULL or must match `^\+[1-9][0-9]{7,14}$` for a consistent international-style format. `full_name` is 1–80 characters for a bounded display name. |
| `banks` | `routing_number` is globally unique in the simulation; bank names need not be. | `routing_number` is exactly nine ASCII digits for a uniform identifier; text preserves leading zeros. |
| `bank_accounts` | `(bank_id, account_number)` prevents duplicate numbers *within* a bank without imposing global uniqueness. | `account_number` is exactly 12 ASCII digits for a fixed-width synthetic identifier; `account_type` is `checking` or `savings` for the supported product types; `label` is 1–60 characters for a bounded shared display label. Both cent balances are independently bounded from 0 to 900,000,000,000,000 inclusive, excluding negative funding/balances and keeping values below JavaScript's exact-integer limit. |
| `account_holders` | None; the composite PK already prevents duplicate pairs. | None; existence and membership identity come from the FKs and PK. |
| `transfers` | `(initiated_by, idempotency_key)` permits only one completed transfer per initiator/key pair; different initiators can use the same key. | `amount_cents` is 1–100,000,000 inclusive to require a positive, capped movement; `memo` is at most 140 characters for a bounded note (empty is valid); source and destination differ so a transfer records movement between accounts. |

**NOT NULL and defaults.** Every column except `users.phone` is non-null. Beyond keys and relationships, `users` requires the login identifiers, display name, credential hash, and creation time (the API hashes credentials; there is no SQL hash-format check). `banks` requires a routing number and display name. `bank_accounts` requires a number, type, label, both balances, active flag, and creation time, so account identity, simulated funds, availability, and opening context are always known. `account_holders.joined_at` records when access was added. `transfers` requires an amount, memo, idempotency key, and creation time as well as the participants, so every completed event has its movement, retry identity, and time recorded.

`created_at` on users, accounts, and transfers and `joined_at` on holders default to `now()`, PostgreSQL's transaction timestamp. Accounts default both cent balances to 20,000 ($200 of simulated funding) and `active` to true. `transfers.memo` defaults to the empty string rather than NULL. Apart from those defaults and generated IDs, callers supply the required values.

**Row-level security and grants.** All five tables enable RLS, but do not force it on table owners. Each has a permissive `backend_read` policy (`SELECT TO paylink_api USING (true)`), and only `users` has `backend_register` (`INSERT TO paylink_api WITH CHECK (true)`). The backend role has schema `USAGE`, `SELECT` on all five tables, `INSERT` on `users` only, and `EXECUTE` on the three routines below. It cannot directly update or delete domain rows or insert accounts, holders, or transfers. These policies isolate the service role, not individual customers: application queries and the routines enforce customer access. Hosted `anon` and `authenticated`, like `PUBLIC`, have no schema usage or domain table grants. The routines are `SECURITY DEFINER` with a fixed `pg_catalog, paylink` search path and no `PUBLIC` execute grant, so the backend can perform controlled writes without direct write privileges.

**Triggers.** There are no application-defined triggers; PostgreSQL's internal referential-integrity triggers enforce the foreign keys. Balance updates and ownership rules are implemented in routines, not triggers.

**Transaction rules.** The backend uses PostgreSQL's default `READ COMMITTED` isolation (no override) with explicit locks held through transaction end. The connection context commits before success is returned and rolls back on failure.

| Routine | Rule and rationale |
|---|---|
| `execute_transfer` | Rejects missing or invalid inputs. First takes a transaction advisory lock derived from actor and key; a retry with the same source, destination, amount, and memo returns the prior row without moving money, while changed details are rejected. For a new transfer, checks source ownership, then locks both account rows `FOR UPDATE` in ascending UUID order so opposing transfers acquire the same locks in the same order. Both accounts must exist and be active; the locked source balance must cover the amount. Debit, credit, and the completed transfer insert are atomic. If a later check fails (e.g., the destination balance would exceed its cap), the debit rolls back too. |
| `open_account` | Locks the actor's user row `FOR NO KEY UPDATE`, checks that the user exists and holds fewer than four accounts, then inserts the funded account and first holder together. This serializes the account limit for that user and prevents partial account creation. Opening is not idempotent: a successful repeat can open another account until the cap is reached. Registration calls it in the same transaction as inserting the profile. |
| `add_account_holder` | Looks up the target by exact username and locks that user `FOR NO KEY UPDATE` before locking the active account `FOR UPDATE`. The actor must already own the account. If the pair already exists, it returns the target without inserting again; otherwise it checks the target's same four-account cap and inserts only the membership. The user lock serializes grants against openings for that target without conflicting with the `KEY SHARE` lock a transfer's initiator FK needs. |

The four-account cap, the presence of a first holder, source ownership, active status, and balance conservation are workflow rules, not global table assertions: privileged SQL outside these routines is not governed by all of them.

### Item 5: normal form by relation

Each relation is in **1NF** (scalar values and no repeating groups), **2NF** (no non-key attribute depends on only part of a candidate key), and **3NF** (no transitive dependence of a non-key attribute on a key through a non-key determinant). Each also reaches **BCNF** under the intended functional dependencies (FDs) below: every nontrivial determinant within a relation is a superkey. The analysis is about the design, not apparent dependencies in demo data.

| Relation | Candidate keys and determinants | Highest established normal form and design consideration |
|---|---|---|
| `users` | `id → username, email, phone, full_name, password_hash, created_at`; `username → id`; `email → id`. Candidate keys: `id`, `username`, `email`. A present phone identifies a row, but nullable `phone` is not an unconditional key. | **BCNF**. Profile facts live once, independently of ownership or transfer rows. |
| `banks` | `id → routing_number, name`; `routing_number → id`. Candidate keys: `id`, `routing_number`. | **BCNF**. Name does not determine bank identity, and routing/name are not copied into accounts. |
| `bank_accounts` | `id → bank_id, account_number, account_type, label, balance_cents, opening_balance_cents, active, created_at`; `(bank_id, account_number) → id`. Candidate keys: `id`, `(bank_id, account_number)`. | **BCNF**. Neither part of the composite key alone determines account facts. All owners share one label and balance through the account, not copies in their membership rows. |
| `account_holders` | `(user_id, account_id) → joined_at`. The pair is the only candidate key. | **BCNF**. The timestamp describes the specific membership, not the user or account alone. Separating the many-to-many relationship removes repeating owners and avoids duplicating user/account facts. |
| `transfers` | `id → initiated_by, source_account_id, destination_account_id, amount_cents, memo, idempotency_key, created_at`; `(initiated_by, idempotency_key) → id`. Candidate keys: `id`, `(initiated_by, idempotency_key)`. | **BCNF**. Neither initiator nor key alone identifies the event. The recorded initiator is an event fact, not inferred from the current owners of the source account. |

**Deliberate redundancy and historical facts.** `bank_accounts.balance_cents` is a materialized value derived from opening funds and completed transfers (see [Balance reconciliation and recovery](#balance-reconciliation-and-recovery)). Keeping it avoids summing history for every sufficiency check; atomic transfer writes maintain it. This is cross-table redundancy, not an extra intra-table FD that violates BCNF. `opening_balance_cents` is the historical starting amount, not another copy of the current balance; the same default on both columns does not make one determine the other. Transfers record event facts (amount, memo, initiator, time), but do not snapshot account labels, bank names, holder names, or balances. Display labels and names in transfer history are resolved from current related rows.

**Verification.** Applied all checked-in migrations and backend role provisioning with [`scripts/migrate.py`](../scripts/migrate.py) to a local PostgreSQL instance. Compared columns/defaults, constraints, RLS flags and policies, grants, triggers, and function definitions with hosted Supabase in a read-only transaction; those checks matched. On the local instance, rollback-isolated probes exercised every PK, UNIQUE, CHECK, FK, and NOT NULL rule, including rejected parent deletes and accepted NULL phones. The backend integration tests exercised overdraft rejection, identical and conflicting retries, concurrent spending and opposite-direction transfers, joint ownership, and rollback. No negative writes were attempted against hosted Supabase.

## From an unnormalized ownership record to BCNF

Start with a hypothetical ownership record containing user attributes, account attributes, bank attributes, and a repeating collection of owners. Repeating owners violate 1NF. Flattening the collection creates the 1NF relation:

`OwnershipWide(U, username, email, full_name, A, account_number, account_type, balance, B, routing_number, bank_name, joined_at)`

Its key is `(U,A)`. User details depend only on U and account details only on A. This creates partial dependencies and update anomalies: changing a name requires changing many rows; deleting the last ownership row can erase bank facts; a bank cannot be inserted independently.

**2NF:** Extract Users using U and AccountFacts using A; keep AccountHolders(U,A,joined_at). Each non-key holder attribute now depends on the whole key. AccountFacts still contains the transitive dependency `A → B → routing_number, bank_name`.

**3NF:** Extract Banks(B,routing_number,name) and retain only B as an FK on Accounts. User/bank/account descriptions are not copied into Transfers. Each non-key attribute now depends on a key without an intervening non-key determinant inside the relation.

**BCNF:** Under the declared FD set, every nontrivial determinant in each final relation is a superkey. The alternate keys are explicit UNIQUE constraints. Thus all five relations satisfy BCNF (and therefore 3NF), under these assumptions. We do not claim 4NF or 5NF without a separate multivalued/join-dependency analysis.

### Lossless decomposition

For each binary split, the intersection determines one side:

1. Split Users from OwnershipWide: the shared attribute U determines the entire Users relation.
2. Split AccountFacts from the remainder: the shared A determines AccountFacts, leaving `(U,A,joined_at)`.
3. Split Banks from AccountFacts: shared B determines the Banks relation.

Each split therefore meets the FD-based binary lossless-join criterion. Their composition is lossless for the ownership relation, subject to its stated dependencies. Transfers represents a **separate event fact**; it is not obtained by naturally joining every ownership row. Blindly joining all five tables can multiply events for joint owners and is not a valid universal-relation proof.

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
7. Debit, credit, and insert the transfer in one transaction. Return the completed row.

READ COMMITTED with explicit account locks serializes conflicting balance updates. A waiting transaction sees the updated balance before its check. A consistent order prevents the classic A→B / B→A deadlock. The service must return success only after the database connection context commits. Unrelated account pairs can proceed independently; same-key retries serialize even if payload account pairs differ. There is no claim of serializability for arbitrary future workflows.

The private backend role cannot directly UPDATE balances, DELETE history, or INSERT transfers. It can read application relations, register users, and invoke the controlled opening, ownership, and transfer functions. The functions are SECURITY DEFINER, have fixed `pg_catalog,paylink` search paths, and are not executable by PUBLIC. The actor UUID comes from a verified backend session, **not** an untrusted browser field. The backend role remains a trusted identity boundary: possession of its DB credentials permits impersonating actors via the function, which is why they must never reach the frontend.

## Balance reconciliation and recovery

For account a:

`current_balance(a) = opening_balance(a) + Σ incoming(a) − Σ outgoing(a)`.

The materialized balance speeds sufficiency checks. It is a cross-relation aggregate redundancy, not an additional FD that invalidates BCNF. The transaction keeps the aggregate consistent; the reconciliation query independently detects divergence. Opening balances record initial simulated funding. New accounts create an explicit simulated allocation; only transfers between existing accounts conserve the total. No physical cash or regulatory balance is implied.

PostgreSQL's normal WAL/commit machinery provides durability and recovery; the application does not implement its own recovery log. Tests demonstrate transaction rollback, **not** power-failure recovery, backup restoration, or Supabase point-in-time recovery. Those remain future validation tasks. Privileged administrators can modify data; this is not an immutable double-entry ledger.

## Physical design and query processing

UUID PKs and UNIQUE constraints create B-tree indexes. Additional indexes cover reverse ownership lookup and source/destination histories ordered by `(account_id, created_at DESC, id DESC)`. The descending UUID tie-breaker makes equal timestamps deterministic. Indexing is selective: there is no extra index for every small text column.

`queries.sql` demonstrates joins, GROUP BY/HAVING, CTEs, UNION ALL, reconciliation, a windowed running balance, storage inspection, and EXPLAIN(ANALYZE,BUFFERS). The measured 20,000-row microbenchmark is in `artifacts/query-evidence.txt`. Its synthetic rows and index drop are rolled back. It isolates the outgoing-history query; it does not prove that the entire UI history query or hosted workload has the same plan or speed.

## Joint ownership and calendar semantics

The Accounts screen lets an existing owner add a registered user by exact username. This simulation grants immediate equal read/spending access; it does not implement invitation acceptance or removal. The function locks the target user row before the account row, checks active status and the acting user's ownership, returns an existing ownership pair on retry, checks the target's four-account limit, and inserts only the ownership row. No balance or opening balance changes. The user-before-account order matches account opening and serializes competing allocation requests for the same target. Transfers lock account rows in UUID order; insertion also takes an implicit FK KEY SHARE lock on the initiating user. Allocation functions use FOR NO KEY UPDATE on the target user so this FK check remains compatible. Using FOR UPDATE there could introduce a user/account lock cycle; a regression test holds a joint-owner grant open while an unrelated transfer by that target completes.

Monthly and seven-day insights use America/Chicago calendar boundaries. Timestamps remain timestamptz instants and the browser formats them locally. Internal transfers are excluded from monthly money in/out and included on both sides of the weekly volume chart. History and CSV are limited to the latest 200 rows; account totals count each account once per signed-in user.

-- Summarize append-ordered ledger pages for monthly insights time ranges.
-- BRIN cannot supply HISTORY_SQL's ORDER BY, unlike the rejected btree.
-- Three-run candidate evidence: artifacts/query-evidence.txt.
CREATE INDEX transfers_created_time_idx ON paylink.transfers USING brin(created_at)
WITH (pages_per_range=128);

-- Insights filter by a global time range, not an account equality prefix.
-- Local 2M-row EXPLAIN evidence: artifacts/query-evidence.txt.
CREATE INDEX transfers_created_time_idx ON paylink.transfers(created_at DESC, id DESC);

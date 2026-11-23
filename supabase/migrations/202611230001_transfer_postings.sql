SET LOCAL lock_timeout = '5s';
LOCK TABLE paylink.bank_accounts, paylink.transfers IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE paylink.transfer_postings (
 transfer_id uuid NOT NULL REFERENCES paylink.transfers(id),
 side text NOT NULL CHECK (side IN ('debit','credit')),
 account_id uuid NOT NULL REFERENCES paylink.bank_accounts(id),
 delta_cents bigint NOT NULL,
 PRIMARY KEY (transfer_id, side),
 UNIQUE (transfer_id, account_id),
 CHECK ((side='debit' AND delta_cents BETWEEN -100000000 AND -1)
     OR (side='credit' AND delta_cents BETWEEN 1 AND 100000000))
);
ALTER TABLE paylink.transfer_postings ENABLE ROW LEVEL SECURITY;

INSERT INTO paylink.transfer_postings(transfer_id,side,account_id,delta_cents)
SELECT t.id,p.side,p.account_id,p.delta_cents
FROM paylink.transfers t
CROSS JOIN LATERAL (VALUES ('debit',t.source_account_id,-t.amount_cents),
                           ('credit',t.destination_account_id,t.amount_cents)) p(side,account_id,delta_cents);

DO $$
BEGIN
 IF EXISTS (
  SELECT FROM paylink.bank_accounts a
  LEFT JOIN (SELECT account_id,sum(delta_cents) AS net FROM paylink.transfer_postings GROUP BY account_id) p
  ON p.account_id=a.id
  WHERE a.balance_cents<>a.opening_balance_cents+coalesce(p.net,0)
 ) THEN
  RAISE EXCEPTION 'Posting backfill reconciliation failed; balances were not changed';
 END IF;
END $$;

CREATE INDEX transfer_postings_account_idx ON paylink.transfer_postings(account_id,transfer_id);

CREATE FUNCTION paylink.assert_transfer_postings(p_transfer uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,paylink AS $$
BEGIN
 IF EXISTS (
  SELECT FROM paylink.transfers t WHERE t.id=p_transfer AND (
   NOT EXISTS (SELECT FROM paylink.transfer_postings p WHERE p.transfer_id=t.id AND p.side='debit'
               AND p.account_id=t.source_account_id AND p.delta_cents=-t.amount_cents)
   OR NOT EXISTS (SELECT FROM paylink.transfer_postings p WHERE p.transfer_id=t.id AND p.side='credit'
                  AND p.account_id=t.destination_account_id AND p.delta_cents=t.amount_cents)
  )
 ) THEN
  RAISE EXCEPTION 'Transfer requires two matching postings' USING ERRCODE='23514';
 END IF;
END $$;
REVOKE ALL ON FUNCTION paylink.assert_transfer_postings(uuid) FROM PUBLIC;

CREATE FUNCTION paylink.check_transfer_postings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,paylink AS $$
BEGIN
 IF TG_TABLE_NAME='transfers' THEN
  PERFORM paylink.assert_transfer_postings(NEW.id);
 ELSE
  IF TG_OP IN ('INSERT','UPDATE') THEN
   PERFORM paylink.assert_transfer_postings(NEW.transfer_id);
  END IF;
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.transfer_id<>NEW.transfer_id) THEN
   PERFORM paylink.assert_transfer_postings(OLD.transfer_id);
  END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION paylink.check_transfer_postings() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER transfers_require_postings
AFTER INSERT OR UPDATE OF source_account_id,destination_account_id,amount_cents ON paylink.transfers
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION paylink.check_transfer_postings();
CREATE CONSTRAINT TRIGGER postings_match_transfer
AFTER INSERT OR UPDATE OR DELETE ON paylink.transfer_postings
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION paylink.check_transfer_postings();

CREATE OR REPLACE FUNCTION paylink.execute_transfer(
 p_actor uuid, p_source uuid, p_destination uuid, p_amount bigint,
 p_memo text, p_key uuid
) RETURNS paylink.transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,paylink AS $$
DECLARE prior paylink.transfers; result paylink.transfers;
DECLARE source_balance bigint; account_count integer;
BEGIN
 IF p_actor IS NULL OR p_key IS NULL OR p_amount IS NULL OR p_source IS NULL OR p_destination IS NULL OR p_memo IS NULL THEN
  RAISE EXCEPTION 'Required transfer field missing' USING ERRCODE='P0001';
 END IF;
 IF p_amount < 1 OR p_amount > 100000000 OR p_source = p_destination OR length(p_memo) > 140 THEN
  RAISE EXCEPTION 'Invalid transfer details' USING ERRCODE='P0001';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_key::text, 0));
 SELECT * INTO prior FROM paylink.transfers WHERE initiated_by=p_actor AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.source_account_id <> p_source OR prior.destination_account_id <> p_destination
     OR prior.amount_cents <> p_amount OR prior.memo <> p_memo THEN
   RAISE EXCEPTION 'Idempotency key already used for different details' USING ERRCODE='P0001';
  END IF;
  RETURN prior;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM paylink.account_holders WHERE user_id=p_actor AND account_id=p_source) THEN
  RAISE EXCEPTION 'You do not own the source account' USING ERRCODE='P0001';
 END IF;
 PERFORM id FROM paylink.bank_accounts WHERE id IN (p_source,p_destination) ORDER BY id FOR UPDATE;
 SELECT count(*) INTO account_count FROM paylink.bank_accounts WHERE id IN(p_source,p_destination) AND active;
 IF account_count <> 2 THEN RAISE EXCEPTION 'Both accounts must exist and be active' USING ERRCODE='P0001'; END IF;
 SELECT balance_cents INTO source_balance FROM paylink.bank_accounts WHERE id=p_source;
 IF source_balance < p_amount THEN RAISE EXCEPTION 'Insufficient funds' USING ERRCODE='P0001'; END IF;
 UPDATE paylink.bank_accounts SET balance_cents=balance_cents-p_amount WHERE id=p_source;
 UPDATE paylink.bank_accounts SET balance_cents=balance_cents+p_amount WHERE id=p_destination;
 INSERT INTO paylink.transfers(initiated_by,source_account_id,destination_account_id,amount_cents,memo,idempotency_key)
 VALUES(p_actor,p_source,p_destination,p_amount,p_memo,p_key) RETURNING * INTO result;
 INSERT INTO paylink.transfer_postings(transfer_id,side,account_id,delta_cents)
 VALUES(result.id,'debit',p_source,-p_amount),(result.id,'credit',p_destination,p_amount);
 RETURN result;
END $$;

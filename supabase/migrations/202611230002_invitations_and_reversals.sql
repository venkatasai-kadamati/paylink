CREATE TABLE paylink.account_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES paylink.bank_accounts(id),
 inviter_id uuid NOT NULL REFERENCES paylink.users(id),
 invitee_id uuid NOT NULL REFERENCES paylink.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 decision text,
 decided_at timestamptz,
 CHECK (inviter_id<>invitee_id),
 CHECK (expires_at>created_at),
 CHECK ((decision IS NULL AND decided_at IS NULL) OR
        (decision IS NOT NULL AND decided_at IS NOT NULL AND
         ((decision IN ('accepted','declined','cancelled') AND decided_at>=created_at AND decided_at<expires_at)
          OR (decision='expired' AND decided_at>=expires_at))))
);
CREATE UNIQUE INDEX account_invitations_open_idx
 ON paylink.account_invitations(account_id,invitee_id) WHERE decision IS NULL;
CREATE INDEX account_invitations_invitee_idx ON paylink.account_invitations(invitee_id);
CREATE INDEX account_invitations_inviter_idx ON paylink.account_invitations(inviter_id);
ALTER TABLE paylink.account_invitations ENABLE ROW LEVEL SECURITY;

CREATE TABLE paylink.transfer_reversals (
 original_transfer_id uuid PRIMARY KEY REFERENCES paylink.transfers(id),
 reversing_transfer_id uuid NOT NULL UNIQUE REFERENCES paylink.transfers(id),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 140),
 CHECK (original_transfer_id<>reversing_transfer_id)
);
ALTER TABLE paylink.transfer_reversals ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION paylink.send_account_invitation(p_actor uuid,p_account uuid,p_username text)
RETURNS paylink.account_invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,paylink AS $$
DECLARE target uuid; invitation paylink.account_invitations; stamp timestamptz;
BEGIN
 SELECT id INTO target FROM paylink.users WHERE username=p_username FOR NO KEY UPDATE;
 IF NOT FOUND OR target=p_actor THEN RAISE EXCEPTION 'Invalid invitee'; END IF;
 PERFORM id FROM paylink.bank_accounts WHERE id=p_account AND active FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS (SELECT FROM paylink.account_holders WHERE user_id=p_actor AND account_id=p_account) THEN
  RAISE EXCEPTION 'You do not own an active account with that ID';
 END IF;
 IF EXISTS (SELECT FROM paylink.account_holders WHERE user_id=target AND account_id=p_account) THEN
  RAISE EXCEPTION 'Invitee already holds this account';
 END IF;
 SELECT * INTO invitation FROM paylink.account_invitations
 WHERE account_id=p_account AND invitee_id=target AND decision IS NULL FOR UPDATE;
 stamp := clock_timestamp();
 IF FOUND THEN
  IF invitation.expires_at>stamp THEN
   IF invitation.inviter_id=p_actor THEN RETURN invitation; END IF;
   RAISE EXCEPTION 'An invitation is already pending';
  END IF;
  UPDATE paylink.account_invitations SET decision='expired',decided_at=stamp WHERE id=invitation.id;
 END IF;
 INSERT INTO paylink.account_invitations(account_id,inviter_id,invitee_id,created_at,expires_at)
 VALUES(p_account,p_actor,target,stamp,stamp+interval '168 hours') RETURNING * INTO invitation;
 RETURN invitation;
END $$;

CREATE FUNCTION paylink.decide_account_invitation(p_actor uuid,p_invitation uuid,p_decision text)
RETURNS paylink.account_invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,paylink AS $$
DECLARE invitation paylink.account_invitations; stamp timestamptz;
BEGIN
 SELECT * INTO invitation FROM paylink.account_invitations WHERE id=p_invitation;
 IF NOT FOUND OR p_actor IS NULL OR p_decision IS NULL OR p_decision NOT IN ('accepted','declined','cancelled')
 OR (p_decision='cancelled' AND invitation.inviter_id<>p_actor)
 OR (p_decision IN ('accepted','declined') AND invitation.invitee_id<>p_actor) THEN
  RAISE EXCEPTION 'Invitation not available for this decision';
 END IF;
 PERFORM id FROM paylink.users WHERE id=invitation.invitee_id FOR NO KEY UPDATE;
 PERFORM id FROM paylink.bank_accounts WHERE id=invitation.account_id FOR UPDATE;
 SELECT * INTO STRICT invitation FROM paylink.account_invitations WHERE id=p_invitation FOR UPDATE;
 IF invitation.decision=p_decision THEN RETURN invitation; END IF;
 stamp := clock_timestamp();
 IF invitation.decision IS NOT NULL OR invitation.expires_at<=stamp THEN
  RAISE EXCEPTION 'Invitation is closed or expired';
 END IF;
 IF p_decision='accepted' THEN
  IF NOT EXISTS (SELECT FROM paylink.bank_accounts WHERE id=invitation.account_id AND active)
   OR NOT EXISTS (SELECT FROM paylink.account_holders WHERE account_id=invitation.account_id AND user_id=invitation.inviter_id) THEN
   RAISE EXCEPTION 'Inviter no longer holds an active account';
  END IF;
  IF NOT EXISTS (SELECT FROM paylink.account_holders WHERE account_id=invitation.account_id AND user_id=p_actor) THEN
   IF (SELECT count(*) FROM paylink.account_holders WHERE user_id=p_actor)>=4 THEN
    RAISE EXCEPTION 'Simulation limit: four accounts per person';
   END IF;
   INSERT INTO paylink.account_holders(user_id,account_id) VALUES(p_actor,invitation.account_id);
  END IF;
 END IF;
 UPDATE paylink.account_invitations SET decision=p_decision,decided_at=stamp
 WHERE id=p_invitation RETURNING * INTO invitation;
 RETURN invitation;
END $$;

CREATE FUNCTION paylink.list_account_invitations(p_actor uuid)
RETURNS TABLE(id uuid,account_id uuid,inviter_id uuid,invitee_id uuid,
 created_at timestamptz,expires_at timestamptz,decision text,decided_at timestamptz,status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,paylink AS $$
 SELECT i.*,coalesce(i.decision,CASE WHEN i.expires_at<=statement_timestamp() THEN 'expired' ELSE 'pending' END)
 FROM paylink.account_invitations i WHERE i.inviter_id=p_actor OR i.invitee_id=p_actor
 ORDER BY i.created_at DESC,i.id DESC
$$;

CREATE FUNCTION paylink.reverse_transfer(p_actor uuid,p_original uuid,p_reason text,p_key uuid)
RETURNS paylink.transfer_reversals LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,paylink AS $$
DECLARE original paylink.transfers; compensation paylink.transfers; reversal paylink.transfer_reversals;
BEGIN
 IF p_actor IS NULL OR p_key IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 140 THEN
  RAISE EXCEPTION 'Invalid reversal details';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_key::text,0));
 SELECT * INTO original FROM paylink.transfers WHERE id=p_original FOR NO KEY UPDATE;
 IF NOT FOUND OR NOT EXISTS (
  SELECT FROM paylink.account_holders WHERE user_id=p_actor AND account_id=original.destination_account_id
 ) THEN
  RAISE EXCEPTION 'Transfer not available for reversal';
 END IF;
 SELECT * INTO reversal FROM paylink.transfer_reversals WHERE original_transfer_id=p_original;
 IF FOUND THEN
  IF reversal.reason=p_reason AND EXISTS (
   SELECT FROM paylink.transfers WHERE id=reversal.reversing_transfer_id AND initiated_by=p_actor AND idempotency_key=p_key
  ) THEN RETURN reversal; END IF;
  RAISE EXCEPTION 'Transfer already reversed';
 END IF;
 IF EXISTS (SELECT FROM paylink.transfer_reversals WHERE reversing_transfer_id=p_original) THEN
  RAISE EXCEPTION 'A compensating transfer cannot be reversed';
 END IF;
 IF EXISTS (SELECT FROM paylink.transfers WHERE initiated_by=p_actor AND idempotency_key=p_key) THEN
  RAISE EXCEPTION 'Idempotency key already used';
 END IF;
 compensation := paylink.execute_transfer(p_actor,original.destination_account_id,original.source_account_id,
                                           original.amount_cents,'Transfer reversal',p_key);
 INSERT INTO paylink.transfer_reversals VALUES(p_original,compensation.id,p_reason) RETURNING * INTO reversal;
 RETURN reversal;
END $$;

CREATE FUNCTION paylink.transfer_detail(p_actor uuid,p_transfer uuid)
RETURNS TABLE(transfer_id uuid,postings jsonb,reversal jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,paylink AS $$
 SELECT t.id,
  (SELECT jsonb_agg(jsonb_build_object('side',p.side,'account_id',p.account_id,'delta_cents',p.delta_cents)
                    ORDER BY p.side DESC) FROM paylink.transfer_postings p WHERE p.transfer_id=t.id),
  (SELECT jsonb_build_object('original_transfer_id',r.original_transfer_id,
                            'reversing_transfer_id',r.reversing_transfer_id,'reason',r.reason)
   FROM paylink.transfer_reversals r WHERE r.original_transfer_id=t.id OR r.reversing_transfer_id=t.id)
 FROM paylink.transfers t WHERE t.id=p_transfer AND EXISTS (
  SELECT FROM paylink.account_holders h WHERE h.user_id=p_actor AND h.account_id IN(t.source_account_id,t.destination_account_id)
 )
$$;

REVOKE ALL ON FUNCTION paylink.send_account_invitation(uuid,uuid,text),paylink.decide_account_invitation(uuid,uuid,text),
 paylink.list_account_invitations(uuid),paylink.reverse_transfer(uuid,uuid,text,uuid),paylink.transfer_detail(uuid,uuid) FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='paylink_api') THEN
  GRANT EXECUTE ON FUNCTION paylink.send_account_invitation(uuid,uuid,text),paylink.decide_account_invitation(uuid,uuid,text),
   paylink.list_account_invitations(uuid),paylink.reverse_transfer(uuid,uuid,text,uuid),paylink.transfer_detail(uuid,uuid) TO paylink_api;
 END IF;
END $$;

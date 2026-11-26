"""Read-only PostgreSQL checks for the fixtures created by live_acceptance.py."""

import json
import os
import sys

import psycopg


def verify(connection, fixture):
    connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    users = dict(connection.execute(
        "SELECT username, id FROM paylink.users WHERE username IN (%s, %s)",
        (fixture["sender"], fixture["recipient"]),
    ).fetchall())
    assert len(users) == 2, "Both validation users must be persisted"
    sender, recipient = (users[fixture[name]] for name in ("sender", "recipient"))
    source, destination = (fixture[name] for name in ("account_id", "destination_id"))
    balances = {str(row[0]): row[1:] for row in connection.execute(
        "SELECT id, opening_balance_cents, balance_cents FROM paylink.bank_accounts WHERE id IN (%s, %s)",
        (source, destination),
    )}
    assert balances == {source: (20_000, 20_000), destination: (20_000, 20_000)}, "Balances were not restored"
    holders = connection.execute(
        "SELECT user_id FROM paylink.account_holders WHERE account_id = %s", (source,),
    ).fetchall()
    assert {holder[0] for holder in holders} == {sender, recipient}, "Expected two joint owners"
    invitation = connection.execute(
        """SELECT account_id::text, inviter_id, invitee_id, decision
           FROM paylink.account_invitations WHERE id = %s""",
        (fixture["invitation_id"],),
    ).fetchone()
    assert invitation == (source, sender, recipient, "accepted"), "Invitation was not persisted as accepted"

    transfer, reversal = (fixture[name] for name in ("transfer_id", "reversal_id"))
    amount = fixture["sent_amount_cents"]
    originals = connection.execute(
        """SELECT id::text, source_account_id::text, destination_account_id::text, amount_cents
           FROM paylink.transfers WHERE initiated_by = %s AND idempotency_key = %s""",
        (sender, fixture["idempotency_key"]),
    ).fetchall()
    assert originals == [(transfer, source, destination, amount)], "Expected one original transfer for the key"
    compensation = connection.execute(
        """SELECT t.id::text, t.source_account_id::text, t.destination_account_id::text, t.amount_cents
           FROM paylink.transfer_reversals r JOIN paylink.transfers t ON t.id = r.reversing_transfer_id
           WHERE r.original_transfer_id = %s AND t.initiated_by = %s""",
        (transfer, recipient),
    ).fetchone()
    assert compensation == (reversal, destination, source, amount), "Expected a linked compensating transfer"
    postings = connection.execute(
        "SELECT transfer_id::text, side, account_id::text, delta_cents FROM paylink.transfer_postings "
        "WHERE transfer_id IN (%s, %s)",
        (transfer, reversal),
    ).fetchall()
    assert set(postings) == {
        (transfer, "debit", source, -amount),
        (transfer, "credit", destination, amount),
        (reversal, "debit", destination, -amount),
        (reversal, "credit", source, amount),
    }, "Expected exactly one matching debit and one matching credit per transfer"

    table_counts = connection.execute("""
        SELECT (SELECT count(*) FROM paylink.users) AS users,
               (SELECT count(*) FROM paylink.banks) AS banks,
               (SELECT count(*) FROM paylink.bank_accounts) AS bank_accounts,
               (SELECT count(*) FROM paylink.account_holders) AS account_holders,
               (SELECT count(*) FROM paylink.transfers) AS transfers,
               (SELECT count(*) FROM paylink.transfer_postings) AS transfer_postings,
               (SELECT count(*) FROM paylink.account_invitations) AS account_invitations,
               (SELECT count(*) FROM paylink.transfer_reversals) AS transfer_reversals
    """)
    totals = dict(zip((column.name for column in table_counts.description), table_counts.fetchone()))
    unbalanced, = connection.execute("""
        SELECT count(*) FROM paylink.transfers t WHERE NOT EXISTS (
          SELECT 1 FROM paylink.transfer_postings p WHERE p.transfer_id = t.id
          GROUP BY p.transfer_id HAVING count(*) = 2 AND sum(p.delta_cents) = 0
        )
    """).fetchone()
    unreconciled, = connection.execute("""
        SELECT count(*) FROM paylink.bank_accounts a LEFT JOIN
          (SELECT account_id, sum(delta_cents) AS net FROM paylink.transfer_postings GROUP BY account_id) p
          ON p.account_id = a.id WHERE a.balance_cents <> a.opening_balance_cents + coalesce(p.net, 0)
    """).fetchone()
    assert (unbalanced, unreconciled) == (0, 0), "Global posting reconciliation failed"
    return {
        "row_counts": totals, "fixture_users": len(users), "fixture_joint_holders": len(holders),
        "fixture_opening_and_restored_balance_cents": 20_000,
        "originals_for_idempotency_key": len(originals), "fixture_postings": len(postings),
        "fixture_invitation": "accepted", "fixture_reversal_linked": True,
        "unbalanced_transfers": unbalanced, "unreconciled_accounts": unreconciled,
    }


if __name__ == "__main__":
    fixture = json.loads(sys.argv[1])
    with psycopg.connect(os.environ["ADMIN_DATABASE_URL"], connect_timeout=10) as connection:
        evidence = verify(connection, fixture)
    print("PASS: " + json.dumps(evidence, sort_keys=True))

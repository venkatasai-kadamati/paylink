"""Deterministic LOCAL benchmark data (not real customers or money).

Bulk loading deliberately bypasses execute_transfer. Opening balances cover ALL
outgoing payments, so even chronological replay cannot overdraw. No app limits
are bypassed for ownership. --reset removes only this generator's namespace;
demo data is preserved. Default anchor is fixed for reproducibility; use --as-of
to refresh the 365-day window. Reuse the same anchor to reproduce identical rows.
"""
import argparse
from datetime import datetime, timezone
import math
import os
from pathlib import Path
from time import perf_counter
from urllib.parse import urlparse
from uuid import NAMESPACE_URL, uuid5

from dotenv import dotenv_values
import psycopg

ROOT = Path(__file__).resolve().parents[1]
RECONCILE = """WITH delta AS (
 SELECT source_account_id id,-amount_cents n FROM paylink.transfers
 UNION ALL SELECT destination_account_id,amount_cents FROM paylink.transfers)
 SELECT count(*) FROM (SELECT a.id FROM paylink.bank_accounts a
 LEFT JOIN delta d ON d.id=a.id GROUP BY a.id
 HAVING a.balance_cents<>a.opening_balance_cents+coalesce(sum(d.n),0)) bad"""


def local_url(url):
    if urlparse(url).hostname not in ('localhost', '127.0.0.1'):
        raise ValueError('Synthetic data requires a localhost ADMIN_DATABASE_URL')
    params = psycopg.conninfo.conninfo_to_dict(url)
    if params.get('host') not in ('localhost', '127.0.0.1') or params.get('hostaddr', '127.0.0.1') not in ('127.0.0.1', '::1'):
        raise ValueError('Synthetic data requires a localhost ADMIN_DATABASE_URL')
    return url


def identity(kind, number, namespace='benchmark'):
    return uuid5(NAMESPACE_URL, f'paylink.synthetic/{namespace}/{kind}/{number}')


def generate(c, scale=1, reset=False, namespace='benchmark', as_of='2026-11-22'):
    local_url('postgresql://' + c.info.host + '/local')
    if not math.isfinite(scale) or scale <= 0:
        raise ValueError('scale must be finite and positive')
    if not namespace.isalnum() or len(namespace) > 10:
        raise ValueError('namespace must be 1–10 alphanumeric characters')
    anchor = datetime.fromisoformat(as_of).replace(tzinfo=timezone.utc)
    n = max(10, round(50000 * scale))
    count = max(1, round(2000000 * scale))
    prefix = f'syn_{namespace}_'
    if reset:
        c.execute('CREATE TEMP TABLE syn_delete ON COMMIT DROP AS SELECT id FROM paylink.users WHERE starts_with(username,%s) AND email LIKE %s',
                  (prefix, '%@synthetic.paylink.test'))
        c.execute('DELETE FROM paylink.transfers WHERE initiated_by IN (SELECT id FROM syn_delete)')
        c.execute('DELETE FROM paylink.account_holders WHERE user_id IN (SELECT id FROM syn_delete)')
        c.execute('DELETE FROM paylink.bank_accounts WHERE bank_id IN (SELECT id FROM paylink.banks WHERE starts_with(name,%s))', (prefix,))
        c.execute('DELETE FROM paylink.users WHERE id IN (SELECT id FROM syn_delete)')
        c.execute('DELETE FROM paylink.banks WHERE starts_with(name,%s)', (prefix,))
        c.execute('DROP TABLE syn_delete')
    c.execute('CREATE TEMP TABLE syn_users(i int PRIMARY KEY,id uuid) ON COMMIT DROP')
    with c.cursor().copy('COPY syn_users FROM STDIN') as cp:
        for i in range(n):
            cp.write_row((i, identity('user', i, namespace)))
    c.execute('''INSERT INTO paylink.users(id,username,email,phone,full_name,password_hash,created_at)
      SELECT id,%s||i,%s||i||'@synthetic.paylink.test',NULL,'Synthetic customer '||i,
      '!disabled-synthetic-login',%s FROM syn_users''', (prefix, prefix, anchor))
    with c.cursor().copy('COPY paylink.banks(id,routing_number,name) FROM STDIN') as cp:
        for i in range(25):
            # Namespace-derived routing range keeps isolated tests separate.
            route = 200000000 + int(identity('routing', 0, namespace).hex[:7], 16) % 20000000 * 25 + i
            cp.write_row((identity('bank', i, namespace), str(route).zfill(9), prefix + f'bank_{i}'))
    c.execute('CREATE TEMP TABLE syn_accounts(i int PRIMARY KEY,id uuid,owner_id uuid,bank_id uuid) ON COMMIT DROP')
    with c.cursor().copy('COPY syn_accounts FROM STDIN') as cp:
        for i in range(n * 2):
            cp.write_row((i, identity('account', i, namespace), identity('user', i // 2, namespace), identity('bank', i % 25, namespace)))
    c.execute('''INSERT INTO paylink.bank_accounts(id,bank_id,account_number,account_type,label,created_at)
      SELECT id,bank_id,lpad((800000000000+i)::text,12,'0'),
      CASE WHEN i%%2=0 THEN 'checking' ELSE 'savings' END,%s||i,%s FROM syn_accounts''', (prefix, anchor))
    c.execute('INSERT INTO paylink.account_holders SELECT owner_id,id,%s FROM syn_accounts', (anchor,))
    c.execute('''INSERT INTO paylink.account_holders SELECT u.id,a.id,%s
      FROM syn_accounts a JOIN syn_users u ON u.i=(a.i/2+1) %% %s WHERE a.i%%10=0''', (anchor, n))
    # Fixed modular arithmetic is the PRNG: 20%% of transfers go to 1%% of
    # accounts; the remainder is distributed across the whole population.
    c.execute('CREATE TEMP TABLE syn_transfer_ids(g bigint,id uuid,key uuid) ON COMMIT DROP')
    with c.cursor().copy('COPY syn_transfer_ids FROM STDIN') as cp:
        for i in range(1, count+1):
            cp.write_row((i, identity('transfer', i, namespace), identity('key', i, namespace)))
    c.execute('''INSERT INTO paylink.transfers(id,initiated_by,source_account_id,destination_account_id,amount_cents,memo,idempotency_key,created_at)
      SELECT t.id,s.owner_id,s.id,d.id,100+(g*7919%%100000),%s,
      t.key,%s::timestamptz - ((g*104729%%31536000)*interval '1 second')
      FROM syn_transfer_ids t
      JOIN syn_accounts s ON s.i=CASE WHEN g%%5=0 THEN (g/5)%%greatest(1,%s/100) ELSE (g::bigint*7919)%%%s END
      JOIN syn_accounts d ON d.i=(s.i+1+(g::bigint*31)%%(%s-1))%%%s''',
      (prefix+'transfer', anchor, n*2, n*2, n*2, n*2))
    c.execute('''WITH outgoing AS(SELECT source_account_id id,sum(amount_cents) amount FROM paylink.transfers
      WHERE initiated_by IN(SELECT id FROM syn_users) GROUP BY 1),
      incoming AS(SELECT destination_account_id id,sum(amount_cents) amount FROM paylink.transfers
      WHERE initiated_by IN(SELECT id FROM syn_users) GROUP BY 1)
      UPDATE paylink.bank_accounts a SET opening_balance_cents=100000+coalesce(o.amount,0),
      balance_cents=100000+coalesce(r.amount,0)
      FROM syn_accounts s LEFT JOIN outgoing o ON o.id=s.id LEFT JOIN incoming r ON r.id=s.id WHERE a.id=s.id''')
    for table in ('users', 'banks', 'bank_accounts', 'account_holders', 'transfers'):
        c.execute('ANALYZE paylink.' + table)
    c.execute('DROP TABLE syn_accounts,syn_users,syn_transfer_ids')
    return n, 25, n*2, n*2+(n*2+9)//10, count


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--scale', type=float, default=1)
    p.add_argument('--reset', action='store_true')
    p.add_argument('--as-of', default='2026-11-22')
    args = p.parse_args()
    config = {**dotenv_values(ROOT / '.env'), **os.environ}
    url = local_url(config['ADMIN_DATABASE_URL'])
    start = perf_counter()
    with psycopg.connect(url) as c:
        counts = generate(c, args.scale, args.reset, as_of=args.as_of)
        assert c.execute(RECONCILE).fetchone()[0] == 0
    print(f'Synthetic rows (users,banks,accounts,holders,transfers): {counts}')
    print(f'Generation runtime seconds: {perf_counter()-start:.3f}')


if __name__ == '__main__':
    main()

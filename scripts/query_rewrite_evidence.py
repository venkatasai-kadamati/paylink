"""LOCAL-only, repeatable-snapshot proof and timings of the history/weekly rewrites.

Run after synthetic_data.py: .venv/bin/python scripts/query_rewrite_evidence.py
Old SQL is read literally from the regression tests; new SQL is extracted from
the app without importing or starting it. Compare column names/type OIDs and
every ordered result field in PostgreSQL's binary wire format. One empty-account
user is transaction-only; all fixtures are rolled back. No index changes.
"""
import ast
from hashlib import sha256
import os
from pathlib import Path
from statistics import median
from uuid import NAMESPACE_URL, uuid5

from dotenv import dotenv_values
import psycopg

from benchmark_evidence import queries
from synthetic_data import local_url

ROOT = Path(__file__).resolve().parents[1]


def references():
    tree = ast.parse((ROOT/'backend/tests/test_database.py').read_text())
    return {target.id: ast.literal_eval(node.value)
            for node in tree.body if isinstance(node, ast.Assign)
            for target in node.targets if isinstance(target, ast.Name)
            and target.id in ('OLD_HISTORY_SQL', 'OLD_WEEKLY_SQL')}


def signature(c, sql, uid):
    with c.cursor(binary=True) as cur:
        cur.execute(sql, (uid,))
        columns = tuple((col.name, col.type_code) for col in cur.description)
        result = cur.pgresult
        rows = tuple(tuple(result.get_value(i,j) for j in range(result.nfields))
                     for i in range(result.ntuples))
        return columns, rows


def main():
    config = {**dotenv_values(ROOT/'.env'), **os.environ}
    lines = []
    def out(value):
        lines.append(str(value))
        print(value, flush=True)
    old = references()
    new = queries()
    pairs = {'history': (old['OLD_HISTORY_SQL'], new['HISTORY_SQL']),
             'weekly': (old['OLD_WEEKLY_SQL'], new['insights_weekly'])}
    mismatches = []
    timings = []
    with psycopg.connect(local_url(config['ADMIN_DATABASE_URL'])) as c:
        c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
        c.execute("SET LOCAL TIME ZONE 'America/Chicago'")
        c.execute("SET LOCAL statement_timeout='10s'")
        out(c.execute('SELECT version()').fetchone()[0])
        out('LOCAL ONLY. Same repeatable-read snapshot; app TimeZone America/Chicago and statement_timeout 10s; other planner settings unchanged. No new indexes.')
        out(('snapshot time, current_date, timezone', c.execute('SELECT now(),current_date,current_setting(\'TimeZone\')').fetchone()))
        out(('transfers', c.execute('SELECT count(*) FROM paylink.transfers').fetchone()[0]))
        out(('created_at correlation', c.execute("SELECT correlation FROM pg_stats WHERE schemaname='paylink' AND tablename='transfers' AND attname='created_at'").fetchone()[0]))
        for row in c.execute("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='paylink' AND tablename='transfers' ORDER BY indexname"):
            out(row)
        users = c.execute("""SELECT u.id,u.username,count(t.id) n FROM paylink.users u
          LEFT JOIN paylink.transfers t ON t.initiated_by=u.id
          WHERE starts_with(u.username,'syn_benchmark_') GROUP BY u.id ORDER BY n DESC,u.id""").fetchall()
        if len(users) < 200:
            raise SystemExit('Load the default synthetic dataset first (at least 200 users required).')
        heavy, typical = users[0], users[len(users)//2]
        out('MEDIAN PLAN MEASUREMENTS: three old/new executions per query and user; alternating old/new order across rounds.')
        for label, (uid, username, count) in [('heavy', heavy), ('typical', typical)]:
            out((label, uid, username, 'initiated transfers', count))
            for name, (before, after) in pairs.items():
                out(f'\nQUERY {name}\nOLD SQL:\n{before}\nNEW SQL:\n{after}')
                samples = {'OLD': [], 'NEW': []}
                for run in range(3):
                    modes = [('OLD', before), ('NEW', after)]
                    if run%2: modes.reverse()
                    for mode, sql in modes:
                        out(f'EXPLAIN {label}/{name}/{mode} RUN {run+1}; user_id={uid}')
                        for line, in c.execute('EXPLAIN (ANALYZE, BUFFERS) '+sql, (uid,)):
                            out(line)
                            if line.startswith('Execution Time:'):
                                samples[mode].append(float(line.split()[2]))
                timings.append((label, name, median(samples['OLD']), median(samples['NEW']), samples))
        selected = {users[i*(len(users)-1)//199][0]: users[i*(len(users)-1)//199][1] for i in range(200)}
        selected[heavy[0]], selected[typical[0]] = heavy[1], typical[1]
        joint = c.execute("""SELECT DISTINCT u.id,u.username FROM paylink.users u
          JOIN paylink.account_holders h ON h.user_id=u.id
          WHERE starts_with(u.username,'syn_benchmark_') AND EXISTS(
            SELECT 1 FROM paylink.account_holders other WHERE other.account_id=h.account_id AND other.user_id<>h.user_id)
          ORDER BY u.id LIMIT 16""").fetchall()
        demo = c.execute("SELECT id,username FROM paylink.users WHERE username IN('sai','siddhardth','maya','alex') ORDER BY id").fetchall()
        assert len(demo) == 4 and len(joint) == 16
        selected.update(joint)
        selected.update(demo)
        empty = uuid5(NAMESPACE_URL, 'paylink.rewrite-evidence/empty-user')
        account = uuid5(NAMESPACE_URL, 'paylink.rewrite-evidence/empty-account')
        c.execute("""INSERT INTO paylink.users(id,username,email,full_name,password_hash)
          VALUES(%s,'syn_rewrite_empty','empty@synthetic.paylink.test','Synthetic empty fixture','!disabled')""", (empty,))
        c.execute("""INSERT INTO paylink.bank_accounts(id,bank_id,account_number,account_type,label)
          SELECT %s,id,'899999999999','checking','Synthetic empty fixture' FROM paylink.banks ORDER BY id LIMIT 1""", (account,))
        c.execute('INSERT INTO paylink.account_holders(user_id,account_id) VALUES(%s,%s)', (empty, account))
        selected[empty] = 'syn_rewrite_empty (transaction-only empty account)'
        out(f'\nFULL-DATASET EQUIVALENCE: {len(selected)} distinct users; includes 200 evenly sampled synthetic users, heavy, typical, 16 joint holders, all four demo users, one rolled-back empty-account fixture (categories may overlap).')
        out('Compare column names/type OIDs and ordered PostgreSQL binary field bytes, including NULLs. SHA256 below hashes the exact old signature; equality compares signatures directly, not hashes.')
        for uid, username in sorted(selected.items()):
            for name, (before, after) in pairs.items():
                left, right = signature(c, before, uid), signature(c, after, uid)
                equal = left == right
                if not equal: mismatches.append((str(uid), name))
                out((str(uid), username, name, 'rows', len(left[1]), len(right[1]), 'equal', equal,
                     'sha256', sha256(repr(left).encode()).hexdigest()))
        out('\nMEDIAN SUMMARY (user, query, old_ms, new_ms, raw samples_ms):')
        for row in timings: out(row)
        out(('Equivalence sample size', len(selected)))
        out(('Query result comparisons', len(selected)*len(pairs)))
        out(('Equivalence mismatches', len(mismatches), mismatches))
        c.rollback()
        out(('Empty fixture users remaining after rollback', c.execute('SELECT count(*) FROM paylink.users WHERE id=%s', (empty,)).fetchone()[0]))
        out('All fixtures rolled back. No schema or index changes. Monthly SQL unchanged.')
    (ROOT/'artifacts/query-rewrite-evidence.txt').write_text('\n'.join(lines)+'\n')
    if mismatches: raise SystemExit('Old/new result mismatch')


if __name__ == '__main__':
    main()

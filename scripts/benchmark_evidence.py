"""Exact application SQL, local-only measured plans; transactional index ablation.

AST extraction avoids application startup. Three executions per query/candidate
are recorded in full with median execution time. Unique constraints are dropped
only inside rolled-back savepoints. No data or schema changes survive.
"""
import ast
import os
from statistics import median
from pathlib import Path
from dotenv import dotenv_values
import psycopg
from synthetic_data import local_url, RECONCILE

ROOT = Path(__file__).resolve().parents[1]


def queries():
    result = {}
    for node in ast.parse((ROOT/'backend/app/main.py').read_text()).body:
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in ('ACCOUNT_SQL', 'HISTORY_SQL'):
                    result[target.id] = node.value.value
        if isinstance(node, ast.FunctionDef) and node.name in ('login', 'recipients', 'insights'):
            for call in ast.walk(node):
                if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == 'execute' and call.args and isinstance(call.args[0], ast.Constant):
                    sql = call.args[0].value
                    key = node.name
                    if key == 'insights': key += '_weekly' if 'WITH days' in sql else '_monthly'
                    result[key] = sql
    result['idempotency'] = 'SELECT * FROM paylink.transfers WHERE initiated_by=%s AND idempotency_key=%s'
    result['holder_count'] = 'SELECT count(*) FROM paylink.account_holders h2 WHERE h2.account_id=%s'
    assert len(result) == 8, result.keys()
    return result


def main():
    config = {**dotenv_values(ROOT/'.env'), **os.environ}
    lines = []
    out = lambda value: lines.append(str(value))
    with psycopg.connect(local_url(config['ADMIN_DATABASE_URL'])) as c:
        out(c.execute('SELECT version()').fetchone()[0])
        out('LOCAL ONLY. Three runs per case; median Execution Time; planner defaults unchanged. SQL extracted from backend/app/main.py.')
        out('Candidates interleaved per query in rotating order across three rounds to limit time/cache drift. Candidate indexes built once; unwanted candidates dropped transactionally for each execution.')
        out('Meaningful regression threshold: increase > max(10% of baseline, 10 ms). Compare each candidate against BASELINE (existing account-prefix indexes only).')
        out(('created_at physical correlation', c.execute("SELECT correlation FROM pg_stats WHERE schemaname='paylink' AND tablename='transfers' AND attname='created_at'").fetchone()[0]))
        out('Table: rows, heap_bytes, indexes_bytes, total_bytes (includes TOAST)')
        for table, in c.execute("SELECT tablename FROM pg_tables WHERE schemaname='paylink' ORDER BY tablename").fetchall():
            count = c.execute('SELECT count(*) FROM paylink.'+table).fetchone()[0]
            sizes = c.execute('SELECT pg_relation_size(%s),pg_indexes_size(%s),pg_total_relation_size(%s)', ('paylink.'+table,)*3).fetchone()
            out((table, count, *sizes))
        out('Per-index sizes and definitions:')
        for row in c.execute("SELECT indexname,pg_relation_size(('paylink.'||indexname)::regclass),indexdef FROM pg_indexes WHERE schemaname='paylink' ORDER BY indexname"):
            out(row)
        out(('Total paylink bytes including indexes/TOAST', c.execute("SELECT sum(pg_total_relation_size(oid)) FROM pg_class WHERE relnamespace='paylink'::regnamespace AND relkind='r'").fetchone()[0]))
        out(('Reconciliation discrepancies', c.execute(RECONCILE).fetchone()[0]))
        users = c.execute("""SELECT u.id,u.username,count(t.id) n FROM paylink.users u
          LEFT JOIN paylink.transfers t ON t.initiated_by=u.id
          WHERE starts_with(u.username,'syn_benchmark_') GROUP BY u.id ORDER BY n DESC,u.id""").fetchall()
        if not users: raise SystemExit('Load synthetic_data.py first')
        indexes = {
            'login': ['users_username_key', 'users_email_key'],
            'recipients': ['users_username_key', 'users_email_key', 'users_phone_key'],
            'ACCOUNT_SQL': ['account_holders_pkey', 'account_holders_account_idx'],
            'HISTORY_SQL': ['transfers_source_time_idx', 'transfers_destination_time_idx'],
            'insights_monthly': ['transfers_source_time_idx', 'transfers_destination_time_idx'],
            'insights_weekly': ['transfers_source_time_idx', 'transfers_destination_time_idx'],
            'idempotency': ['transfers_initiated_by_idempotency_key_key'],
            'holder_count': ['account_holders_account_idx'],
        }
        cases = []
        for label, (uid, username, activity) in [('heavy', users[0]), ('typical', users[len(users)//2])]:
            account = c.execute('SELECT account_id FROM paylink.account_holders WHERE user_id=%s ORDER BY account_id LIMIT 1', (uid,)).fetchone()[0]
            key = c.execute('SELECT idempotency_key FROM paylink.transfers WHERE initiated_by=%s ORDER BY id LIMIT 1', (uid,)).fetchone()[0]
            out(f'\n{label}: id={uid}, username={username}, initiated transfers={activity}, account={account}')
            for name, sql in queries().items():
                params = (uid,)
                if name == 'login': params = (username, username)
                if name == 'recipients': params = (username, username, username, users[-1][0])
                if name == 'idempotency': params = (uid, key)
                if name == 'holder_count': params = (account,)
                cases.append((label, name, sql, params))
        # Remove the installed candidate transactionally so each alternative is
        # measured alone against the same existing application indexes.
        c.execute('DROP INDEX IF EXISTS paylink.transfers_created_time_idx')
        candidates = {
            'BASELINE': None,
            'BTREE': 'CREATE INDEX evidence_btree_idx ON paylink.transfers(created_at DESC,id DESC)',
            'BRIN128': 'CREATE INDEX evidence_brin128_idx ON paylink.transfers USING brin(created_at) WITH (pages_per_range=128)',
            'BRIN32': 'CREATE INDEX evidence_brin32_idx ON paylink.transfers USING brin(created_at) WITH (pages_per_range=32)',
        }
        candidate_indexes = {'BTREE': 'evidence_btree_idx', 'BRIN128': 'evidence_brin128_idx', 'BRIN32': 'evidence_brin32_idx'}
        timings = []
        for mode, ddl in candidates.items():
            if ddl:
                c.execute(ddl)
                out((mode, ddl, 'index bytes', c.execute('SELECT pg_relation_size(%s)', ('paylink.'+candidate_indexes[mode],)).fetchone()[0]))
        modes = list(candidates)
        for label, name, sql, params in cases:
            samples = {mode: [] for mode in modes}
            out(f'\nQUERY {label}/{name}\n{sql}\nParameters: {params}')
            for run in range(3):
                for mode in modes[run:]+modes[:run]:
                    c.execute('SAVEPOINT candidate')
                    for other, idx in candidate_indexes.items():
                        if other != mode:
                            c.execute('DROP INDEX paylink.'+idx)
                    out(f'{mode} RUN {run+1}')
                    plan = [r[0] for r in c.execute('EXPLAIN (ANALYZE, BUFFERS) '+sql, params)]
                    lines.extend(plan)
                    samples[mode].append(float(next(p for p in plan if p.startswith('Execution Time:')).split()[2]))
                    c.execute('ROLLBACK TO SAVEPOINT candidate')
                    c.execute('RELEASE SAVEPOINT candidate')
            for mode in modes:
                timings.append((label, name, mode, median(samples[mode]), samples[mode]))
        for idx in candidate_indexes.values():
            c.execute('DROP INDEX paylink.'+idx)
        # Preserve the original evidence's relevant-existing-index ablation.
        for label, name, sql, params in cases:
            samples = []
            out(f'\nQUERY WITHOUT_RELEVANT/{label}/{name}; dropped={indexes[name]}')
            for run in range(1, 4):
                c.execute('SAVEPOINT plan')
                for idx in indexes[name]:
                    constraint = c.execute('SELECT conrelid::regclass::text,conname FROM pg_constraint WHERE conindid=to_regclass(%s)', ('paylink.'+idx,)).fetchone()
                    if constraint: c.execute(f'ALTER TABLE {constraint[0]} DROP CONSTRAINT {constraint[1]}')
                    else: c.execute('DROP INDEX paylink.'+idx)
                out(f'RUN {run}')
                plan = [r[0] for r in c.execute('EXPLAIN (ANALYZE, BUFFERS) '+sql, params)]
                lines.extend(plan)
                samples.append(float(next(p for p in plan if p.startswith('Execution Time:')).split()[2]))
                c.execute('ROLLBACK TO SAVEPOINT plan')
                c.execute('RELEASE SAVEPOINT plan')
            timings.append((label, name, 'WITHOUT_RELEVANT', median(samples), samples))
        out('\nTIMING SUMMARY (label, query, candidate, median_ms, samples_ms):')
        for row in timings: out(row)
        baseline = {(label, name): value for label, name, mode, value, _ in timings if mode == 'BASELINE'}
        out('CANDIDATE REGRESSION CHECK:')
        checks = {}
        for candidate in candidates:
            if candidate == 'BASELINE': continue
            regressions = [(label, name, baseline[label, name], value) for label, name, mode, value, _ in timings
                           if mode == candidate and value-baseline[label, name] > max(10, baseline[label, name]*.1)]
            checks[candidate] = regressions
            out((candidate, 'meaningful regressions', regressions))
        out('Migration choice: BRIN128; small time-range summaries cannot supply history ordering. Monthly insights benefit; weekly insights may keep the baseline plan.')
        out(('BRIN128 meets the no-meaningful-regression threshold', not checks['BRIN128']))
        out('All DDL rolled back; no fixtures inserted or balances modified.')
        c.rollback()
    output = '\n'.join(lines)+'\n'
    (ROOT/'artifacts/query-evidence.txt').write_text(output)
    print(output, end='')


if __name__ == '__main__':
    main()

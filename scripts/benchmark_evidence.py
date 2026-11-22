"""Exact application SQL, local-only measured plans; transactional index ablation.

AST extraction avoids application startup. Single warm-cache measurements are
diagnostic, not controlled latency benchmarks. Unique constraints are dropped
only inside rolled-back savepoints. No data or schema changes survive.
"""
import ast
import os
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
        out('LOCAL ONLY. Single warm-cache runs; planner defaults unchanged. SQL extracted from backend/app/main.py.')
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
        for name in ('HISTORY_SQL', 'insights_monthly', 'insights_weekly'):
            indexes[name].append('transfers_created_time_idx')
        timings = []
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
                out(f'\nQUERY {label}/{name}\n{sql}\nParameters: {params}')
                modes = ('WITH', 'WITHOUT_NEW', 'WITHOUT') if 'transfers_created_time_idx' in indexes[name] else ('WITH', 'WITHOUT')
                for mode in modes:
                    c.execute('SAVEPOINT plan')
                    dropped = ['transfers_created_time_idx'] if mode == 'WITHOUT_NEW' else indexes[name]
                    if mode != 'WITH':
                        for idx in dropped:
                            constraint = c.execute('SELECT conrelid::regclass::text,conname FROM pg_constraint WHERE conindid=to_regclass(%s)', ('paylink.'+idx,)).fetchone()
                            if constraint: c.execute(f'ALTER TABLE {constraint[0]} DROP CONSTRAINT {constraint[1]}')
                            else: c.execute('DROP INDEX paylink.'+idx)
                    out(f'{mode} relevant={indexes[name]}, dropped={dropped if mode != "WITH" else []}:')
                    plan = [r[0] for r in c.execute('EXPLAIN (ANALYZE, BUFFERS) '+sql, params)]
                    lines.extend(plan)
                    timings.append((label, name, mode, next(p for p in plan if p.startswith('Execution Time:'))))
                    c.execute('ROLLBACK TO SAVEPOINT plan')
                    c.execute('RELEASE SAVEPOINT plan')
        out('\nTIMING SUMMARY (single runs):')
        for row in timings: out(row)
        out('New migration: transfers_created_time_idx supports global insights time ranges; WITHOUT_NEW preserves the old account-prefix indexes for the before/after comparison. WITHOUT drops all listed relevant indexes. OR-of-subqueries may still scan transfers; ablation does not rewrite SQL.')
        out('All DDL rolled back; no fixtures inserted or balances modified.')
        c.rollback()
    output = '\n'.join(lines)+'\n'
    (ROOT/'artifacts/query-evidence.txt').write_text(output)
    print(output, end='')


if __name__ == '__main__':
    main()

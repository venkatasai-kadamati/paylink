from unittest.mock import Mock

from fastapi.testclient import TestClient

from backend.app import main, paybot


def test_paybot_is_scoped_to_the_signed_in_user_and_cannot_write(monkeypatch):
    monkeypatch.setenv('PUBLIC_DEMO_ENABLED', 'true')
    monkeypatch.setenv('PAYBOT_PROVIDER', 'local')
    main.attempts.clear()
    try:
        with TestClient(main.app) as c:
            def ask(question, **options):
                response = c.post('/api/paybot', json={'question': question, **options})
                assert response.status_code == 200
                return response.json()['answer']

            assert c.post('/api/paybot', json={'question': 'Balances'}).status_code == 401
            assert c.post('/api/auth/demo', json={'username': 'sai'}).status_code == 200
            accounts = c.get('/api/accounts').json()
            history = c.get('/api/transfers').json()
            assert c.post('/api/paybot', json={'question': ' '}).status_code == 422
            assert c.post('/api/paybot', json={'question': 'Today totals', 'time_zone': 'Unknown/Zone'}).status_code == 422
            assert c.post('/api/paybot', json={'question': 'Balances'}, headers={'Origin': 'https://other.example'}).status_code == 403
            balance_response = c.post('/api/paybot', json={'question': 'Show my balances'})
            assert balance_response.status_code == 200
            balance_payload = balance_response.json()
            balance = balance_payload['answer']
            assert f"Total balance: {paybot.money(sum(a['balance_cents'] for a in accounts))}" in balance
            assert 'Personal:' in balance and 'Joint:' in balance
            assert 'Rainy day fund (Personal):' in ask('What is my Rainy day fund balance?')
            assert all(a['label'] in balance for a in accounts)
            assert all(a['last4'] not in balance for a in accounts)
            assert balance_payload['display']['rows'][0] == {
                'label': 'Total balance', 'value': paybot.money(sum(a['balance_cents'] for a in accounts)),
            }
            assert {row['label'] for row in balance_payload['display']['rows'][3:]} == {a['label'] for a in accounts}
            assert 'Last 7 days: sent' in ask('Totals last 7 days', time_zone='Pacific/Honolulu')
            assert 'by number of transfers' in ask('Top counterparties')
            assert ask('Recent transfers').count('\n') == min(len(history), 5) - 1
            assert 'Export CSV' in ask('How do I export CSV?')
            assert 'Add joint owner' in ask('How do I add a joint owner?')
            assert 'select Send money' in ask('How do I send money?')
            assert 'can’t make transfers' in ask('Send $1 to Siddhardth')
            assert c.get('/api/accounts').json() == accounts
            assert c.get('/api/transfers').json() == history
            assert c.post('/api/auth/demo', json={'username': 'siddhardth'}).status_code == 200
            other_ids = {t['id'] for t in c.get('/api/transfers').json()}
            private = next(t for t in history if t['id'] not in other_ids)
            assert 'couldn’t find' in ask('Find transfer ' + private['id'])
            assert c.post('/api/auth/demo', json={'username': 'sai'}).status_code == 200
            assert paybot.money(private['amount_cents']) in ask('Find transfer ' + private['id'])
    finally:
        main.attempts.clear()


def test_bedrock_gets_fixed_read_only_tool_data_and_falls_back(monkeypatch):
    monkeypatch.setenv('PAYBOT_PROVIDER', 'bedrock')
    monkeypatch.delenv('AWS_ACCESS_KEY_ID', raising=False)
    assert isinstance(paybot.provider(), paybot.LocalProvider)
    client = Mock()
    tool_use = {'name': 'authorized_paylink_data', 'input': {}, 'toolUseId': 'tool-1'}
    client.converse.side_effect = [
        {'stopReason': 'tool_use', 'output': {'message': {'role': 'assistant', 'content': [{'toolUse': tool_use}]}}},
        {'stopReason': 'end_turn', 'output': {'message': {'content': [{'text': 'Sent $12.34 today.'}]}}},
        {'stopReason': 'end_turn', 'output': {'message': {'content': [{'text': 'No tool grounding'}]}}},
    ]
    provider = paybot.BedrockProvider(client, 'test-model')
    facts = {'period': 'today', 'sent': '$12.34', 'received': '$0.00'}
    assert provider.answer('How much did I send today?', 'period', facts) == 'Sent $12.34 today.'
    calls = client.converse.call_args_list
    assert len(calls[0].kwargs['messages']) == 1
    result = calls[1].kwargs['messages'][-1]['content'][0]['toolResult']
    assert result['toolUseId'] == 'tool-1' and result['content'][0]['json']['facts'] == facts
    assert 'Today: sent $12.34, received $0.00' in provider.answer('Today totals', 'period', facts)
    assert not provider.used_bedrock


def test_period_totals_do_not_silently_reinterpret_calendar_ranges():
    for question in ('How much did I send last week?', 'Totals last 90 days',
                     'How much spent in October?', 'Totals since 2026-10-01',
                     'Totals this week', 'Totals today and last 7 days'):
        assert paybot.understand(question) == ('period_help', None)
    for question, period in [('Totals today', 'today'), ('Totals past seven days', 'last 7 days'),
                             ('Totals last 30 days', 'last 30 days'), ('How much this month?', 'this month'),
                             ('How much did I send?', 'this month')]:
        assert paybot.understand(question) == ('period', period)


def test_named_balance_matches_longest_overlaps_and_independent_accounts():
    accounts = [{'label': label, 'holder_count': 1, 'balance_cents': 10000}
                for label in ('Savings', 'Vacation Savings', 'Checking')]
    def labels(question):
        return [a['label'] for a in paybot.balance_facts(accounts, question)['accounts']]
    assert labels('What is my Vacation Savings balance?') == ['Vacation Savings']
    assert labels('Savings and Vacation Savings balances') == ['Savings', 'Vacation Savings']
    assert labels('My checking balance') == ['Checking']
    assert labels('All my balances') == ['Savings', 'Vacation Savings', 'Checking']

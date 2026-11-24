"""Live Chromium E2E. Database assertions verify UI writes; test mutations are reversed."""
import re
import json
import platform
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from browser_support import launch_chromium
from uuid import uuid4
from zoneinfo import ZoneInfo
from dotenv import dotenv_values
import psycopg
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=Path(os.environ.get('BROWSER_ARTIFACT_DIR',str(ROOT/'artifacts')))
ARTIFACTS.mkdir(parents=True,exist_ok=True)
C=dotenv_values(ROOT/'.env')
from urllib.parse import urlparse
if any(urlparse(C[k]).hostname not in ('localhost','127.0.0.1') for k in ('DATABASE_URL','ADMIN_DATABASE_URL')):
    raise SystemExit('Browser fixtures are restricted to the local teaching database.')
created=[]; transfer_ids=[]; errors=[]; steps=[]; registered=[]; completed=False
def record(s): steps.append(s); print('PASS:',s)
def db(query,args=()):
    with psycopg.connect(C['ADMIN_DATABASE_URL']) as c:
        cur=c.execute(query,args)
        return cur.fetchall() if cur.description else []
try:
 with sync_playwright() as p:
    browser=launch_chromium(p)
    browser_zone='Pacific/Honolulu'
    context=browser.new_context(viewport={'width':1440,'height':1100},timezone_id=browser_zone)
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:3000');page.get_by_role('button',name='Sign in as Sai').click()
    expect(page.get_by_role('heading',name='Hello, Sai.')).to_be_visible()
    expect(page.get_by_text('Everyday checking',exact=True)).to_be_visible()
    source=db("SELECT a.id,a.balance_cents FROM paylink.bank_accounts a JOIN paylink.account_holders h ON h.account_id=a.id JOIN paylink.users u ON u.id=h.user_id WHERE u.username='sai' AND a.label='Everyday checking'")[0]
    recipient=db("SELECT a.id,a.balance_cents FROM paylink.bank_accounts a JOIN paylink.account_holders h ON h.account_id=a.id JOIN paylink.users u ON u.id=h.user_id WHERE u.username='siddhardth' AND a.label='Everyday checking'")[0]
    timestamp=(datetime.now(timezone.utc)-timedelta(days=2)).replace(hour=7,minute=30,second=0,microsecond=0)
    local_day=timestamp.astimezone(ZoneInfo(browser_zone)).date()
    assert local_day!=timestamp.astimezone(ZoneInfo('America/Chicago')).date()
    weekly_before=page.request.get('http://localhost:3000/api/insights',params={'time_zone':browser_zone}).json()['weekly']
    sent_before=next(day['sent'] for day in weekly_before if day['day']==local_day.isoformat())
    page.get_by_role('button',name='Send money',exact=True).click()
    dialog=page.get_by_role('dialog')
    dialog.get_by_placeholder('e.g. siddhardth').fill('siddhardth')
    dialog.get_by_role('button',name='Find',exact=True).click()
    dialog.get_by_role('button',name=re.compile(r'Siddhardth @siddhardth · Meridian Bank')).click()
    dialog.get_by_role('button',name='Continue',exact=True).click()
    dialog.get_by_label('From account').select_option(str(source[0]))
    dialog.get_by_role('textbox',name='Amount',exact=True).fill('999999')
    dialog.get_by_role('button',name='Review transfer').click()
    expect(dialog.get_by_role('alert')).to_contain_text('does not have enough funds')
    record('Insufficient funds blocked with visible feedback')
    dialog.get_by_role('textbox',name='Amount',exact=True).fill('12.34')
    dialog.get_by_placeholder('e.g. Lunch').fill('Browser validation — lunch split')
    dialog.get_by_role('button',name='Review transfer').click()
    expect(dialog.get_by_role('heading',name='Review your transfer')).to_be_visible()
    page.screenshot(path=str(ARTIFACTS/'04-transfer-review.png'),full_page=False)
    dialog.get_by_role('button',name='Confirm & send').click()
    expect(dialog.get_by_role('heading',name='Transfer completed')).to_be_visible()
    row=db("SELECT id,amount_cents FROM paylink.transfers WHERE memo='Browser validation — lunch split' ORDER BY created_at DESC LIMIT 1")[0]
    transfer_ids.append(row[0]);assert row[1]==1234
    assert db('SELECT balance_cents FROM paylink.bank_accounts WHERE id=%s',(source[0],))[0][0]==source[1]-1234
    assert db('SELECT balance_cents FROM paylink.bank_accounts WHERE id=%s',(recipient[0],))[0][0]==recipient[1]+1234
    page.screenshot(path=str(ARTIFACTS/'05-transfer-success.png'),full_page=False)
    record('UI transfer committed: source −1234 cents, recipient +1234 cents, one history row')
    db('UPDATE paylink.transfers SET created_at=%s WHERE id=%s',(timestamp,row[0]))
    dialog.get_by_role('button',name='Back to overview').click()
    page.reload();expect(page.get_by_role('heading',name='Hello, Sai.')).to_be_visible()
    page.get_by_role('button',name='Activity',exact=True).click()
    page.get_by_role('textbox',name='Search activity').fill('Browser validation')
    expect(page.get_by_role('button',name='Siddhardth Browser validation')).to_be_visible()
    local_date_label=f'{local_day:%b} {local_day.day}'
    expect(page.locator('.date-cell')).to_contain_text(local_date_label)
    page.get_by_role('button',name='Siddhardth Browser validation').click()
    expect(page.get_by_role('dialog')).to_contain_text(str(row[0]))
    expect(page.get_by_role('dialog').get_by_text('THE LITTLE DETAILS')).to_have_count(0)
    page.screenshot(path=str(ARTIFACTS/'06-transfer-details.png'),full_page=False)
    page.get_by_role('button',name='Close dialog').click()
    with page.expect_download() as download:page.get_by_role('link',name='Export CSV').click()
    text=Path(download.value.path()).read_text();assert 'Browser validation' in text
    record('Reload persistence, activity search, details, and real CSV download')
    page.get_by_role('textbox',name='Search activity').fill('')
    expect(page.locator('tbody tr')).not_to_have_count(0)
    page.screenshot(path=str(ARTIFACTS/'sai-history.png'),full_page=True)
    page.get_by_role('button',name='Insights',exact=True).click()
    expect(page.get_by_role('heading',name='Cash flow over time')).to_be_visible()
    page.get_by_role('button',name='7 days',exact=True).click()
    expect(page.locator('.cashflow-day')).to_have_count(7)
    page.get_by_text('View daily amounts', exact=True).click()
    expect(page.locator('.chart-data tbody tr')).to_have_count(7)
    expect(page.locator('.chart-data').get_by_role('columnheader', name='Received')).to_be_visible()
    sent_label=f'${(sent_before+1234)/100:,.2f}'
    expect(page.locator('.chart-data tr').filter(has=page.get_by_text(local_date_label,exact=True)).locator('td').last).to_have_text(sent_label)
    expect(page.locator('.cashflow-day')).to_have_count(7)
    expect(page.locator('.cashflow-day').filter(has=page.locator('.cashflow-out')).first).to_be_visible()
    assert any(float(bar.evaluate('el=>el.style.height.replace("px","")'))>2 for bar in page.locator('.cashflow-out').all())
    record('Activity, Insights chart and daily amounts use the same Honolulu date at a Chicago day boundary')
    page.screenshot(path=str(ARTIFACTS/'sai-insights.png'),full_page=True)
    record('Sai history, CSV export, and seven-day insights render with data')
    page.get_by_role('button',name='30 days').click()
    expect(page.get_by_role('button',name='30 days')).to_have_attribute('aria-pressed','true')
    expect(page.locator('.chart-data tbody tr')).to_have_count(30)
    expect(page.locator('.chart-data tr').filter(has=page.get_by_text(local_date_label,exact=True)).locator('td').last).to_have_text(sent_label)
    page.get_by_role('button',name='7 days').click()
    expect(page.locator('.chart-data tbody tr')).to_have_count(7)
    record('Insights switches ranges and preserves the exact daily amount')

    paybot=page.get_by_role('button',name='PayBot',exact=True)
    paybot.click()
    bot=page.get_by_role('dialog',name='PayBot')
    expect(bot.get_by_label('Your question')).to_be_focused()
    bot.get_by_role('button',name='Show my balances').click()
    expect(bot.locator('.paybot-rows > div').filter(has_text='Total balance').locator('dd')).to_contain_text('$')
    bot.get_by_label('Your question').fill(f'Look up {row[0]}')
    bot.get_by_label('Your question').press('Enter')
    expect(bot.locator('.paybot-rows > div').filter(has_text='Sent').locator('dd')).to_have_text('$12.34')
    bot.get_by_label('Your question').press('Escape')
    expect(bot).not_to_be_visible()
    expect(paybot).to_be_focused()
    record('PayBot answers balances and a transfer lookup; keyboard opens questions and closes the panel')

    page.get_by_role('button', name='Balance', exact=True).click()
    expect(page.get_by_role('heading', name='Balances', exact=True)).to_be_visible()
    personal, joint = db("""SELECT
      sum(a.balance_cents) FILTER (WHERE owners.n = 1),
      sum(a.balance_cents) FILTER (WHERE owners.n > 1)
      FROM paylink.bank_accounts a JOIN paylink.account_holders h ON h.account_id = a.id
      JOIN paylink.users u ON u.id = h.user_id
      CROSS JOIN LATERAL (SELECT count(*) AS n FROM paylink.account_holders WHERE account_id = a.id) owners
      WHERE u.username = 'sai'""")[0]
    expect(page.locator('.metric-card').filter(has_text='Personal accounts').locator('strong')).to_have_text(f'${personal / 100:,.2f}')
    expect(page.locator('.metric-card').filter(has_text='Joint accounts').locator('strong')).to_have_text(f'${joint / 100:,.2f}')
    page.get_by_role('button', name='Hide balance', exact=True).click()
    expect(page.locator('.metric-card').filter(has_text='Personal accounts').locator('strong')).to_have_text('••••••')
    expect(page.get_by_role('button').filter(has_text='Everyday checking').locator('.account-balance strong')).to_have_text('••••••')
    page.get_by_role('button', name='Show balance', exact=True).click()
    record('Balances match personal and joint accounts in the database; mask hides totals and rows')
    page.get_by_role('button',name='Overview',exact=True).click()
    page.get_by_role('button',name='Move between accounts').click()
    dialog=page.get_by_role('dialog');dialog.get_by_label('From account').select_option(str(source[0]))
    savings=db("SELECT id FROM paylink.bank_accounts WHERE label='Rainy day fund'")[0][0]
    dialog.get_by_label('To account').select_option(str(savings))
    dialog.get_by_role('textbox',name='Amount',exact=True).fill('1.00')
    dialog.get_by_placeholder('e.g. Lunch').fill('Browser validation — internal')
    dialog.get_by_role('button',name='Review transfer').click();dialog.get_by_role('button',name='Confirm & send').click()
    expect(dialog.get_by_role('heading',name='Transfer completed')).to_be_visible()
    transfer_ids.append(db("SELECT id FROM paylink.transfers WHERE memo='Browser validation — internal' ORDER BY created_at DESC LIMIT 1")[0][0])
    dialog.get_by_role('button',name='Back to overview').click()
    record('Own-account transfer through UI')
    page.get_by_role('button',name='Link a bank account').click()
    dialog=page.get_by_role('dialog');dialog.locator('select[name=bank_id]').select_option(label='Meridian Bank')
    dialog.get_by_label('Give it a name').fill('Browser validation account')
    dialog.get_by_role('button',name='Create simulated account').click()
    expect(page.get_by_role('button').filter(has_text='Browser validation account')).to_be_visible()
    account=db("SELECT id,balance_cents FROM paylink.bank_accounts WHERE label='Browser validation account'")[0]
    created.append(account[0]);assert account[1]==20000
    record('Simulated account creation persisted with exactly $200 funding')
    page.get_by_role('button',name='Accounts',exact=True).click()
    page.get_by_role('button',name='Add joint owner',exact=True).click()
    dialog=page.get_by_role('dialog')
    dialog.get_by_label('Account to share').select_option(str(account[0]))
    dialog.get_by_label("New owner's username").fill('siddhardth')
    dialog.get_by_role('button',name='Send invitation').click()
    expect(page.get_by_role('dialog')).not_to_be_visible()
    assert db('SELECT count(*) FROM paylink.account_holders WHERE account_id=%s',(account[0],))[0][0]==1
    record('Joint invitation sent; no ownership granted before acceptance')
    page.get_by_role('button',name='Sign out').click()
    expect(page.get_by_role('heading',name='Welcome back')).to_be_visible()
    page.get_by_role('button',name='Sign in as Siddhardth').click()
    expect(page.get_by_role('heading',name='Hello, Siddhardth.')).to_be_visible()
    page.get_by_role('button',name='Accounts',exact=True).click()
    invitation=page.locator('.invitation-card').filter(has_text='Browser validation account')
    invitation.get_by_role('button',name='Accept invitation').click()
    expect(invitation).not_to_be_visible()
    assert db('SELECT count(*) FROM paylink.account_holders WHERE account_id=%s',(account[0],))[0][0]==2
    record('Invited user accepts through UI; one account and two ownership rows')
    page.get_by_role('button',name='Activity',exact=True).click()
    page.get_by_role('textbox',name='Search activity').fill('Browser validation')
    expect(page.get_by_role('button',name='Sai Kadamati Browser validation')).to_be_visible()
    page.screenshot(path=str(ARTIFACTS/'07-recipient-receipt.png'),full_page=True)
    record('Second signed-in user sees received transfer and shared account')
    page.get_by_role('button',name='Overview',exact=True).click()
    expect(page.get_by_role('button').filter(has_text='Browser validation account')).to_be_visible()
    page.get_by_role('button',name='Move between accounts').click()
    dialog=page.get_by_role('dialog')
    dialog.get_by_label('From account').select_option(str(account[0]))
    expect(dialog.locator('.transfer-account-detail')).to_contain_text('Joint')
    expect(dialog.locator('.shared-account-note')).to_contain_text('all owners')
    dialog.get_by_label('To account').select_option(str(recipient[0]))
    expect(dialog.locator('.transfer-destination-detail')).to_contain_text('Personal')
    dialog.get_by_role('textbox',name='Amount',exact=True).fill('0.50')
    dialog.get_by_placeholder('e.g. Lunch').fill('Browser validation — joint spend')
    dialog.get_by_role('button',name='Review transfer').click()
    expect(dialog.locator('.receipt-list')).to_contain_text('Joint')
    expect(dialog.locator('.receipt-list')).to_contain_text('Personal')
    dialog.get_by_role('button',name='Confirm & send').click()
    expect(dialog.get_by_role('heading',name='Transfer completed')).to_be_visible()
    transfer_ids.append(db("SELECT id FROM paylink.transfers WHERE memo='Browser validation — joint spend' ORDER BY created_at DESC LIMIT 1")[0][0])
    assert db('SELECT balance_cents FROM paylink.bank_accounts WHERE id=%s',(account[0],))[0][0]==19950
    dialog.get_by_role('button',name='Back to overview').click()
    record('New joint owner can spend the shared balance through UI')
    page.get_by_role('button',name='Insights',exact=True).click()
    expect(page.get_by_role('heading',name='Cash flow over time')).to_be_visible()
    record('SQL-driven insights render after transfers')
    page.set_viewport_size({'width':390,'height':844})
    page.get_by_role('button',name='Toggle navigation').click()
    page.get_by_role('button',name='Overview',exact=True).click()
    expect(page.get_by_role('heading',name='Hello, Siddhardth.')).to_be_visible()
    if page.get_by_role('button',name='Dismiss notification').is_visible():page.get_by_role('button',name='Dismiss notification').click()
    page.screenshot(path=str(ARTIFACTS/'08-mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    record('390px mobile layout, navigation, and no page overflow')
    page.get_by_role('button',name='Toggle navigation').click();page.get_by_role('button',name='Sign out').click()
    expect(page.get_by_role('heading',name='Welcome back')).to_be_visible()
    page.get_by_role('button',name='Create account',exact=True).click()
    suffix=uuid4().hex[:8];username='browser_'+suffix;registered.append(username)
    page.get_by_label('Full name',exact=True).fill('Browser Test')
    page.get_by_label('Username',exact=True).fill(username)
    page.get_by_label('Email address').fill(username+'@paylink.test')
    page.get_by_label('Password',exact=True).fill('Test-only!2026')
    page.get_by_role('button',name='Create account',exact=True).click()
    expect(page.get_by_role('heading',name='Hello, Browser.')).to_be_visible()
    expect(page.get_by_role('button').filter(has_text='Everyday checking')).to_be_visible()
    starter=db('''SELECT a.id,a.balance_cents,a.opening_balance_cents FROM paylink.bank_accounts a
        JOIN paylink.account_holders h ON h.account_id=a.id JOIN paylink.users u ON u.id=h.user_id WHERE u.username=%s''',(username,))
    assert len(starter)==1 and starter[0][1:]==(20000,20000)
    page.screenshot(path=str(ARTIFACTS/'09-new-account.png'),full_page=True)
    record('Registration automatically creates exactly one $200 checking account')
    assert not errors,errors
    record('No browser JavaScript errors')
    completed=True
    browser.close()
finally:
 with psycopg.connect(C['ADMIN_DATABASE_URL']) as c:
    for username in registered:
        starter_ids=[r[0] for r in c.execute('''SELECT a.id FROM paylink.bank_accounts a JOIN paylink.account_holders h ON h.account_id=a.id
            JOIN paylink.users u ON u.id=h.user_id WHERE u.username=%s''',(username,))]
        for starter_id in starter_ids:
            c.execute('DELETE FROM paylink.account_holders WHERE account_id=%s',(starter_id,))
            c.execute('DELETE FROM paylink.bank_accounts WHERE id=%s',(starter_id,))
        c.execute('DELETE FROM paylink.users WHERE username=%s',(username,))
    for id in transfer_ids:
        c.execute('DELETE FROM paylink.transfer_postings WHERE transfer_id=%s',(id,))
        r=c.execute('DELETE FROM paylink.transfers WHERE id=%s RETURNING source_account_id,destination_account_id,amount_cents',(id,)).fetchone()
        if r:
            c.execute('UPDATE paylink.bank_accounts SET balance_cents=balance_cents+%s WHERE id=%s',(r[2],r[0]))
            c.execute('UPDATE paylink.bank_accounts SET balance_cents=balance_cents-%s WHERE id=%s',(r[2],r[1]))
    for id in created:
        c.execute('DELETE FROM paylink.account_invitations WHERE account_id=%s',(id,))
        c.execute('DELETE FROM paylink.account_holders WHERE account_id=%s',(id,));c.execute('DELETE FROM paylink.bank_accounts WHERE id=%s',(id,))
 (ARTIFACTS/'browser-results.json').write_text(json.dumps({'completed':completed,'passed':steps,'javascript_errors':errors,'database':'local PostgreSQL 16, not hosted Supabase','platform':platform.platform(),'timestamp_utc':datetime.now(timezone.utc).isoformat(),'test_data_cleaned':True},indent=2))

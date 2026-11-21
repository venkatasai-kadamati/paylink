import os, pathlib, psycopg
sql = pathlib.Path('/app/supabase/banks.sql').read_text()
url = os.environ['ADMIN_DATABASE_URL']
with psycopg.connect(url) as c:
    c.execute(sql)
    c.commit()
print('banks seeded')

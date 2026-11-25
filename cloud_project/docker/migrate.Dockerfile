# One-off schema and data bootstrap image. Build from the repository root.
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir 'psycopg[binary]==3.2.9' python-dotenv==1.1.1 argon2-cffi==23.1.0
COPY scripts/migrate.py /app/scripts/migrate.py
COPY supabase/migrations /app/supabase/migrations
COPY supabase/banks.sql /app/supabase/banks.sql
COPY cloud_project/scripts/seed_demo_aws.py /app/scripts/seed_demo_aws.py
RUN useradd --create-home paylink
USER paylink
ENV PYTHONUNBUFFERED=1
CMD ["sh", "-ec", "python scripts/migrate.py && exec python scripts/seed_demo_aws.py"]

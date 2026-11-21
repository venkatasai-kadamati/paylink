# One-off migration image. Build from repo root:
#   docker build -f cloud_project/docker/migrate.Dockerfile -t paylink-migrate .
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir psycopg[binary]==3.2.9 python-dotenv==1.1.1
COPY scripts/migrate.py /app/scripts/migrate.py
COPY supabase/migrations /app/supabase/migrations
ENV PYTHONUNBUFFERED=1
CMD ["python", "scripts/migrate.py"]

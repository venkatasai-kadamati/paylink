# Demo quick-test profiles (sai / siddhardth) for AWS RDS.
# Build from repo root:
#   docker build -f cloud_project/docker/seed_demo.Dockerfile -t paylink-seed-demo .
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir 'psycopg[binary]==3.2.9' 'argon2-cffi==23.1.0'
COPY cloud_project/scripts/seed_demo_aws.py /app/seed_demo_aws.py
ENV PYTHONUNBUFFERED=1
CMD ["python", "/app/seed_demo_aws.py"]

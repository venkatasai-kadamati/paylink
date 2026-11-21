FROM 223662763933.dkr.ecr.us-east-1.amazonaws.com/paylink-backend:migrate
COPY cloud_project/docker/seed_ctx/banks.sql /app/supabase/banks.sql
COPY cloud_project/docker/seed_ctx/seed_banks.py /app/seed_banks.py
CMD ["python", "/app/seed_banks.py"]

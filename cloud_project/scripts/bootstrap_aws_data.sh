#!/usr/bin/env bash
# Post-apply data bootstrap for PayLink on AWS (safe to re-run after destroy/re-apply).
#
# Always run this AFTER:
#   1) terraform apply
#   2) ./scripts/build_and_push.sh   (backend image repo must exist)
#
# Steps (idempotent):
#   A) schema migrations + paylink_api role
#   B) banks catalog
#   C) Sai / Siddhardth quick-test profiles (+ demo accounts/history)
#
# Without step C, /api/auth/demo returns 503 ("Test profile is temporarily unavailable").
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TF_DIR="$(cd "$(dirname "$0")/../terraform" && pwd)"
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REPO="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/paylink-backend"

SECRET_ARN="$(terraform -chdir="$TF_DIR" output -raw app_secret_arn)"
SECRET_JSON="$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_ARN" --query SecretString --output text)"
ADMIN_URL="$(python3 -c "import json,sys; s=json.loads(sys.argv[1]); print(f\"postgresql://{s['username']}:{s['password']}@{s['host']}:{s['port']}/{s['dbname']}\")" "$SECRET_JSON")"
SUBNETS="$(terraform -chdir="$TF_DIR" output -json app_subnet_ids | python3 -c 'import json,sys; print(",".join(json.load(sys.stdin)))')"
SG="$(aws ec2 describe-security-groups --region "$REGION" --filters Name=tag:Name,Values=paylink-ecs-backend-sg --query 'SecurityGroups[0].GroupId' --output text)"
EXEC_ROLE="$(aws iam get-role --role-name paylink-ecs-execution --query Role.Arn --output text)"
TASK_ROLE="$(aws iam get-role --role-name paylink-ecs-task --query Role.Arn --output text)"

export PATH="/opt/homebrew/bin:${PATH}"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com" >/dev/null

run_fargate_job() {
  local family="$1" image="$2" container="$3"
  shift 3
  # remaining args: extra environment JSON objects (optional), unused for now
  local td
  td="$(mktemp)"
  python3 - <<PY >"$td"
import json
print(json.dumps({
  "family": "$family",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "$EXEC_ROLE",
  "taskRoleArn": "$TASK_ROLE",
  "runtimePlatform": {"operatingSystemFamily": "LINUX", "cpuArchitecture": "ARM64"},
  "containerDefinitions": [{
    "name": "$container",
    "image": "$image",
    "essential": True,
    "environment": [{"name": "ADMIN_DATABASE_URL", "value": """$ADMIN_URL"""}],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/paylink/backend",
        "awslogs-region": "$REGION",
        "awslogs-stream-prefix": "$container"
      }
    }
  }]
}))
PY
  aws ecs register-task-definition --region "$REGION" --cli-input-json "file://${td}" >/dev/null
  rm -f "$td"
  local task
  task="$(aws ecs run-task --region "$REGION" \
    --cluster paylink-cluster \
    --launch-type FARGATE \
    --task-definition "$family" \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG}],assignPublicIp=DISABLED}" \
    --query 'tasks[0].taskArn' --output text)"
  echo "  started $task"
  aws ecs wait tasks-stopped --region "$REGION" --cluster paylink-cluster --tasks "$task"
  local exit_code
  exit_code="$(aws ecs describe-tasks --region "$REGION" --cluster paylink-cluster --tasks "$task" --query 'tasks[0].containers[0].exitCode' --output text)"
  if [[ "$exit_code" != "0" ]]; then
    echo "ERROR: $family exited $exit_code"
    aws logs tail /ecs/paylink/backend --region "$REGION" --since 10m 2>&1 | tail -40
    exit 1
  fi
  echo "  ok ($family)"
}

echo "==> A) Migrations (schema + paylink_api) + C) demo profiles"
# run_migrations_ecs.sh ends by calling seed_demo_ecs.sh (sai/siddhardth).
"$ROOT/cloud_project/scripts/run_migrations_ecs.sh"

# Refresh admin URL (master fields are stable; database_url may now be paylink_api).
SECRET_JSON="$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_ARN" --query SecretString --output text)"
ADMIN_URL="$(python3 -c "import json,sys; s=json.loads(sys.argv[1]); print(f\"postgresql://{s['username']}:{s['password']}@{s['host']}:{s['port']}/{s['dbname']}\")" "$SECRET_JSON")"

echo "==> B) Banks catalog"
mkdir -p "$ROOT/cloud_project/docker/seed_ctx"
cp "$ROOT/supabase/banks.sql" "$ROOT/cloud_project/docker/seed_ctx/banks.sql"
cat > "$ROOT/cloud_project/docker/seed_ctx/seed_banks.py" <<'PY'
import os, pathlib, psycopg
sql = pathlib.Path('/app/supabase/banks.sql').read_text()
with psycopg.connect(os.environ['ADMIN_DATABASE_URL']) as c:
    c.execute(sql)
    c.commit()
print('banks seeded')
PY
cat > "$ROOT/cloud_project/docker/seed.Dockerfile" <<'EOF'
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir 'psycopg[binary]==3.2.9'
COPY cloud_project/docker/seed_ctx/banks.sql /app/supabase/banks.sql
COPY cloud_project/docker/seed_ctx/seed_banks.py /app/seed_banks.py
CMD ["python", "/app/seed_banks.py"]
EOF
docker build --platform linux/arm64 -f "$ROOT/cloud_project/docker/seed.Dockerfile" -t "${REPO}:seed" "$ROOT"
docker push "${REPO}:seed"
run_fargate_job paylink-seed "${REPO}:seed" seed

echo
echo "Bootstrap complete (migrations + banks + sai/siddhardth demo profiles)."
echo "Quick test sign-in: $(terraform -chdir="$TF_DIR" output -raw cloudfront_url)"

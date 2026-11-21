#!/usr/bin/env bash
# Seed Sai/Siddhardth quick-test profiles into AWS RDS (idempotent).
# Required for the UI "Sign in as Sai / Siddhardth" buttons.
# Prefer ./bootstrap_aws_data.sh after a fresh terraform apply (migrations + banks + demos).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TF_DIR="$(cd "$(dirname "$0")/../terraform" && pwd)"
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REPO="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/paylink-backend"
export PATH="/opt/homebrew/bin:${PATH}"

SECRET_ARN="$(terraform -chdir="$TF_DIR" output -raw app_secret_arn)"
SECRET_JSON="$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_ARN" --query SecretString --output text)"
# Always use master username/password fields (database_url may already point at paylink_api).
ADMIN_URL="$(python3 -c "import json,sys; s=json.loads(sys.argv[1]); print(f\"postgresql://{s['username']}:{s['password']}@{s['host']}:{s['port']}/{s['dbname']}\")" "$SECRET_JSON")"
SUBNETS="$(terraform -chdir="$TF_DIR" output -json app_subnet_ids | python3 -c 'import json,sys; print(",".join(json.load(sys.stdin)))')"
SG="$(aws ec2 describe-security-groups --region "$REGION" --filters Name=tag:Name,Values=paylink-ecs-backend-sg --query 'SecurityGroups[0].GroupId' --output text)"
EXEC_ROLE="$(aws iam get-role --role-name paylink-ecs-execution --query Role.Arn --output text)"
TASK_ROLE="$(aws iam get-role --role-name paylink-ecs-task --query Role.Arn --output text)"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com" >/dev/null

echo "Building seed-demo image..."
docker build --platform linux/arm64 -f "$ROOT/cloud_project/docker/seed_demo.Dockerfile" -t "${REPO}:seed-demo" "$ROOT"
docker push "${REPO}:seed-demo"

TD="$(mktemp)"
python3 - <<PY >"$TD"
import json
print(json.dumps({
  "family": "paylink-seed-demo",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "$EXEC_ROLE",
  "taskRoleArn": "$TASK_ROLE",
  "runtimePlatform": {"operatingSystemFamily": "LINUX", "cpuArchitecture": "ARM64"},
  "containerDefinitions": [{
    "name": "seed-demo",
    "image": "${REPO}:seed-demo",
    "essential": True,
    "environment": [{"name": "ADMIN_DATABASE_URL", "value": """$ADMIN_URL"""}],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/paylink/backend",
        "awslogs-region": "$REGION",
        "awslogs-stream-prefix": "seed-demo"
      }
    }
  }]
}))
PY

aws ecs register-task-definition --region "$REGION" --cli-input-json "file://${TD}" >/dev/null
rm -f "$TD"

TASK="$(aws ecs run-task --region "$REGION" \
  --cluster paylink-cluster \
  --launch-type FARGATE \
  --task-definition paylink-seed-demo \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG}],assignPublicIp=DISABLED}" \
  --query 'tasks[0].taskArn' --output text)"
echo "Started $TASK"
aws ecs wait tasks-stopped --region "$REGION" --cluster paylink-cluster --tasks "$TASK"
EXIT="$(aws ecs describe-tasks --region "$REGION" --cluster paylink-cluster --tasks "$TASK" --query 'tasks[0].containers[0].exitCode' --output text)"
echo "exit=$EXIT"
aws logs tail /ecs/paylink/backend --region "$REGION" --since 5m 2>&1 | rg 'seed-demo|AWS demo|ok |Error|Traceback' | tail -20
[[ "$EXIT" == "0" ]] || exit 1

CF_URL="$(terraform -chdir="$TF_DIR" output -raw cloudfront_url)"
for user in sai siddhardth; do
  code="$(curl -sS -o /tmp/demo-$user.json -w '%{http_code}' -X POST "$CF_URL/api/auth/demo" \
    -H 'Content-Type: application/json' -H "Origin: $CF_URL" \
    -d "{\"username\":\"$user\"}")"
  echo "$user -> HTTP $code $(cat /tmp/demo-$user.json)"
  [[ "$code" == "200" ]] || exit 1
done
echo "Quick-test profiles ready on $CF_URL"

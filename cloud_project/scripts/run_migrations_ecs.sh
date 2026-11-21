#!/usr/bin/env bash
# Build migrate image, push to ECR, run one-off Fargate task in private app subnets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TF_DIR="$(cd "$(dirname "$0")/../terraform" && pwd)"
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REPO="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/paylink-backend"
SECRET_ARN="$(terraform -chdir="$TF_DIR" output -raw app_secret_arn)"
SUBNETS="$(terraform -chdir="$TF_DIR" output -json app_subnet_ids | python3 -c 'import json,sys; print(",".join(json.load(sys.stdin)))')"
SG="$(aws ec2 describe-security-groups --region "$REGION" --filters Name=tag:Name,Values=paylink-ecs-backend-sg --query 'SecurityGroups[0].GroupId' --output text)"
EXEC_ROLE="$(aws iam get-role --role-name paylink-ecs-execution --query 'Role.Arn' --output text)"
TASK_ROLE="$(aws iam get-role --role-name paylink-ecs-task --query 'Role.Arn' --output text)"

# Derive URLs: admin ALWAYS from master username/password fields (database_url may
# already point at paylink_api after a prior bootstrap).
SECRET_JSON="$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_ARN" --query SecretString --output text)"
ADMIN_URL="$(python3 -c "import json,sys; s=json.loads(sys.argv[1]); print(f\"postgresql://{s['username']}:{s['password']}@{s['host']}:{s['port']}/{s['dbname']}\")" "$SECRET_JSON")"
API_PASS="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(24))
PY
)"
API_URL="$(python3 - <<PY
import json
s=json.loads('''$SECRET_JSON''')
print(f"postgresql://paylink_api:{'''$API_PASS'''}@{s['host']}:{s['port']}/{s['dbname']}")
PY
)"

echo "Building migrate image..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
docker build --platform linux/arm64 -f "$ROOT/cloud_project/docker/migrate.Dockerfile" -t "${REPO}:migrate" "$ROOT"
docker push "${REPO}:migrate"

TD_FILE="$(mktemp)"
cat > "$TD_FILE" <<EOF
{
  "family": "paylink-migrate",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "${EXEC_ROLE}",
  "taskRoleArn": "${TASK_ROLE}",
  "runtimePlatform": {"operatingSystemFamily": "LINUX", "cpuArchitecture": "ARM64"},
  "containerDefinitions": [{
    "name": "migrate",
    "image": "${REPO}:migrate",
    "essential": true,
    "environment": [
      {"name": "ADMIN_DATABASE_URL", "value": "${ADMIN_URL}"},
      {"name": "DATABASE_URL", "value": "${API_URL}"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/paylink/backend",
        "awslogs-region": "${REGION}",
        "awslogs-stream-prefix": "migrate"
      }
    }
  }]
}
EOF

TD_ARN="$(aws ecs register-task-definition --region "$REGION" --cli-input-json "file://${TD_FILE}" --query 'taskDefinition.taskDefinitionArn' --output text)"
rm -f "$TD_FILE"
echo "Registered $TD_ARN"

TASK_ARN="$(aws ecs run-task --region "$REGION" \
  --cluster paylink-cluster \
  --launch-type FARGATE \
  --task-definition paylink-migrate \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG}],assignPublicIp=DISABLED}" \
  --query 'tasks[0].taskArn' --output text)"
echo "Started $TASK_ARN"

echo "Waiting for migrate task to stop..."
aws ecs wait tasks-stopped --region "$REGION" --cluster paylink-cluster --tasks "$TASK_ARN"
EXIT="$(aws ecs describe-tasks --region "$REGION" --cluster paylink-cluster --tasks "$TASK_ARN" --query 'tasks[0].containers[0].exitCode' --output text)"
REASON="$(aws ecs describe-tasks --region "$REGION" --cluster paylink-cluster --tasks "$TASK_ARN" --query 'tasks[0].stoppedReason' --output text)"
echo "exit=${EXIT} reason=${REASON}"
aws logs tail /ecs/paylink/backend --region "$REGION" --since 10m 2>&1 | rg -i 'migrate|Migration|Error|Traceback|applied' | tail -30

if [[ "$EXIT" != "0" ]]; then
  echo "Migration failed"
  exit 1
fi

# Point app secret database_url at paylink_api for least privilege
UPDATED="$(python3 - <<PY
import json, os
s=json.loads('''$SECRET_JSON''')
s['database_url'] = '''$API_URL'''
s['api_username'] = 'paylink_api'
print(json.dumps(s))
PY
)"
aws secretsmanager put-secret-value --region "$REGION" --secret-id "$SECRET_ARN" --secret-string "$UPDATED" >/dev/null
echo "Updated secret database_url to paylink_api"

aws ecs update-service --region "$REGION" --cluster paylink-cluster --service paylink-backend --force-new-deployment >/dev/null
echo "Backend redeployed to pick up paylink_api credentials."

# Quick-test UI buttons require sai/siddhardth rows — always seed after migrate so a
# fresh terraform destroy/apply + migrate cycle cannot leave demo login as 503.
echo "Seeding quick-test demo profiles (sai / siddhardth)..."
"$ROOT/cloud_project/scripts/seed_demo_ecs.sh"

#!/usr/bin/env bash
set -euo pipefail

TF_DIR="$(cd "$(dirname "$0")/../terraform" && pwd)"
tf() { terraform -chdir="$TF_DIR" "$@"; }

REGION="$(tf output -json build_config | python3 -c 'import json,sys; print(json.load(sys.stdin)["region"])')"
CLUSTER="$(tf output -raw ecs_cluster_name)"
TASK_DEFINITION="$(tf output -raw bootstrap_task_definition_arn)"
NETWORK="$(tf output -json bootstrap_network_configuration)"

TASK="$(aws ecs run-task --region "$REGION" --cluster "$CLUSTER" --launch-type FARGATE \
  --task-definition "$TASK_DEFINITION" --network-configuration "$NETWORK" \
  --query 'tasks[0].taskArn' --output text)"
if [[ -z "$TASK" || "$TASK" == "None" ]]; then
  echo 'ECS did not start the bootstrap task.' >&2
  exit 1
fi

aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK"
STATUS="$(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK" \
  --query 'tasks[0].containers[0].exitCode' --output text)"
if [[ "$STATUS" != "0" ]]; then
  echo "Bootstrap did not succeed (task $TASK, exit $STATUS); check the ECS reason and bootstrap CloudWatch log stream." >&2
  exit 1
fi
echo "Database bootstrap completed: $TASK (exit 0)."

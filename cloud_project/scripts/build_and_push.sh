#!/usr/bin/env bash
# Build PayLink images and push to the ECR repos created by Terraform.
# Requires: docker, aws cli, terraform state with ECR + (optionally) ECS outputs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TF_DIR="$(cd "$(dirname "$0")/../terraform" && pwd)"
REGION="${AWS_REGION:-us-east-1}"

FRONTEND_REPO="$(terraform -chdir="$TF_DIR" output -raw ecr_frontend_repository_url)"
BACKEND_REPO="$(terraform -chdir="$TF_DIR" output -raw ecr_backend_repository_url)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

if [[ -z "$FRONTEND_REPO" || -z "$BACKEND_REPO" || "$FRONTEND_REPO" == "null" ]]; then
  echo "ECR repository outputs missing. Apply Terraform (at least ECR) first."
  exit 1
fi

echo "Logging into ECR ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com ..."
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

TAG="${IMAGE_TAG:-latest}"

echo "Building frontend → ${FRONTEND_REPO}:${TAG}"
docker build \
  -f "$ROOT/cloud_project/docker/frontend.Dockerfile" \
  -t "${FRONTEND_REPO}:${TAG}" \
  "$ROOT"
docker push "${FRONTEND_REPO}:${TAG}"

echo "Building backend → ${BACKEND_REPO}:${TAG}"
docker build \
  -f "$ROOT/backend/Dockerfile" \
  -t "${BACKEND_REPO}:${TAG}" \
  "$ROOT"
docker push "${BACKEND_REPO}:${TAG}"

if CLUSTER="$(terraform -chdir="$TF_DIR" output -raw ecs_cluster_name 2>/dev/null)"; then
  echo "Forcing new ECS deployments on cluster ${CLUSTER} ..."
  aws ecs update-service --region "$REGION" --cluster "$CLUSTER" --service paylink-frontend --force-new-deployment >/dev/null || true
  aws ecs update-service --region "$REGION" --cluster "$CLUSTER" --service paylink-backend --force-new-deployment >/dev/null || true
fi

if URL="$(terraform -chdir="$TF_DIR" output -raw cloudfront_url 2>/dev/null)"; then
  echo "Public URL: ${URL}"
fi
echo "Done."
echo
echo "NEXT (required after apply/destroy): seed schema + Sai/Siddhardth quick-test profiles:"
echo "  $(cd "$(dirname "$0")" && pwd)/bootstrap_aws_data.sh"
echo "Without that step, Quick test sign-in returns 503."

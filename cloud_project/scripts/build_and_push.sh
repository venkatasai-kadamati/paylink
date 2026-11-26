#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TF_DIR="$ROOT/cloud_project/terraform"
tf() { terraform -chdir="$TF_DIR" "$@"; }

FRONTEND_REPO="$(tf output -raw ecr_frontend_repository_url)"
BACKEND_REPO="$(tf output -raw ecr_backend_repository_url)"
IFS=' ' read -r REGION TAG DEMO < <(
  tf output -json build_config | python3 -c '
import json, sys
config = json.load(sys.stdin)
print(config["region"], config["image_tag"], config["public_demo_enabled"])
'
)

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${FRONTEND_REPO%%/*}"

docker buildx build --platform linux/arm64 --push \
  --build-arg "NEXT_PUBLIC_DEMO_ENABLED=$DEMO" \
  -f "$ROOT/cloud_project/docker/frontend.Dockerfile" -t "$FRONTEND_REPO:$TAG" "$ROOT"
docker buildx build --platform linux/arm64 --push --target app \
  -f "$ROOT/backend/Dockerfile" -t "$BACKEND_REPO:$TAG" "$ROOT"
docker buildx build --platform linux/arm64 --push \
  -f "$ROOT/cloud_project/docker/migrate.Dockerfile" -t "$BACKEND_REPO:$TAG-bootstrap" "$ROOT"

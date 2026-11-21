#!/usr/bin/env bash
# Safe helper: init + plan only. Never applies.
set -euo pipefail
TF_DIR="$(cd "$(dirname "$0")/../terraform" && pwd)"
cd "$TF_DIR"

if [[ ! -f terraform.tfvars ]]; then
  echo "Missing terraform.tfvars — copy terraform.tfvars.example and edit first."
  exit 1
fi

terraform init -upgrade
terraform fmt -check=false -recursive
terraform validate
terraform plan -out=tfplan
echo
echo "Plan written to terraform/tfplan"
echo "Review carefully. Apply ONLY when ready:  terraform apply tfplan"

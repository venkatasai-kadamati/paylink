#!/usr/bin/env bash
# Safe helper: init + plan only. Never applies.
set -euo pipefail
TF_DIR="$(cd "$(dirname "$0")/../terraform" && pwd)"
cd "$TF_DIR"

if [[ ! -f terraform.tfvars ]]; then
  echo "Missing terraform.tfvars — copy terraform.tfvars.example and edit first."
  exit 1
fi

terraform fmt -check -recursive
terraform validate
umask 077
terraform plan -input=false -lock=false -out=tfplan "$@"
echo
echo "Plan written to terraform/tfplan"
echo "Review carefully; obtain explicit approval and re-plan with locking before deployment."

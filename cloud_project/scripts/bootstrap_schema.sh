#!/usr/bin/env bash
# Compatibility wrapper — use bootstrap_aws_data.sh (migrations + banks + demo profiles).
set -euo pipefail
exec "$(cd "$(dirname "$0")" && pwd)/bootstrap_aws_data.sh"

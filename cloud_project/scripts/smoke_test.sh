#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLOUD="$ROOT/cloud_project"
NETWORK="paylink-cloud-smoke-$$"
APP_ORIGIN="http://127.0.0.1:${SMOKE_PORT:-3300}"
export APP_ORIGIN
export POSTGRES_PASSWORD="$(python3 -c 'from secrets import token_hex; print(token_hex(24))')"
export JWT_SECRET="$(python3 -c 'from secrets import token_hex; print(token_hex(48))')"
export DATABASE_URL="postgresql://paylink_api:$(python3 -c 'from secrets import token_hex; print(token_hex(24))')@db/postgres"
export ADMIN_DATABASE_URL="postgresql://postgres:$POSTGRES_PASSWORD@db/postgres"

cleanup() {
  docker rm -fv "$NETWORK-edge" "$NETWORK-frontend" "$NETWORK-backend" "$NETWORK-db" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null
}

docker network create "$NETWORK" >/dev/null
trap cleanup EXIT
docker run -d --network "$NETWORK" --network-alias db --name "$NETWORK-db" \
  -e POSTGRES_PASSWORD postgres:16-alpine >/dev/null
for ((i=0; i<60; i++)); do
  if docker exec "$NETWORK-db" pg_isready -h 127.0.0.1 -U postgres >/dev/null; then
    break
  fi
  sleep 1
done
docker exec "$NETWORK-db" pg_isready -h 127.0.0.1 -U postgres

for attempt in 1 2; do
  docker run --rm --network "$NETWORK" -e ADMIN_DATABASE_URL -e DATABASE_URL \
    -e PUBLIC_DEMO_ENABLED=true paylink-cloud-smoke-bootstrap
  echo "Bootstrap attempt $attempt succeeded against local PostgreSQL."
done
docker run -d --network "$NETWORK" --network-alias backend --name "$NETWORK-backend" \
  -e DATABASE_URL -e APP_ORIGIN -e JWT_SECRET -e PUBLIC_DEMO_ENABLED=true \
  paylink-cloud-smoke-backend >/dev/null
docker run -d --network "$NETWORK" --network-alias frontend --name "$NETWORK-frontend" \
  paylink-cloud-smoke-frontend >/dev/null
docker run -d --network "$NETWORK" --name "$NETWORK-edge" \
  -v "$CLOUD/docker/smoke-nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -p "127.0.0.1:${SMOKE_PORT:-3300}:80" nginx:alpine >/dev/null

"${PYTHON_BIN:-$ROOT/.venv/bin/python}" - "$APP_ORIGIN" <<'PY'
import json
import os
import sys
import time
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

url = sys.argv[1]
for _ in range(45):
    try:
        with urlopen(url + "/api/health", timeout=2) as response:
            assert json.load(response) == {"status": "ok", "database": "connected", "simulation": True}
        break
    except URLError:
        time.sleep(1)
else:
    raise SystemExit("Container API did not reach healthy state.")

with sync_playwright() as playwright:
    executable = os.environ.get("CHROMIUM_EXECUTABLE_PATH")
    browser = playwright.chromium.launch(executable_path=executable)
    for button, heading in (("Sai", "Sai"), ("Siddhardth", "Siddhardth")):
        page = browser.new_page()
        page.goto(url)
        page.get_by_role("button", name=f"Sign in as {button}").click()
        expect(page.get_by_role("heading", name=f"Hello, {heading}.")).to_be_visible()
        with page.expect_response(lambda res: urlsplit(res.url).path == "/api/workspace" and res.ok):
            page.reload()
        expect(page.get_by_role("heading", name=f"Hello, {heading}.")).to_be_visible()
        assert page.request.get(url + "/api/insights").ok
        page.close()
        print(f"PASS: {button} demo sign-in, session reload, and insights from packaged services")
    browser.close()
print("PASS: routed frontend, API health and restricted PostgreSQL connection")
PY

#!/bin/bash

# Deployment validation for the current production health contract.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TARGET_URL="${DEPLOYMENT_URL:-https://www.sploot.app}"
TARGET_URL="${TARGET_URL%/}"
HEALTH_URL="${TARGET_URL}/api/health"
HEALTH_BODY=""

trap 'rm -f "${HEALTH_BODY:-}"' EXIT

print_status() {
  if [ "$1" = "pass" ]; then
    echo -e "${GREEN}ok${NC} $2"
  elif [ "$1" = "fail" ]; then
    echo -e "${RED}fail${NC} $2"
    exit 1
  else
    echo -e "${YELLOW}warn${NC} $2"
  fi
}

require_command() {
  if ! command -v "$1" > /dev/null 2>&1; then
    print_status "fail" "$1 is required"
  fi
}

echo "validating deployment: ${TARGET_URL}"
echo ""

require_command curl
require_command node

echo "checking production environment variables..."
REQUIRED_VARS=(
  "DATABASE_URL"
  "CANARY_ENDPOINT"
  "CANARY_API_KEY"
  "CANARY_SERVICE_NAME"
  "CLERK_SECRET_KEY"
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
)

if command -v vercel > /dev/null 2>&1; then
  VERCEL_ENV_OUTPUT="$(vercel env ls production 2>&1 || true)"
  if echo "$VERCEL_ENV_OUTPUT" | grep -qi "error"; then
    print_status "warn" "could not read Vercel production env; skipping env presence checks"
  else
    for var in "${REQUIRED_VARS[@]}"; do
      if echo "$VERCEL_ENV_OUTPUT" | grep -Eq "(^|[[:space:]])${var}([[:space:]]|$)"; then
        print_status "pass" "$var is set"
      else
        print_status "fail" "$var is missing"
      fi
    done
  fi
else
  print_status "warn" "vercel CLI unavailable; skipping env presence checks"
fi

echo ""
echo "checking /api/health..."
HEALTH_BODY="$(mktemp)"
HTTP_STATUS="$(curl -sS -w "%{http_code}" -o "$HEALTH_BODY" "$HEALTH_URL" || true)"

if [ "$HTTP_STATUS" != "200" ]; then
  cat "$HEALTH_BODY" >&2 || true
  print_status "fail" "health endpoint returned HTTP ${HTTP_STATUS}"
fi

node - "$HEALTH_BODY" <<'NODE'
const fs = require('node:fs');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const failures = [];

if (payload.status !== 'ok') {
  failures.push(`status=${payload.status}`);
}

if (payload.dependencies?.database !== 'up') {
  failures.push(`dependencies.database=${payload.dependencies?.database}`);
}

if (payload.dependencies?.redis !== 'up') {
  failures.push(`dependencies.redis=${payload.dependencies?.redis}`);
}

if (payload.diagnostics?.database_url_configured !== true) {
  failures.push('diagnostics.database_url_configured is not true');
}

if (payload.diagnostics?.prisma_connection_test !== true) {
  failures.push('diagnostics.prisma_connection_test is not true');
}

if (payload.diagnostics?.env_vars?.DATABASE_URL !== 'configured') {
  failures.push('diagnostics.env_vars.DATABASE_URL is not configured');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const latency = payload.diagnostics?.connection_latency_ms;
console.log(`health schema ok; database latency=${latency ?? 'unknown'}ms`);
NODE

print_status "pass" "health endpoint matches current schema"

echo ""
echo "checking Neon integration..."
if command -v vercel > /dev/null 2>&1 && vercel integration ls 2>&1 | grep -q "neon.*Available"; then
  print_status "pass" "Neon integration installed"
else
  print_status "warn" "Neon integration not found or vercel CLI unavailable"
fi

echo ""
echo "checking Neon branches..."
if command -v neonctl > /dev/null 2>&1 && [ -n "${NEON_API_KEY:-}" ]; then
  BRANCHES="$(neonctl branches list --project-id "lively-lake-63852609" --api-key "$NEON_API_KEY" --output json 2>&1)"

  if echo "$BRANCHES" | grep -q '"name":"main"'; then
    print_status "pass" "production branch main exists"
  else
    print_status "fail" "production branch main missing"
  fi

  if echo "$BRANCHES" | grep -q '"name":"development"'; then
    print_status "pass" "development branch exists"
  else
    print_status "warn" "development branch not found"
  fi
else
  print_status "warn" "neonctl unavailable or NEON_API_KEY unset"
fi

echo ""
echo "checking TypeScript..."
if pnpm type-check > /dev/null 2>&1; then
  print_status "pass" "TypeScript compilation successful"
else
  print_status "fail" "TypeScript compilation errors"
fi

echo ""
echo -e "${GREEN}deployment validation passed${NC}"

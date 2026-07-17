#!/bin/bash

set -euo pipefail

TARGET_URL="${DEPLOYMENT_URL:-https://www.sploot.app}"
TARGET_URL="${TARGET_URL%/}"

# The signed QA-local proof path is deliberately impossible to enable in a
# DigitalOcean production validation environment. A flag/header/cookie alone
# never authorizes it; production must fail closed before any network probe.
if [[ "${DEPLOYMENT_ENV:-production}" == "production" && "${SPLOOT_QA_EVIDENCE_MODE:-}" == "enabled" ]]; then
  echo "deployment validation rejects SPLOOT_QA_EVIDENCE_MODE in production" >&2
  exit 1
fi

HEALTH_BODY="$(mktemp)"
trap 'rm -f "$HEALTH_BODY"' EXIT

command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }

HTTP_STATUS="$(curl -sS -w '%{http_code}' -o "$HEALTH_BODY" "$TARGET_URL/api/health" || true)"
if [[ "$HTTP_STATUS" != "200" ]]; then
  cat "$HEALTH_BODY" >&2 || true
  echo "health endpoint returned HTTP $HTTP_STATUS" >&2
  exit 1
fi

node - "$HEALTH_BODY" <<'NODE'
const fs = require('node:fs');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const failures = [];

if (payload.status !== 'ok') failures.push(`status=${payload.status}`);
if (payload.dependencies?.database !== 'up') {
  failures.push(`dependencies.database=${payload.dependencies?.database}`);
}
if (payload.dependencies?.embedding_limiter !== 'up') {
  failures.push(`dependencies.embedding_limiter=${payload.dependencies?.embedding_limiter}`);
}
if (payload.dependencies?.share_slug_cache !== 'local') {
  failures.push(`dependencies.share_slug_cache=${payload.dependencies?.share_slug_cache}`);
}
if (payload.diagnostics?.database_url_configured !== true) {
  failures.push('diagnostics.database_url_configured is not true');
}
if (payload.diagnostics?.prisma_connection_test !== true) {
  failures.push('diagnostics.prisma_connection_test is not true');
}
if (payload.diagnostics?.embedding_limiter_schema !== true) {
  failures.push('diagnostics.embedding_limiter_schema is not true');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  status: payload.status,
  database: payload.dependencies.database,
  embedding_limiter: payload.dependencies.embedding_limiter,
  share_slug_cache: payload.dependencies.share_slug_cache,
  canary_configured: payload.diagnostics?.canary_configured ?? null,
  version: payload.version ?? null,
}));
NODE

echo "deployment validation passed: $TARGET_URL"

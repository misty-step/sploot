#!/usr/bin/env bash
set -euo pipefail

# Runs prisma migrate status against prod (read-only) to detect drift.
# Requires PROD_DB_URL environment variable.

if [ -z "${PROD_DB_URL:-}" ]; then
  echo "PROD_DB_URL environment variable not set" >&2
  exit 1
fi

echo "🔎 Checking drift against PROD_DB_URL"
POSTGRES_URL="$PROD_DB_URL" \
POSTGRES_URL_NON_POOLING="$PROD_DB_URL" \
pnpm prisma migrate status --schema prisma/schema.prisma

#!/usr/bin/env bash
set -euo pipefail

# Runs prisma migrate status against prod (read-only) to detect drift.
# Uses URLs from config/database.env.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/config/database.env"

if [ ! -f "$CONFIG" ]; then
  echo "config/database.env missing" >&2
  exit 1
fi

env "$(<"$CONFIG" sed 's/#.*//g')" bash -c '
  if [ -z "$PROD_DB_URL" ]; then
    echo "PROD_DB_URL not set" >&2
    exit 1
  fi
  echo "🔎 Checking drift against PROD_DB_URL"
  npx prisma migrate status --schema prisma/schema.prisma --url "$PROD_DB_URL"
'


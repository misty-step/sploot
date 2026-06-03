#!/usr/bin/env bash
set -euo pipefail

# Sync DB URLs from environment variables into Vercel envs.
# Usage:
#   DATABASE_URL=... DATABASE_URL_DIRECT=... scripts/db-sync-env.sh prod
#   DATABASE_URL=... DATABASE_URL_DIRECT=... scripts/db-sync-env.sh preview
#
# Requires: vercel CLI logged in, project linked, env vars set.

target="${1:-}"
case "$target" in
  prod|production) vercel_env="production" ;;
  preview) vercel_env="preview" ;;
  *) echo "Usage: db-sync-env.sh prod|preview" >&2; exit 1 ;;
esac

url="${DATABASE_URL:-}"
url_direct="${DATABASE_URL_DIRECT:-}"

if [ -z "$url" ] || [ -z "$url_direct" ]; then
  echo "DATABASE_URL and DATABASE_URL_DIRECT must be set" >&2
  exit 1
fi

echo "👉 syncing $vercel_env env..."
printf "%s" "$url" | vercel env add DATABASE_URL "$vercel_env" --force >/dev/null
printf "%s" "$url_direct" | vercel env add DATABASE_URL_DIRECT "$vercel_env" --force >/dev/null

echo "✅ synced $vercel_env DB URLs"

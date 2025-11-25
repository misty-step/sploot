#!/usr/bin/env bash
set -euo pipefail

# Sync DB URLs from environment variables into Vercel envs.
# Usage:
#   POSTGRES_URL=... POSTGRES_URL_NON_POOLING=... scripts/db-sync-env.sh prod
#   POSTGRES_URL=... POSTGRES_URL_NON_POOLING=... scripts/db-sync-env.sh preview
#
# Requires: vercel CLI logged in, project linked, env vars set.

target="${1:-}"
case "$target" in
  prod|production) vercel_env="production" ;;
  preview) vercel_env="preview" ;;
  *) echo "Usage: db-sync-env.sh prod|preview" >&2; exit 1 ;;
esac

url="${POSTGRES_URL:-}"
url_np="${POSTGRES_URL_NON_POOLING:-}"

if [ -z "$url" ] || [ -z "$url_np" ]; then
  echo "POSTGRES_URL and POSTGRES_URL_NON_POOLING must be set" >&2
  exit 1
fi

echo "👉 syncing $vercel_env env..."
printf "%s" "$url" | vercel env add POSTGRES_URL "$vercel_env" --force >/dev/null
printf "%s" "$url_np" | vercel env add POSTGRES_URL_NON_POOLING "$vercel_env" --force >/dev/null
# keep aliases used in code
printf "%s" "$url" | vercel env add POSTGRES_DATABASE_URL "$vercel_env" --force >/dev/null
printf "%s" "$url_np" | vercel env add POSTGRES_DATABASE_URL_UNPOOLED "$vercel_env" --force >/dev/null

echo "✅ synced $vercel_env DB URLs"

#!/usr/bin/env bash
set -euo pipefail

# Sync canonical DB URLs from config/database.env into Vercel envs.
# Usage:
#   scripts/db-sync-env.sh prod
#   scripts/db-sync-env.sh preview
#
# Requires: vercel CLI logged in, project linked, config/database.env present.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/config/database.env"

if [ ! -f "$CONFIG" ]; then
  echo "config/database.env missing" >&2
  exit 1
fi

env "$(<"$CONFIG" sed 's/#.*//g')" bash -c '
  target="$1"
  case "$target" in
    prod|production) vercel_env="production" ;;
    preview) vercel_env="preview" ;;
    *) echo "target must be prod|preview" >&2; exit 1 ;;
  esac

  if [ "$vercel_env" = "production" ]; then
    url="$PROD_DB_URL"; url_np="$PROD_DB_URL_NON_POOLING"
  else
    url="$PREVIEW_DB_URL"; url_np="$PREVIEW_DB_URL_NON_POOLING"
  fi

  if [ -z "$url" ] || [ -z "$url_np" ]; then
    echo "DB URLs not set for $vercel_env" >&2
    exit 1
  fi

  echo "👉 syncing $vercel_env env to $url"
  printf "%s" "$url" | vercel env add POSTGRES_URL "$vercel_env" --force >/dev/null
  printf "%s" "$url_np" | vercel env add POSTGRES_URL_NON_POOLING "$vercel_env" --force >/dev/null
  # keep aliases used in code
  printf "%s" "$url" | vercel env add POSTGRES_DATABASE_URL "$vercel_env" --force >/dev/null
  printf "%s" "$url_np" | vercel env add POSTGRES_DATABASE_URL_UNPOOLED "$vercel_env" --force >/dev/null
  printf "%s" "$url" | vercel env add POSTGRES_PGHOST "$vercel_env" --force >/dev/null
  printf "%s" "$url_np" | vercel env add POSTGRES_PGHOST_UNPOOLED "$vercel_env" --force >/dev/null

  echo "✅ synced $vercel_env DB URLs"
' _ "$1"


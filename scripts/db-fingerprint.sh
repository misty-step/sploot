#!/usr/bin/env bash
set -euo pipefail

# Prints DB fingerprint (host/branch) + migration hash from prisma/migrations
# Uses current process env (POSTGRES_URL) by default.

url="${POSTGRES_URL:-}"
if [ -z "$url" ]; then
  echo "POSTGRES_URL not set in env" >&2
  exit 1
fi

host="$(python3 - <<'PY' "$url"
import os
from urllib.parse import urlparse
url = os.environ["url"]
p = urlparse(url)
print(p.hostname or "")
PY
)"

mig_hash="$(find prisma/migrations -maxdepth 1 -type d -not -path '*/.*' -printf '%f\n' 2>/dev/null | LC_ALL=C sort | sha256sum | cut -c1-12)"

echo "db_host=$host"
echo "migration_hash=$mig_hash"


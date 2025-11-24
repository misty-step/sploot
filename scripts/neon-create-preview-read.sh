#!/usr/bin/env bash
set -euo pipefail

# Create/read-only preview branch from master for Vercel previews.
# Requires: neonctl, NEON_API_KEY, NEON_PROJECT_ID, NEON_PARENT_BRANCH (e.g., master).

NEON_PARENT_BRANCH=${NEON_PARENT_BRANCH:-master}
NEON_PREVIEW_BRANCH=${NEON_PREVIEW_BRANCH:-preview-read}

for var in NEON_API_KEY NEON_PROJECT_ID; do
  if [ -z "${!var:-}" ]; then
    echo "$var is required" >&2
    exit 1
  fi
done

echo "Ensuring Neon preview branch '$NEON_PREVIEW_BRANCH' (from $NEON_PARENT_BRANCH, read-only)..."
if neonctl branches list --project-id "$NEON_PROJECT_ID" --api-key "$NEON_API_KEY" --output json | grep -q "\"name\":\"$NEON_PREVIEW_BRANCH\""; then
  echo "Branch already exists."
else
  neonctl branches create \
    --project-id "$NEON_PROJECT_ID" \
    --api-key "$NEON_API_KEY" \
    --name "$NEON_PREVIEW_BRANCH" \
    --parent "$NEON_PARENT_BRANCH" \
    --read-only
  echo "Created branch $NEON_PREVIEW_BRANCH"
fi

echo "Fetch connection strings..."
neonctl connection-string \
  --project-id "$NEON_PROJECT_ID" \
  --api-key "$NEON_API_KEY" \
  --branch "$NEON_PREVIEW_BRANCH" \
  --role "neondb_owner"

echo "Update config/database.env with the preview branch URL and run: pnpm db:sync preview"


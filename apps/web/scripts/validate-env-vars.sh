#!/usr/bin/env bash
# Pre-commit validation: Ensure DATABASE_URL is used, not deprecated POSTGRES_URL

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

ERRORS=0

# Check 1: DATABASE_URL exists in .env.example
if ! grep -q "^DATABASE_URL=" .env.example 2>/dev/null; then
  echo -e "${RED}✗ DATABASE_URL not found in .env.example${NC}"
  echo "  Add: DATABASE_URL=postgresql://user:pass@host-pooler.neon.tech/db?sslmode=require&pgbouncer=true"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✓ DATABASE_URL found in .env.example${NC}"
fi

# Check 2: No references to POSTGRES_URL in TypeScript code (except comments/docs)
# Exclude: comments, markdown, test fixtures, migration files
# Also exclude env.ts (historical note) and validate-env.ts (checks for deprecated vars)
POSTGRES_URL_REFS=$(grep -r "POSTGRES_URL" \
  --include="*.ts" \
  --include="*.tsx" \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=dist \
  --exclude="*.test.ts" \
  --exclude="*.test.tsx" \
  --exclude="TODO.md" \
  --exclude="INVESTIGATION.md" \
  --exclude="ISSUE.md" \
  --exclude="BACKLOG.md" \
  --exclude="*.md" \
  --exclude="env.ts" \
  --exclude="validate-env.ts" \
  . 2>/dev/null | grep -v "^[[:space:]]*\/\/" | grep -v "^[[:space:]]*\*" || true)

if [ -n "$POSTGRES_URL_REFS" ]; then
  echo -e "${RED}✗ Found references to deprecated POSTGRES_URL in code:${NC}"
  echo "$POSTGRES_URL_REFS" | head -10
  echo ""
  echo "  Use DATABASE_URL instead (Prisma standard)"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✓ No deprecated POSTGRES_URL references in code${NC}"
fi

# Check 3: Warn if POSTGRES_URL found in documentation (not blocking)
DOC_REFS=$(grep -r "POSTGRES_URL" \
  --include="*.md" \
  --exclude="TODO.md" \
  --exclude="INVESTIGATION.md" \
  --exclude="BACKLOG.md" \
  . 2>/dev/null || true)

if [ -n "$DOC_REFS" ]; then
  echo -e "${YELLOW}⚠ Found POSTGRES_URL in documentation (consider updating):${NC}"
  echo "$DOC_REFS" | head -5
fi

# Exit with error if any checks failed
if [ $ERRORS -gt 0 ]; then
  echo ""
  echo -e "${RED}Environment variable validation failed with $ERRORS error(s)${NC}"
  exit 1
fi

echo -e "${GREEN}✓ All environment variable checks passed${NC}"
exit 0

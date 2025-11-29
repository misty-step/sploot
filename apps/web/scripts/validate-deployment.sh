#!/bin/bash

# Deployment Validation Script
# Checks critical system components before promoting deployment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Validating deployment..."
echo ""

# Function to print status
print_status() {
  if [ "$1" = "pass" ]; then
    echo -e "${GREEN}✓${NC} $2"
  elif [ "$1" = "fail" ]; then
    echo -e "${RED}✗${NC} $2"
    exit 1
  else
    echo -e "${YELLOW}⚠${NC} $2"
  fi
}

# 1. Check environment variables
echo "📋 Checking environment variables..."
REQUIRED_VARS=("POSTGRES_URL" "POSTGRES_URL_NON_POOLING" "SENTRY_DSN" "NEXT_PUBLIC_SENTRY_DSN" "CLERK_SECRET_KEY" "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")

for var in "${REQUIRED_VARS[@]}"; do
  if vercel env ls production 2>&1 | grep -q "^$var"; then
    print_status "pass" "$var is set"
  else
    print_status "fail" "$var is missing"
  fi
done

echo ""

# 2. Check database connectivity
echo "🗄️  Checking database connectivity..."
HEALTH_RESPONSE=$(curl -s https://sploot.app/api/health || echo '{"status":"error"}')

DB_STATUS=$(echo "$HEALTH_RESPONSE" | grep -o '"database":{"status":"[^"]*"' | grep -o 'status":"[^"]*"' | cut -d'"' -f3)

if [ "$DB_STATUS" = "pass" ]; then
  print_status "pass" "Database connection successful"
else
  print_status "fail" "Database connection failed"
fi

echo ""

# 3. Check Sentry configuration
echo "🔭 Checking Sentry configuration..."
SENTRY_STATUS=$(echo "$HEALTH_RESPONSE" | grep -o '"sentry":{"status":"[^"]*"' | grep -o 'status":"[^"]*"' | cut -d'"' -f3)

if [ "$SENTRY_STATUS" = "pass" ]; then
  print_status "pass" "Sentry DSN configured"
else
  print_status "fail" "Sentry DSN not configured"
fi

echo ""

# 4. Check Neon integration
echo "🌿 Checking Neon integration..."
if vercel integration ls 2>&1 | grep -q "neon.*Available"; then
  print_status "pass" "Neon integration installed"
else
  print_status "warn" "Neon integration not found (preview branches won't auto-create)"
fi

echo ""

# 5. Check database branches
echo "🌳 Checking Neon branches..."
if command -v neonctl &> /dev/null && [ -n "$NEON_API_KEY" ]; then
  BRANCHES=$(neonctl branches list --project-id "lively-lake-63852609" --api-key "$NEON_API_KEY" --output json 2>&1)

  if echo "$BRANCHES" | grep -q '"name":"main"'; then
    print_status "pass" "Production branch (main) exists"
  fi

  if echo "$BRANCHES" | grep -q '"name":"development"'; then
    print_status "pass" "Development branch exists"
  else
    print_status "warn" "Development branch not found"
  fi
else
  print_status "warn" "neonctl not available or NEON_API_KEY not set"
fi

echo ""

# 6. Check TypeScript compilation
echo "📝 Checking TypeScript compilation..."
if pnpm type-check > /dev/null 2>&1; then
  print_status "pass" "TypeScript compilation successful"
else
  print_status "fail" "TypeScript compilation errors"
fi

echo ""

# 7. Check health endpoint response time
echo "⚡ Checking health endpoint performance..."
RESPONSE_TIME=$(echo "$HEALTH_RESPONSE" | grep -o '"responseTime":[0-9]*' | cut -d':' -f2)

if [ -n "$RESPONSE_TIME" ]; then
  if [ "$RESPONSE_TIME" -lt 1000 ]; then
    print_status "pass" "Database response time: ${RESPONSE_TIME}ms (< 1s)"
  else
    print_status "warn" "Database response time: ${RESPONSE_TIME}ms (slow)"
  fi
fi

echo ""
echo -e "${GREEN}✅ Deployment validation passed!${NC}"
echo ""
echo "🚀 Safe to promote to production"

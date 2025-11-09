#!/usr/bin/env bash
set -euo pipefail

# Configure Clerk allowed_origins for Chrome Extension via Backend API
# Adds chrome-extension://<ID> to allowed origins without removing existing web origins

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$ROOT_DIR/.env" ]; then
  source "$ROOT_DIR/.env"
else
  echo "❌ Error: .env file not found"
  echo "Run 'pnpm generate:crx-key' first to create .env"
  exit 1
fi

# Check required environment variables
if [ -z "${CLERK_SECRET_KEY:-}" ]; then
  echo "❌ Error: CLERK_SECRET_KEY not set in .env"
  echo ""
  echo "Get your Secret Key from:"
  echo "  https://dashboard.clerk.com/last-active?path=api-keys"
  echo ""
  echo "Add to .env:"
  echo "  CLERK_SECRET_KEY=sk_test_..."
  exit 1
fi

# Calculate extension ID from CRX_PUBLIC_KEY
if [ -z "${CRX_PUBLIC_KEY:-}" ]; then
  echo "❌ Error: CRX_PUBLIC_KEY not set"
  echo "Run 'pnpm generate:crx-key' first"
  exit 1
fi

# Extract extension ID from key file (if it exists)
KEY_FILE="$ROOT_DIR/.crx-key.pem"
if [ ! -f "$KEY_FILE" ]; then
  echo "❌ Error: $KEY_FILE not found"
  echo "Run 'pnpm generate:crx-key' first"
  exit 1
fi

EXTENSION_ID=$(openssl rsa -in "$KEY_FILE" -pubout -outform DER 2>/dev/null | shasum -a 256 | head -c32 | tr 0-9a-f a-p)
EXTENSION_ORIGIN="chrome-extension://$EXTENSION_ID"

echo "🔧 Configuring Clerk for Chrome Extension"
echo ""
echo "Extension ID: $EXTENSION_ID"
echo "Origin: $EXTENSION_ORIGIN"
echo ""

# Fetch current instance settings
echo "→ Fetching current Clerk instance settings..."
INSTANCE_RESPONSE=$(curl -s -X GET "https://api.clerk.com/v1/instance" \
  -H "Authorization: Bearer $CLERK_SECRET_KEY" \
  -H "Content-Type: application/json")

# Check for API errors
if echo "$INSTANCE_RESPONSE" | grep -q '"errors"'; then
  echo "❌ Clerk API Error:"
  echo "$INSTANCE_RESPONSE" | grep -o '"message":"[^"]*"' || echo "$INSTANCE_RESPONSE"
  exit 1
fi

# Extract current allowed_origins (handle null case)
if echo "$INSTANCE_RESPONSE" | grep -q '"allowed_origins":null'; then
  # allowed_origins is null, treat as empty
  CURRENT_ORIGINS="[]"
  ORIGINS_JSON=""
else
  CURRENT_ORIGINS=$(echo "$INSTANCE_RESPONSE" | grep -o '"allowed_origins":\[[^]]*\]' || echo '[]')
  ORIGINS_JSON=$(echo "$CURRENT_ORIGINS" | sed 's/"allowed_origins"://' || echo '')
fi

# Check if extension origin already exists
if echo "$CURRENT_ORIGINS" | grep -q "$EXTENSION_ORIGIN"; then
  echo "✓ Extension origin already configured in Clerk"
  echo ""
  echo "Current allowed_origins:"
  echo "$CURRENT_ORIGINS" | sed 's/,/\n/g'
  echo ""
  echo "✅ No changes needed"
  exit 0
fi

# Handle null or empty allowed_origins
if [ -z "$ORIGINS_JSON" ] || [ "$ORIGINS_JSON" = "null" ]; then
  # null or missing - treat as empty array
  NEW_ORIGINS='["'"$EXTENSION_ORIGIN"'"]'
elif [ "$ORIGINS_JSON" = "[]" ]; then
  # Empty array - just add extension origin
  NEW_ORIGINS='["'"$EXTENSION_ORIGIN"'"]'
else
  # Append to existing origins
  NEW_ORIGINS=$(echo "$ORIGINS_JSON" | sed 's/\]$/,"'"$EXTENSION_ORIGIN"'"]}/')
fi

echo "→ Updating Clerk instance..."
echo "  Adding: $EXTENSION_ORIGIN"
echo ""

# Update instance settings
UPDATE_RESPONSE=$(curl -s -X PATCH "https://api.clerk.com/v1/instance" \
  -H "Authorization: Bearer $CLERK_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"allowed_origins\": $NEW_ORIGINS}")

# Check for errors
if echo "$UPDATE_RESPONSE" | grep -q '"errors"'; then
  echo "❌ Failed to update Clerk instance:"
  echo "$UPDATE_RESPONSE" | grep -o '"message":"[^"]*"' || echo "$UPDATE_RESPONSE"
  exit 1
fi

echo "✅ Clerk Configuration Complete"
echo ""
echo "Updated allowed_origins:"
echo "$NEW_ORIGINS" | sed 's/,/\n/g' | sed 's/\[//g' | sed 's/\]//g' | sed 's/"//g' | sed 's/^/  - /'
echo ""
echo "📝 Next Steps:"
echo "1. Build extension: pnpm build"
echo "2. Load in Chrome: chrome://extensions → Load unpacked → .output/chrome-mv3"
echo "3. Test authentication with sploot.app"
echo ""

#!/usr/bin/env bash
set -euo pipefail

# Generate consistent CRX ID for Chrome Extension
# This creates a stable extension ID that won't change between builds

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
KEY_FILE="$ROOT_DIR/.crx-key.pem"
ENV_FILE="$ROOT_DIR/.env"

echo "🔑 Generating CRX Key Pair..."

# Generate private key if it doesn't exist
if [ -f "$KEY_FILE" ]; then
  echo "✓ Private key already exists: $KEY_FILE"
else
  echo "→ Creating new 2048-bit RSA private key..."
  openssl genrsa 2048 2>/dev/null | openssl pkcs8 -topk8 -nocrypt -out "$KEY_FILE"
  echo "✓ Private key created: $KEY_FILE"
fi

# Generate public key for manifest
echo "→ Extracting public key for manifest..."
PUBLIC_KEY=$(openssl rsa -in "$KEY_FILE" -pubout -outform DER 2>/dev/null | openssl base64 -A)

# Calculate extension ID
echo "→ Calculating extension ID..."
EXTENSION_ID=$(openssl rsa -in "$KEY_FILE" -pubout -outform DER 2>/dev/null | shasum -a 256 | head -c32 | tr 0-9a-f a-p)

echo ""
echo "✅ CRX Key Generation Complete"
echo ""
echo "Extension ID: $EXTENSION_ID"
echo "Origin: chrome-extension://$EXTENSION_ID"
echo ""

# Update or create .env file
if [ -f "$ENV_FILE" ]; then
  # Check if CRX_PUBLIC_KEY already exists
  if grep -q "^CRX_PUBLIC_KEY=" "$ENV_FILE"; then
    # Update existing key
    if [[ "$OSTYPE" == "darwin"* ]]; then
      # macOS
      sed -i '' "s|^CRX_PUBLIC_KEY=.*|CRX_PUBLIC_KEY=\"$PUBLIC_KEY\"|" "$ENV_FILE"
    else
      # Linux
      sed -i "s|^CRX_PUBLIC_KEY=.*|CRX_PUBLIC_KEY=\"$PUBLIC_KEY\"|" "$ENV_FILE"
    fi
    echo "✓ Updated CRX_PUBLIC_KEY in $ENV_FILE"
  else
    # Append to existing .env
    echo "" >> "$ENV_FILE"
    echo "# Chrome Extension CRX ID (auto-generated)" >> "$ENV_FILE"
    echo "CRX_PUBLIC_KEY=\"$PUBLIC_KEY\"" >> "$ENV_FILE"
    echo "✓ Added CRX_PUBLIC_KEY to $ENV_FILE"
  fi
else
  # Create new .env
  cat > "$ENV_FILE" <<EOF
# Chrome Extension CRX ID (auto-generated)
CRX_PUBLIC_KEY="$PUBLIC_KEY"

# Clerk Configuration (local/test)
VITE_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
# Optional API override
# VITE_API_BASE_URL=http://localhost:3001
EOF
  echo "✓ Created $ENV_FILE with CRX_PUBLIC_KEY"
fi

echo ""
echo "📝 Next Steps:"
echo "1. Extension ID will remain stable across builds"
echo "2. Run 'pnpm build' for local/test or 'pnpm build:prod' for chrome-store builds"
echo "3. Add extension ID to Clerk: pnpm setup:clerk"
echo ""

#!/bin/bash

# Sentry Alerts Configuration Script
# Configures alert rules for production monitoring

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for required environment variables
if [ -z "$SENTRY_AUTH_TOKEN" ]; then
  echo -e "${RED}Error: SENTRY_AUTH_TOKEN environment variable not set${NC}"
  echo "Get your auth token from: https://sentry.io/settings/account/api/auth-tokens/"
  exit 1
fi

SENTRY_ORG="misty-step"
SENTRY_PROJECT="sploot"
API_BASE="https://sentry.io/api/0"

echo "🔔 Configuring Sentry Alerts for $SENTRY_PROJECT..."
echo ""

# Function to create alert rule
create_alert_rule() {
  local name="$1"
  local config="$2"

  echo -n "Creating alert: $name... "

  RESPONSE=$(curl -s -X POST \
    "$API_BASE/projects/$SENTRY_ORG/$SENTRY_PROJECT/rules/" \
    -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$config")

  if echo "$RESPONSE" | grep -q '"id"'; then
    RULE_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo -e "${GREEN}✓${NC} (ID: $RULE_ID)"
  else
    ERROR=$(echo "$RESPONSE" | grep -o '"detail":"[^"]*"' | cut -d'"' -f4)
    if echo "$RESPONSE" | grep -q "already exists"; then
      echo -e "${YELLOW}⚠${NC} Already exists"
    else
      echo -e "${RED}✗${NC} $ERROR"
    fi
  fi
}

# 1. New Error Type Alert
echo "📍 Creating New Error Type Alert..."
NEW_ERROR_ALERT=$(cat <<EOF
{
  "name": "Production: New Error Type",
  "actionMatch": "all",
  "filterMatch": "all",
  "conditions": [
    {
      "id": "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition"
    }
  ],
  "filters": [
    {
      "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
      "key": "environment",
      "match": "eq",
      "value": "production"
    }
  ],
  "actions": [
    {
      "id": "sentry.mail.actions.NotifyEmailAction",
      "targetType": "IssueOwners",
      "targetIdentifier": ""
    }
  ],
  "frequency": 30
}
EOF
)
create_alert_rule "New Error Type in Production" "$NEW_ERROR_ALERT"

# 2. User Sync Failure Alert (CRITICAL)
echo "📍 Creating User Sync Failure Alert..."
USER_SYNC_ALERT=$(cat <<EOF
{
  "name": "Production: User Sync Failure (CRITICAL)",
  "actionMatch": "all",
  "filterMatch": "all",
  "conditions": [
    {
      "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
      "interval": "5m",
      "value": 1
    }
  ],
  "filters": [
    {
      "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
      "key": "environment",
      "match": "eq",
      "value": "production"
    },
    {
      "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
      "key": "critical",
      "match": "eq",
      "value": "true"
    },
    {
      "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
      "key": "auth.action",
      "match": "eq",
      "value": "user-sync"
    }
  ],
  "actions": [
    {
      "id": "sentry.mail.actions.NotifyEmailAction",
      "targetType": "IssueOwners",
      "targetIdentifier": ""
    }
  ],
  "frequency": 5
}
EOF
)
create_alert_rule "User Sync Failure (CRITICAL)" "$USER_SYNC_ALERT"

echo ""
echo -e "${GREEN}✅ Alert configuration complete!${NC}"
echo ""
echo "📊 Configure these alerts manually in Sentry UI:"
echo "   - High Error Rate (>10 errors/hour)"
echo "   - Crash-Free Sessions (<98%)"
echo "   Visit: https://sentry.io/organizations/$SENTRY_ORG/alerts/$SENTRY_PROJECT/"
echo ""
echo "💡 Metric alerts require UI configuration due to API limitations"

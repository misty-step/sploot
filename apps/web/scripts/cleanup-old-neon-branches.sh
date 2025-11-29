#!/bin/bash

# Neon Branch Cleanup Helper Script
# This script helps identify and clean up Neon database branches
# that correspond to deleted/merged Git branches

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Neon Database Branch Cleanup Helper          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Check if neonctl is installed
if ! command -v neonctl &> /dev/null; then
    echo -e "${RED}Error: neonctl is not installed${NC}"
    echo "Install it with: npm install -g neonctl"
    echo "Or: brew install neonctl"
    exit 1
fi

# Check if jq is installed for JSON parsing
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Warning: jq is not installed${NC}"
    echo "For better formatting, install jq:"
    echo "  brew install jq  (macOS)"
    echo "  apt-get install jq  (Ubuntu)"
    echo ""
    USE_JQ=false
else
    USE_JQ=true
fi

# Get project ID from environment or prompt
if [ -z "$NEON_PROJECT_ID" ]; then
    echo -e "${YELLOW}NEON_PROJECT_ID not set in environment${NC}"
    echo "You can set it in your .env file or export it:"
    echo "  export NEON_PROJECT_ID=your-project-id"
    echo ""
    read -p "Enter your Neon Project ID: " NEON_PROJECT_ID
fi

echo -e "${BLUE}Using Project ID:${NC} $NEON_PROJECT_ID"
echo ""

# Fetch all Git remote branches
echo -e "${BLUE}Step 1: Fetching Git remote branches...${NC}"
git fetch --all --prune --quiet
GIT_BRANCHES=$(git branch -r | grep -v HEAD | sed 's/origin\///' | sed 's/^  *//')
echo -e "${GREEN}✓ Found $(echo "$GIT_BRANCHES" | wc -l | tr -d ' ') remote Git branches${NC}"
echo ""

# Fetch all Neon branches
echo -e "${BLUE}Step 2: Fetching Neon database branches...${NC}"
if [ "$USE_JQ" = true ]; then
    NEON_BRANCHES=$(neonctl branches list --project-id "$NEON_PROJECT_ID" --output json)
    BRANCH_COUNT=$(echo "$NEON_BRANCHES" | jq '. | length')
    echo -e "${GREEN}✓ Found $BRANCH_COUNT Neon database branches${NC}"
else
    neonctl branches list --project-id "$NEON_PROJECT_ID"
    echo -e "${YELLOW}Note: Install jq for automated analysis${NC}"
    exit 0
fi
echo ""

# Analyze branches
echo -e "${BLUE}Step 3: Analyzing branches...${NC}"
echo ""

DELETABLE_BRANCHES=()
KEEP_BRANCHES=()

echo "$NEON_BRANCHES" | jq -r '.[] | "\(.id)|\(.name)|\(.created_at)"' | while IFS='|' read -r id name created; do
    # Extract PR number if it's a preview branch
    if [[ $name =~ preview/pr-([0-9]+) ]]; then
        PR_NUM="${BASH_REMATCH[1]}"

        # Check if corresponding Git branch exists
        BRANCH_NAME="pull/$PR_NUM"
        if echo "$GIT_BRANCHES" | grep -q "$BRANCH_NAME"; then
            echo -e "  ${GREEN}KEEP${NC}   $name (PR #$PR_NUM still open)"
            KEEP_BRANCHES+=("$name")
        else
            echo -e "  ${RED}DELETE${NC} $name (PR #$PR_NUM merged/closed)"
            DELETABLE_BRANCHES+=("$id|$name|$created")
        fi
    elif [[ $name == "main" ]] || [[ $name == "master" ]]; then
        echo -e "  ${GREEN}KEEP${NC}   $name (main branch)"
        KEEP_BRANCHES+=("$name")
    else
        # Non-preview branch, check if Git branch exists
        if echo "$GIT_BRANCHES" | grep -q "^$name$"; then
            echo -e "  ${YELLOW}KEEP${NC}   $name (Git branch exists)"
            KEEP_BRANCHES+=("$name")
        else
            echo -e "  ${RED}DELETE${NC} $name (no matching Git branch)"
            DELETABLE_BRANCHES+=("$id|$name|$created")
        fi
    fi
done

echo ""
echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Branches to keep: ${#KEEP_BRANCHES[@]}${NC}"
echo -e "${RED}Branches to delete: ${#DELETABLE_BRANCHES[@]}${NC}"
echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo ""

if [ ${#DELETABLE_BRANCHES[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ No branches need cleanup!${NC}"
    exit 0
fi

# Ask for confirmation
echo -e "${YELLOW}The following branches will be deleted:${NC}"
echo ""
for branch_info in "${DELETABLE_BRANCHES[@]}"; do
    IFS='|' read -r id name created <<< "$branch_info"
    echo "  • $name (created: $created)"
done
echo ""

read -p "Do you want to delete these branches? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Cleanup cancelled${NC}"
    exit 0
fi

# Delete branches
echo ""
echo -e "${BLUE}Deleting branches...${NC}"
DELETED_COUNT=0
for branch_info in "${DELETABLE_BRANCHES[@]}"; do
    IFS='|' read -r id name created <<< "$branch_info"
    echo -n "  Deleting $name... "

    if neonctl branches delete "$id" --project-id "$NEON_PROJECT_ID" --force > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((DELETED_COUNT++))
    else
        echo -e "${RED}✗ (failed)${NC}"
    fi
done

echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Deleted $DELETED_COUNT of ${#DELETABLE_BRANCHES[@]} branches${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Check Neon console: https://console.neon.tech"
echo "2. Set up GitHub Actions for automatic cleanup"
echo "3. See docs/NEON_BRANCH_CLEANUP_SETUP.md for details"

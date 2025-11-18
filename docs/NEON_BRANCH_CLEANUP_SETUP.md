# Neon Database Branch Cleanup - Setup Guide

## Overview

This guide explains how to set up automated cleanup of Neon database branches when Git branches are merged. This prevents accumulation of old preview database branches that can cause Vercel deployment failures.

## Problem

- Vercel creates a Neon database branch for each preview deployment
- These branches persist after the Git branch is merged/deleted
- Accumulation of old branches can hit Neon's branch limits (default: 10 branches)
- This causes Vercel build failures: "Failed to provision Neon database resources"

## Solution

We've implemented a GitHub Actions workflow that automatically deletes Neon database branches when pull requests are merged.

## Setup Instructions

### Step 1: Get Your Neon Project ID

You already have this in your Vercel environment variables as `POSTGRES_NEON_PROJECT_ID`.

To view it:
```bash
vercel env ls | grep NEON_PROJECT_ID
```

Or get it from the Neon Console:
1. Go to https://console.neon.tech
2. Select your project
3. Look in the URL: `console.neon.tech/app/projects/[YOUR-PROJECT-ID]`

### Step 2: Generate a Neon API Key

1. Go to https://console.neon.tech/app/settings/api-keys
2. Click "Generate new API key"
3. Name it: `GitHub Actions - Branch Cleanup`
4. Copy the API key (you'll only see it once!)

### Step 3: Add GitHub Secrets

Add two secrets to your GitHub repository:

1. Go to: https://github.com/misty-step/sploot/settings/secrets/actions
2. Click "New repository secret"

#### Secret 1: NEON_API_KEY
- **Name**: `NEON_API_KEY`
- **Value**: The API key from Step 2

#### Secret 2: NEON_PROJECT_ID
- **Name**: `NEON_PROJECT_ID`
- **Value**: Your Neon project ID from Step 1

### Step 4: Verify Branch Naming Pattern

The workflow assumes Neon branches are named: `preview/pr-{number}`

To check your actual branch names:

```bash
# Install Neon CLI if you haven't
npm install -g neonctl

# Login
neonctl auth

# List all branches
neonctl branches list --project-id YOUR_PROJECT_ID
```

If your branches use a different naming pattern, edit `.github/workflows/cleanup-neon-branches.yml` and update the `branch:` field in the delete action.

### Step 5: Clean Up Existing Old Branches

To manually clean up the 10 existing branches from merged feature branches:

```bash
# List all branches to see which ones are old
neonctl branches list --project-id YOUR_PROJECT_ID

# Delete individual branches
neonctl branches delete BRANCH_ID --project-id YOUR_PROJECT_ID

# Or delete by name
neonctl branches delete preview/pr-123 --project-id YOUR_PROJECT_ID
```

**Tips for bulk cleanup:**
```bash
# List all branches and their creation dates
neonctl branches list --project-id YOUR_PROJECT_ID --output json | \
  jq -r '.[] | "\(.id)\t\(.name)\t\(.created_at)"'

# Check which Git branches still exist
git branch -r | grep origin/

# Cross-reference to find branches that can be deleted
```

## How It Works

### Automatic Cleanup Workflow

The workflow (`.github/workflows/cleanup-neon-branches.yml`) triggers when:
- A pull request is **closed** (not just opened or updated)
- AND the PR was **merged** (not just closed without merging)

When triggered, it:
1. Extracts the PR number from the GitHub event
2. Constructs the Neon branch name: `preview/pr-{number}`
3. Calls Neon's API to delete that branch
4. Logs the result (continues even if branch doesn't exist)

### Branch Naming Convention

**Vercel's default pattern**: `preview/pr-{number}`

Examples:
- PR #42 → Neon branch: `preview/pr-42`
- PR #123 → Neon branch: `preview/pr-123`

If your setup uses a different pattern, update the workflow's `branch:` parameter.

## Verifying the Setup

### Test with a New PR

1. Create a feature branch: `git checkout -b test/cleanup-automation`
2. Make a small change and commit
3. Push and create a PR
4. Check Neon console - new branch should appear
5. Merge the PR
6. Check GitHub Actions - workflow should run
7. Check Neon console - branch should be deleted

### Monitor Workflow Runs

View workflow runs at:
https://github.com/misty-step/sploot/actions/workflows/cleanup-neon-branches.yml

## Troubleshooting

### Workflow Doesn't Run

**Check**: Is the PR merged? Workflow only runs on merge, not just close.

**Check**: Are the secrets set correctly?
```bash
gh secret list
```

### Branch Not Deleted

**Check**: Does the branch name match the pattern?
```bash
neonctl branches list --project-id YOUR_PROJECT_ID
```

**Check**: Look at the workflow logs for errors:
https://github.com/misty-step/sploot/actions

### "Branch not found" Error

This is normal! If the branch was already deleted or never existed, the workflow continues gracefully.

## Alternative: Neon-Managed Integration Auto-Cleanup

Another option is to enable automatic cleanup in the Neon-Managed Vercel Integration:

1. Go to Vercel → Settings → Integrations → Neon
2. Look for "Automatically delete obsolete Neon branches"
3. Enable this setting

**Note**: This only works with the Neon-Managed integration (not Vercel-Managed). Check which type you have in the Vercel dashboard.

## Branch Expiration (Additional Safety Net)

For extra protection, you can set expiration times on preview branches:

When creating branches via Neon CLI:
```bash
neonctl branches create --expires-in 7d preview/my-feature
```

Or via the API by setting `ttl_interval_seconds` when creating branches.

## References

- [Neon GitHub Actions Guide](https://neon.tech/guides/neon-github-actions-authomated-branching)
- [Neon delete-branch-action](https://github.com/neondatabase/delete-branch-action)
- [Neon Branch Expiration](https://neon.tech/blog/expire-neon-branches-automatically)
- [Vercel + Neon Integration](https://neon.tech/docs/guides/vercel)

## Questions?

If you encounter issues or need to adjust the setup, check:
1. GitHub Actions logs
2. Neon console for branch status
3. Vercel integration settings

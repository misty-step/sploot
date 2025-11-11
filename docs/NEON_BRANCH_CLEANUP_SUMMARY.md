# Neon Database Branch Cleanup - Quick Start

## Problem Solved

Your Vercel builds were failing because you had 10 Neon database branches from old merged feature branches. Neon has a default limit of 10 branches, causing new preview deployments to fail with "Failed to provision Neon database resources".

## Solution Implemented

We've set up **automated cleanup** that deletes Neon database branches when Git branches are merged to master.

## Quick Start (3 Steps)

### 1. Add GitHub Secrets

Go to: https://github.com/misty-step/sploot/settings/secrets/actions

Add these two secrets:

1. **NEON_API_KEY**
   - Get from: https://console.neon.tech/app/settings/api-keys
   - Click "Generate new API key"
   - Name it: "GitHub Actions - Branch Cleanup"

2. **NEON_PROJECT_ID**
   - Get from: `vercel env ls | grep NEON_PROJECT_ID`
   - Or from Neon Console URL: `console.neon.tech/app/projects/[YOUR-ID]`

### 2. Clean Up Existing Branches (One-Time)

Run the helper script to clean up your 10 existing old branches:

```bash
# Install Neon CLI if needed
npm install -g neonctl

# Login to Neon
neonctl auth

# Run the cleanup script
./scripts/cleanup-old-neon-branches.sh
```

The script will:
- Compare Neon branches with Git branches
- Show you which ones are safe to delete
- Ask for confirmation before deleting

### 3. Verify Automation

The GitHub Actions workflow is already in place at:
`.github/workflows/cleanup-neon-branches.yml`

It will automatically run when:
- Any pull request is merged
- Deletes the corresponding Neon branch: `preview/pr-{number}`

## What Happens Next

### Automatic Cleanup Flow

```
1. Developer creates PR #123
   ↓
2. Vercel creates Neon branch: preview/pr-123
   ↓
3. Developer merges PR #123
   ↓
4. GitHub Actions workflow triggers
   ↓
5. Neon branch preview/pr-123 is deleted
   ↓
6. Branch count stays under limit ✓
```

### Verifying It Works

1. Create a test PR
2. Merge it
3. Go to: https://github.com/misty-step/sploot/actions
4. Check the "Cleanup Neon Database Branches" workflow ran
5. Verify in Neon Console that the branch was deleted

## Files Created

- `.github/workflows/cleanup-neon-branches.yml` - GitHub Actions workflow
- `docs/NEON_BRANCH_CLEANUP_SETUP.md` - Detailed setup guide
- `scripts/cleanup-old-neon-branches.sh` - Helper script for manual cleanup
- `docs/NEON_BRANCH_CLEANUP_SUMMARY.md` - This file

## Troubleshooting

### "Failed to provision Neon resources" Still Happening?

Run the cleanup script to remove old branches:
```bash
./scripts/cleanup-old-neon-branches.sh
```

### Workflow Not Running?

Check:
1. Are GitHub secrets set? `gh secret list`
2. Was the PR merged (not just closed)?
3. Check workflow logs: https://github.com/misty-step/sploot/actions

### Branch Name Doesn't Match?

Check your actual Neon branch names:
```bash
neonctl branches list --project-id YOUR_PROJECT_ID
```

If they don't match `preview/pr-{number}`, edit the workflow file and update the `branch:` field.

## Alternative: Vercel Integration Auto-Cleanup

You can also enable automatic cleanup in the Neon-Managed Vercel Integration:

1. Go to Vercel → Settings → Integrations → Neon
2. Enable "Automatically delete obsolete Neon branches"

This works alongside the GitHub Actions approach for redundancy.

## Additional Safety: Branch Expiration

Consider setting expiration times on new branches as an additional safety net:

```bash
# When creating branches manually
neonctl branches create --expires-in 7d preview/my-feature
```

Or set this via the Neon API when creating branches programmatically.

## Resources

- **Detailed Setup Guide**: `docs/NEON_BRANCH_CLEANUP_SETUP.md`
- **GitHub Actions Logs**: https://github.com/misty-step/sploot/actions
- **Neon Console**: https://console.neon.tech
- **Neon Documentation**: https://neon.tech/guides/neon-github-actions-authomated-branching

## Questions?

If you encounter issues:
1. Check the detailed setup guide: `docs/NEON_BRANCH_CLEANUP_SETUP.md`
2. Review GitHub Actions logs
3. Verify branch names in Neon Console

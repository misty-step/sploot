# Runbook: Database Connection Failure

**Last Updated**: 2025-11-25
**Severity**: CRITICAL
**MTTR Target**: <10 minutes

## Overview

This runbook guides on-call engineers through diagnosing and resolving database connection failures in production. Based on the 2025-11-25 production incident where Prisma's native query engine could not read custom environment variable names in Vercel's serverless environment.

---

## Symptoms

### User-Facing
- **503 Service Unavailable** errors on all pages
- Health check endpoint (`/api/health`) returning error status
- Unable to load meme gallery (2,800+ assets inaccessible)

### Server-Side Logs
- Prisma error: `Authentication failed against database server, the provided database credentials for '(not available)' are not valid`
- **Key indicator**: `(not available)` means Prisma **cannot parse** the connection string (not an authentication failure)
- Health check logs showing database connection failed
- Sentry errors with database connectivity issues

### Vercel Dashboard
- Recent deployment shows elevated error rate
- Function logs show database connection errors
- No obvious code changes that would affect database

---

## Quick Diagnosis (< 2 minutes)

Run these checks in order:

### 1. Check Health Endpoint

```bash
curl https://www.sploot.app/api/health | jq
```

**Healthy response**:
```json
{
  "status": "ok",
  "dependencies": {
    "database": "up",
    "redis": "up"
  },
  "diagnostics": {
    "prisma_connection_test": true,
    "database_url_configured": true,
    "connection_latency_ms": 45
  }
}
```

**Failed response**:
```json
{
  "status": "error",
  "error": "Database connection failed: ...",
  "diagnostics": {
    "prisma_connection_test": false,
    "database_url_configured": false  // ← KEY ISSUE: env var is MISSING
  }
}
```

**Note**: `database_url_configured: false` means `process.env.DATABASE_URL` is not set. If the variable exists but is malformed (trailing newline, wrong format), you'll see `database_url_configured: true` but `prisma_connection_test: false`. Always check both fields.

### 2. Check Vercel Environment Variables

```bash
vercel env ls --environment production
```

**Look for**:
- ✅ `DATABASE_URL` should be present
- ❌ `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING` are deprecated (should NOT be used)

### 3. Pull Environment Variables Locally

```bash
vercel env pull --environment production .env.production.check --yes
grep "^DATABASE_URL=" .env.production.check
```

**Expected**:
```bash
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true
```

**Red flags**:
- Variable is missing
- Variable exists but uses `POSTGRES_URL` instead
- URL doesn't contain `pgbouncer=true` for pooler endpoints
- URL has trailing newline (check with `od -c`)

---

## Common Causes

### Cause 1: Wrong Environment Variable Name
**Problem**: Using `POSTGRES_URL` instead of Prisma's standard `DATABASE_URL`

**Why it fails**: Prisma's native Rust query engine has special handling for `DATABASE_URL` that works reliably in serverless. Custom env var names may not have the same battle-tested code path.

**Fix**: See Resolution Steps below.

### Cause 2: Missing Environment Variable in Vercel
**Problem**: `DATABASE_URL` not set in Vercel production environment

**Why it fails**: Deployment succeeds but runtime fails when Prisma tries to connect.

**Fix**: Set `DATABASE_URL` in Vercel (see Resolution Steps).

### Cause 3: Trailing Newline in Environment Variable
**Problem**: Environment variable has trailing `\n` character

**Why it fails**: Invalid URL format causes Prisma parse failure.

**Fix**: Use `printf '%s'` instead of `echo` when setting env vars (see Resolution Steps).

### Cause 4: Missing pgbouncer Parameter
**Problem**: Pooler endpoint URL doesn't include `pgbouncer=true`

**Why it fails**: Prisma uses prepared statements by default, which PgBouncer doesn't support.

**Fix**: Add `?pgbouncer=true` to connection string.

---

## Resolution Steps

### Step 1: Verify Current State

```bash
# Check what's deployed
vercel ls --prod

# Check environment variables
vercel env ls --environment production | grep DATABASE
```

### Step 2: Set Correct DATABASE_URL

**Get database URL from Neon**:
1. Go to [Neon Console](https://console.neon.tech/)
2. Select project: `lively-lake-63852609` (neon-amber-lamp)
3. Branch: `main` (production)
4. Copy **Connection string** from dashboard
5. Ensure it's the **pooler** endpoint (hostname ends in `-pooler`)

**Set in Vercel** (CRITICAL: avoid trailing newline):
```bash
# Use printf to avoid trailing newline
printf '%s' "postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true" | \
  vercel env add DATABASE_URL production
```

**Verify no trailing newline**:
```bash
vercel env pull --environment production .env.verify --yes
cat .env.verify | grep "^DATABASE_URL=" | od -c
# Should NOT see \n before closing quote
```

### Step 3: Remove Deprecated Environment Variables (Optional)

```bash
# Remove old deprecated vars if they exist
vercel env rm POSTGRES_URL production --yes
vercel env rm POSTGRES_URL_NON_POOLING production --yes
```

### Step 4: Trigger Redeployment

**Option A: Redeploy latest commit**
```bash
vercel --prod
```

**Option B: Promote existing deployment** (if code is correct)
1. Go to Vercel dashboard: https://vercel.com/moomooskycow/sploot
2. Find last successful deployment before incident
3. Click "..." → "Promote to Production"

### Step 5: Verify Fix

Wait ~30 seconds for deployment, then:

```bash
# Check health endpoint
curl https://www.sploot.app/api/health | jq '.diagnostics.database_url_configured'
# Should return: true

# Check Prisma connection test
curl https://www.sploot.app/api/health | jq '.diagnostics.prisma_connection_test'
# Should return: true

# Check latency
curl https://www.sploot.app/api/health | jq '.diagnostics.connection_latency_ms'
# Should return: < 100ms typically
```

**Test actual functionality**:
```bash
# Visit production site
open https://www.sploot.app/app

# Verify meme gallery loads
# Verify search works
# Verify upload works (if permissions allow)
```

### Step 6: Check Sentry

1. Go to [Sentry Sploot Issues](https://sentry.io/organizations/misty-step/issues/?project=sploot)
2. Verify no new database errors appearing
3. Check error rate graph shows decline

---

## Rollback Plan

If fix doesn't work or causes new issues:

### Immediate Rollback (< 1 minute)

**Via Vercel Dashboard**:
1. Go to https://vercel.com/moomooskycow/sploot
2. Find the last known-good deployment (before incident)
3. Click "..." → "Promote to Production"
4. Verify health check returns 200 OK

**Via CLI**:
```bash
# List recent deployments
vercel ls

# Promote specific deployment
vercel promote <deployment-url> --yes
```

### Revert Environment Variable Change

```bash
# If DATABASE_URL change caused issues, revert to previous value
vercel env rm DATABASE_URL production --yes

# Re-add previous value (get from git history or .env.production.backup)
printf '%s' "<previous-value>" | vercel env add DATABASE_URL production
```

---

## Post-Incident Actions

### Immediate (< 1 hour)
- [ ] Post incident notification in #incidents Slack channel
- [ ] Update status page if public-facing
- [ ] Document timeline in incident log

### Follow-up (< 1 day)
- [ ] Run `pnpm validate:env` locally to verify configuration
- [ ] Review Sentry for any residual errors
- [ ] Check Vercel logs for any warnings
- [ ] Update this runbook if new insights discovered

### Long-term (< 1 week)
- [ ] Schedule postmortem meeting
- [ ] Add monitoring alerts for this failure mode
- [ ] Consider pre-deployment validation checks
- [ ] Update deployment checklist

---

## Prevention

### Pre-Deployment Checks

Always run before deploying database config changes:

```bash
# Validate environment variables
pnpm validate:env

# Check for deprecated env var usage
bash scripts/validate-env-vars.sh

# Type check
pnpm type-check

# Run tests
pnpm test
```

### Monitoring & Alerts

Set up alerts for:
- Health check failures (consecutive 3+ failures)
- Database connection latency > 500ms
- Sentry error: "Authentication failed"
- Sentry error: "(not available)"

### Documentation

Keep these docs updated:
- This runbook (after incidents)
- `docs/architecture/database-connection.md` (architecture decisions)
- `CLAUDE.md` (AI coding assistant guidelines)
- `README.md` (environment setup)

---

## Related Documentation

- [Database Connection Architecture](../architecture/database-connection.md)
- [Environment Variable Validation](../../scripts/validate-env.ts)
- [Health Check API](../../app/api/health/route.ts)
- [Neon Console](https://console.neon.tech/)
- [Vercel Dashboard](https://vercel.com/moomooskycow/sploot)
- [Sentry Issues](https://sentry.io/organizations/misty-step/issues/?project=sploot)

---

## Historical Incidents

### 2025-11-25: Prisma Unable to Read Custom Env Var Names

**Symptoms**: Production returning 503, Prisma error `(not available)`

**Root Cause**: Prisma's Rust query engine couldn't read `POSTGRES_URL` in Vercel serverless. Custom env var names not accessible to native binary.

**Resolution**: Changed to standard `DATABASE_URL` (3 files, 5 minutes)

**Lessons Learned**:
- Use framework standard env var names (not custom)
- `(not available)` means **parse failure**, not authentication
- Runtime sanitization in Node.js can't fix what Prisma reads before runtime
- Vercel env var timing: platform injection happens before Prisma native engine init

**Preventive Measures Implemented**:
- Pre-commit hook blocks `POSTGRES_URL` usage
- Runtime validation script (`pnpm validate:env`)
- Enhanced health check with Prisma diagnostics
- This runbook created

---

## Emergency Contacts

- **On-Call Engineer**: Check PagerDuty rotation
- **Database**: Neon support (https://neon.tech/docs/introduction/support)
- **Hosting**: Vercel support (https://vercel.com/support)
- **Team Lead**: [Add contact info]

---

**Remember**: When Prisma says `(not available)`, it means it can't **parse** the URL. Check environment variable configuration first, not database credentials.

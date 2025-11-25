# TODO: Database Configuration Hardening

> **Context**: 2025-11-25 production outage due to Prisma unable to read custom env var names (`POSTGRES_URL`) in Vercel serverless. Fixed by using standard `DATABASE_URL`. This work hardens the system against similar issues and removes accidental complexity.

## Strategic Goal (Ousterhout)
Reduce accidental complexity in database configuration. Make it impossible to misconfigure. Align with framework standards instead of fighting them.

---

## 1. Simplification - Remove Accidental Complexity

### 1.1 Standardize Environment Variable Names
- [x] Remove `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING` from `.env.local`
  - Replace with `DATABASE_URL` pointing to pooler endpoint with `pgbouncer=true`
  - Success criteria: Local development uses same var name as production
  - File: `.env.local`, `.env.example`, `.env.development`
  - ✅ Completed: Removed deprecated vars, added `pgbouncer=true` to DATABASE_URL

- [x] Update `.env.example` with correct DATABASE_URL format
  - Add comment explaining pooler vs direct connection
  - Show example: `DATABASE_URL="postgresql://user:pass@host-pooler.neon.tech/db?sslmode=require&pgbouncer=true"`
  - Success criteria: New developers set up env vars correctly on first try
  - ✅ Completed: Updated with example and explanatory comments

- [x] Search codebase for references to `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING`
  - Use: `rg "POSTGRES_URL" --type ts --type tsx`
  - Remove or replace all references with `DATABASE_URL`
  - Success criteria: Zero references to custom env var names in code
  - ✅ Completed: Updated lib/env.ts to check DATABASE_URL instead

### 1.2 Simplify Runtime Configuration
- [x] Simplify or remove `lib/env.ts` sanitization logic
  - Option A: Delete entirely (Carmack: "Delete code is the best code")
  - Option B: Keep as log-only defensive layer (warn but don't mutate)
  - If keeping: Add comment explaining it runs at wrong layer (educational)
  - Success criteria: No runtime env var mutations that don't actually help
  - ✅ Completed: Removed all runtime sanitization, kept config checks only, added educational comment

- [x] Remove custom URL override from `lib/db.ts`
  - Delete lines 16-18 (custom connectionUrl selection)
  - Let Prisma read `DATABASE_URL` from schema directly
  - Verify PrismaClient initialization has no datasources override
  - Success criteria: Single source of truth for database connection (schema only)
  - ✅ Completed: Already done in Carmack fix (2025-11-25)

- [x] Update unit tests for env sanitization if keeping defensive layer
  - File: `__tests__/unit/env-sanitize.test.ts`
  - If deleting sanitization: Delete this test file
  - If keeping as log-only: Update tests to verify logging behavior only
  - ✅ Completed: Rewrote tests to check DATABASE_URL configuration detection only

---

## 2. Validation & Safety - Prevent Misconfiguration

### 2.1 Pre-Commit Validation
- [ ] Create `.lefthook/pre-commit/validate-env-vars.sh`
  - Check: `DATABASE_URL` exists in `.env.example`
  - Check: No references to `POSTGRES_URL` in TypeScript files (except comments)
  - Exit code 1 if custom env var names found in code
  - Success criteria: Cannot commit code using deprecated env var names

- [ ] Add environment variable validation script
  - File: `scripts/validate-env.ts`
  - Check: `DATABASE_URL` is set and parseable as PostgreSQL URL
  - Check: URL contains `pgbouncer=true` if hostname contains `-pooler`
  - Warn: If `POSTGRES_URL` exists (deprecated)
  - Exit with helpful error messages if validation fails
  - Success criteria: Can run `pnpm validate:env` locally and in CI

- [ ] Add `validate:env` to package.json scripts
  - Add: `"validate:env": "tsx scripts/validate-env.ts"`
  - Document in README when to run this
  - Success criteria: Developers can validate env config before deploy

### 2.2 Enhanced Health Check
- [ ] Add Prisma-specific diagnostics to health check
  - File: `app/api/health/route.ts`
  - Add `prisma_connection_test` field: Execute `prisma.$queryRaw\`SELECT 1\``
  - Add `database_url_configured` field: `!!process.env.DATABASE_URL` (boolean only)
  - Measure connection latency: Time the query execution
  - Success criteria: Health check proves Prisma can actually connect, not just Node.js

- [ ] Add environment variable visibility to health check (safe)
  - Show which env vars are SET vs MISSING (don't show values)
  - Example: `{ database_url: 'configured', vercel_env: 'production' }`
  - Success criteria: Can diagnose "is env var visible?" without exposing secrets

---

## 3. Documentation - Runbooks & Architecture

### 3.1 Incident Runbook
- [ ] Create `docs/runbooks/database-connection-failure.md`
  - Section: Symptoms (503 errors, "(not available)" in logs)
  - Section: Quick Diagnosis (check DATABASE_URL exists)
  - Section: Common Causes (wrong env var name, missing in Vercel)
  - Section: Resolution Steps (set DATABASE_URL, redeploy)
  - Section: Verification (curl health check, check Sentry)
  - Include: Rollback plan (promote previous deployment)
  - Success criteria: On-call engineer can resolve issue in <10 minutes following doc

### 3.2 Architecture Documentation
- [ ] Create `docs/architecture/database-connection.md`
  - Explain: Why DATABASE_URL is non-negotiable (Prisma native engine)
  - Explain: Serverless env var timing (platform injection vs runtime)
  - Explain: Pooler vs direct endpoints (when to use which)
  - Diagram: Vercel → Env Vars → Prisma Engine → Postgres flow
  - Include: Historical context (2025-11-25 outage, lessons learned)
  - Success criteria: New team member understands db config in 10 minutes

### 3.3 Update Project Documentation
- [ ] Update `CLAUDE.md` with database configuration guidelines
  - Add section: "Database Configuration"
  - Mark: `POSTGRES_URL` as deprecated/wrong
  - Show: Correct `DATABASE_URL` format with pgbouncer parameter
  - Warn: Don't use custom env var names (Prisma compatibility)
  - Success criteria: Claude knows to use DATABASE_URL in future work

- [ ] Update `README.md` environment setup section
  - Replace references to `POSTGRES_URL` with `DATABASE_URL`
  - Add link to `docs/architecture/database-connection.md` for details
  - Show Vercel setup: `vercel env add DATABASE_URL production`
  - Success criteria: Setup instructions are correct and complete

---

## 4. Observability - Better Diagnostics

### 4.1 Startup Logging
- [ ] Add database configuration logging on Prisma initialization
  - File: `lib/db.ts`
  - Log (production): Redacted URL showing hostname and params (not password)
  - Log: `DATABASE_URL` configured status (boolean)
  - Log: Node version, platform, Vercel environment
  - Use structured logging (observability-logger)
  - Success criteria: Can see in Vercel logs what Prisma sees at startup

### 4.2 Sentry Context
- [ ] Add Prisma configuration to Sentry context
  - File: `instrumentation.ts`
  - Add context: `database_url_configured`, `vercel_env`, `node_version`
  - Add context: Prisma client version
  - Attach to all error events automatically
  - Success criteria: Every Sentry error shows db config status

---

## Acceptance Criteria (Overall)

**System is hardened when**:
1. ✅ No references to `POSTGRES_URL` in codebase (grep returns 0)
2. ✅ Local `.env.local` uses `DATABASE_URL` (same as production)
3. ✅ Pre-commit hook prevents committing deprecated env vars
4. ✅ `pnpm validate:env` passes in CI and locally
5. ✅ Health check proves Prisma can connect (not just Node.js)
6. ✅ Runbook exists and is tested
7. ✅ Architecture doc explains the "why" for future developers
8. ✅ Sentry errors include db config context

**Simplification success**:
- Zero runtime env var mutations
- Single source of truth: Prisma schema reads DATABASE_URL
- No custom logic in lib/db.ts for URL selection
- Codebase follows Prisma standard patterns

---

## Testing Strategy (Carmack: Measure Everything)

**Before marking tasks complete, verify**:
1. Local dev: `pnpm dev` works with DATABASE_URL
2. Type check: `pnpm type-check` passes
3. Tests: `pnpm test` passes (update env-sanitize tests if needed)
4. Validation: `pnpm validate:env` passes
5. Health: `curl localhost:3000/api/health` shows Prisma connection success
6. Build: `pnpm build` succeeds with no warnings about env vars

**Deploy validation**:
1. Staging: Deploy to preview, test health check
2. Production: Verify health check after deploy
3. Rollback ready: Previous deployment promotable in Vercel UI

---

## Notes

- **Priority**: Tasks in section 1 (Simplification) unblock other work
- **Dependencies**: Section 2 (Validation) depends on Section 1 completion
- **Documentation**: Can be done in parallel with code changes
- **Timeline**: Complete sections 1-2 this week, sections 3-4 next week

**Ousterhout Principle Applied**: Each task reduces complexity or prevents future complexity. No tactical bandaids.

**Carmack Principle Applied**: Every task is measurable and testable. No hand-waving.

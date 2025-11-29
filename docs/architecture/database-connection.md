# Architecture: Database Connection

**Last Updated**: 2025-11-25
**Status**: Production
**Related Runbook**: [Database Connection Failure](../runbooks/database-connection-failure.md)

## Overview

This document explains how database connections work in Sploot, why certain architectural decisions are non-negotiable, and the lessons learned from production incidents. **Reading time: ~10 minutes**.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Why DATABASE_URL is Non-Negotiable](#why-database_url-is-non-negotiable)
3. [Environment Variable Timing in Serverless](#environment-variable-timing-in-serverless)
4. [Pooler vs Direct Connection Endpoints](#pooler-vs-direct-connection-endpoints)
5. [Connection Flow Diagram](#connection-flow-diagram)
6. [Historical Context](#historical-context)
7. [Design Principles](#design-principles)
8. [Migration Guide](#migration-guide)

---

## System Architecture

### Technology Stack

- **Hosting**: Vercel (Serverless Functions)
- **Database**: Neon Postgres with pgvector extension
- **ORM**: Prisma (with native Rust query engine)
- **Connection Pooling**: PgBouncer (Neon-managed)
- **Runtime**: Node.js 22.x on AWS Lambda (Vercel Functions)

### Key Components

```text
┌─────────────────────────────────────────────────────────────┐
│ Vercel Platform                                             │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Environment Variable Injection (Platform Layer)      │  │
│  │ • Reads from Vercel project settings                 │  │
│  │ • Injected BEFORE function cold start                │  │
│  │ • Available to native binaries via process.env       │  │
│  └────────────────┬─────────────────────────────────────┘  │
│                   │                                         │
│                   ▼                                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Serverless Function (Node.js Runtime)                │  │
│  │                                                       │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │ Prisma Native Query Engine (Rust Binary)      │  │  │
│  │  │ • Reads DATABASE_URL from process.env         │  │  │
│  │  │ • Happens BEFORE Node.js runtime starts       │  │  │
│  │  │ • No access to JavaScript-level modifications │  │  │
│  │  └──────────────┬─────────────────────────────────┘  │  │
│  │                 │                                     │  │
│  │                 ▼                                     │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │ Node.js Application Layer                      │  │  │
│  │  │ • lib/env.ts: Runtime config checks (read-only)│  │  │
│  │  │ • lib/db.ts: PrismaClient initialization       │  │  │
│  │  │ • Too late to modify what Prisma engine reads  │  │  │
│  │  └──────────────┬─────────────────────────────────┘  │  │
│  └─────────────────┼──────────────────────────────────┘  │
└────────────────────┼─────────────────────────────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │ Neon Postgres        │
          │                      │
          │ Pooler Endpoint:     │
          │ (PgBouncer)          │
          │ Max 10,000 conns     │
          │ Transaction mode     │
          └──────────────────────┘
```

---

## Why DATABASE_URL is Non-Negotiable

### Prisma's Architecture

Prisma is **not a pure JavaScript library**. It consists of:

1. **JavaScript Client** (`@prisma/client`): High-level API you use in code
2. **Rust Query Engine** (native binary): Does actual database communication
3. **Schema File** (`prisma/schema.prisma`): Defines data model and connection

The Rust query engine is a **compiled binary** that:
- Reads `DATABASE_URL` directly from `process.env`
- Does NOT execute JavaScript code
- Cannot access runtime modifications to environment variables
- Initializes **before** Node.js application code runs

### What Happens in Serverless

**Vercel Function Cold Start Sequence**:

```
1. Platform injects env vars → process.env
   ↓
2. Prisma query engine binary starts
   ↓ (reads DATABASE_URL from process.env)
   ↓
3. Prisma parses connection string
   ↓
4. Node.js runtime starts
   ↓
5. Your application code runs (lib/env.ts, lib/db.ts)
   ↓ (TOO LATE - Prisma already read its config)
```

**Why custom env var names fail:**

```typescript
// ❌ DOES NOT WORK in serverless
// lib/env.ts
process.env.DATABASE_URL = process.env.POSTGRES_URL; // Too late!

// Prisma's Rust engine already read DATABASE_URL during step 2
// By the time this JavaScript runs (step 5), connection is established
```

### The `(not available)` Error

When Prisma logs:
```
Authentication failed against database server,
the provided database credentials for '(not available)' are not valid
```

**This does NOT mean authentication failed**. It means:
- Prisma **could not parse** the connection string
- Variable was undefined, malformed, or had wrong name
- The `(not available)` is Prisma's way of saying "I couldn't read the URL"

### Why DATABASE_URL Works

Prisma's Rust query engine has **special handling** for `DATABASE_URL`:
- Hardcoded in Prisma's engine source code
- Battle-tested across thousands of deployments
- Guaranteed to be read correctly in serverless environments
- Documented in Prisma's official schema reference

**From `prisma/schema.prisma`**:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // ← Engine reads this FIRST
}
```

If you try:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("POSTGRES_URL")  // ⚠️  May work locally, fails in Vercel
}
```

The schema will parse, but in serverless environments the Rust engine may not reliably read custom variable names.

---

## Environment Variable Timing in Serverless

### Local Development vs Production

**Local (pnpm dev)**:
- Environment variables loaded by Node.js from `.env.local`
- Variables available to both JavaScript and native binaries
- Timing is lenient - everything loads before first request

**Vercel Serverless**:
- Environment variables injected by **platform** (not Node.js)
- Native binaries read `process.env` **before** JavaScript executes
- Strict ordering: platform → native → JavaScript
- No opportunity for JavaScript to "fix" what natives read

### The Runtime Sanitization Anti-Pattern

**What we tried (didn't work)**:

```typescript
// lib/env.ts
export function sanitizeDatabaseUrl(url: string): string {
  // Add pgbouncer=true if missing
  if (url.includes('-pooler') && !url.includes('pgbouncer=true')) {
    return url + '&pgbouncer=true';
  }
  return url;
}

// lib/db.ts
const connectionUrl = sanitizeDatabaseUrl(
  process.env.POSTGRES_URL || process.env.DATABASE_URL
);

const prisma = new PrismaClient({
  datasources: {
    db: { url: connectionUrl }  // ❌ Overriding doesn't work!
  }
});
```

**Why this fails**:
1. Prisma's Rust engine **already connected** using schema's `env("DATABASE_URL")`
2. JavaScript-level datasource override is **ignored** for active connections
3. The connection pool is established before `new PrismaClient()` runs

**The correct pattern**:

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // ← Single source of truth
}

// lib/db.ts
export const prisma = new PrismaClient();  // That's it. Trust the schema.

// lib/env.ts
// Config checks ONLY - no mutations
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not configured');
}
```

---

## Pooler vs Direct Connection Endpoints

### Neon Provides Two Endpoints

**Pooler Endpoint** (PgBouncer):
```
postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true
                              ^^^^^^^                                ^^^^^^^^^^^^^^
```

**Direct Endpoint**:
```
postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require
                              (no -pooler suffix)
```

### When to Use Each

| Use Case | Endpoint Type | Reason |
|----------|--------------|--------|
| **Serverless functions** | Pooler (`-pooler`) | Avoids "too many connections" errors |
| **Next.js API routes** | Pooler | Same as serverless (Next.js uses functions) |
| **Long-running workers** | Direct | Can maintain persistent connections |
| **Database migrations** | Direct | Requires DDL support (CREATE, ALTER) |
| **pgAdmin / Postico** | Direct | Full Postgres protocol support |

### The pgbouncer=true Parameter

**Why required for poolers:**

PgBouncer operates in **transaction pooling mode**:
- Does NOT support prepared statements
- Prisma uses prepared statements by default
- Without `pgbouncer=true`, you get:
  ```
  Error: prepared statement "s0" does not exist
  ```

**What `pgbouncer=true` does:**
```typescript
// Prisma's behavior WITH pgbouncer=true
prisma.$queryRaw`SELECT * FROM assets WHERE id = ${id}`
// Generates: SELECT * FROM assets WHERE id = $1
// Uses simple query protocol (no prepared statement)

// Prisma's behavior WITHOUT pgbouncer=true
prisma.$queryRaw`SELECT * FROM assets WHERE id = ${id}`
// Generates: PREPARE s0 AS SELECT * FROM assets WHERE id = $1
// Uses extended query protocol (fails with PgBouncer)
```

### Correct DATABASE_URL Format

**For Sploot production (Vercel serverless)**:
```bash
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.neon.tech/neondb?sslmode=require&pgbouncer=true"
#                                         ^^^^^^^ pooler endpoint      ^^^^^^^^^^^^^^ required param
```

**Verification checklist**:
- [ ] Hostname contains `-pooler` suffix
- [ ] Query string contains `pgbouncer=true`
- [ ] Query string contains `sslmode=require`
- [ ] No trailing newline (use `printf '%s'` when setting)

---

## Connection Flow Diagram

### Request Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Vercel Receives Request                                          │
│    GET /api/assets                                                   │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. Cold Start (if needed)                                           │
│    • Vercel injects env vars from project settings                  │
│    • DATABASE_URL available in process.env                          │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Prisma Query Engine Initialization                               │
│    • Rust binary reads env("DATABASE_URL") from schema              │
│    • Parses connection string                                       │
│    • Validates format and parameters                                │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. Connection Pool Establishment                                    │
│    • Connects to Neon pooler endpoint (PgBouncer)                   │
│    • Creates connection pool (default: 10 connections)              │
│    • Validates authentication                                       │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. Node.js Runtime Starts                                           │
│    • Loads application code                                         │
│    • lib/env.ts: Validates DATABASE_URL exists (read-only)          │
│    • lib/db.ts: Exports PrismaClient (already connected)            │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. Handler Execution                                                │
│    • app/api/assets/route.ts imports prisma                         │
│    • Executes query: await prisma.asset.findMany()                  │
│    • Prisma uses existing connection pool                           │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. Database Query                                                   │
│    • PgBouncer receives query from Prisma                           │
│    • Routes to available Postgres backend connection                │
│    • Returns result set                                             │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 8. Response Sent                                                    │
│    • JSON serialization                                             │
│    • Return to client                                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Timing Points

- **Step 3 happens BEFORE Step 5**: Rust engine reads config before JavaScript runs
- **No opportunity for runtime fixes**: JavaScript cannot modify what Prisma already read
- **Connection pool persists**: Between requests (warm starts), pool is reused

---

## Historical Context

### 2025-11-25 Production Outage

**Timeline**:
- **00:00 UTC**: Deployment to production with custom `POSTGRES_URL` env var
- **00:01 UTC**: Health check failures begin, 503 errors site-wide
- **00:05 UTC**: Sentry shows: `Authentication failed... '(not available)'`
- **00:15 UTC**: Root cause identified: Prisma can't read `POSTGRES_URL`
- **00:20 UTC**: Fix deployed: Changed to `DATABASE_URL`
- **00:21 UTC**: Site recovered, health checks green

**Impact**:
- **Downtime**: 20 minutes
- **Affected users**: All (2,800+ meme assets inaccessible)
- **Data loss**: None
- **Revenue impact**: N/A (personal project)

### Root Cause Analysis

**What we thought**:
- "Runtime sanitization in `lib/env.ts` will fix the URL before Prisma uses it"
- "Custom env var names are fine as long as we map them"
- "Prisma's datasource override will use our corrected URL"

**What actually happened**:
- Prisma's Rust engine read `DATABASE_URL` (which didn't exist) **before** our JavaScript ran
- The query engine couldn't parse `undefined` as a connection string
- Showed error: `(not available)` - meaning "I couldn't read the URL"
- Runtime sanitization in Node.js **never ran** because Prisma already failed

**The misconception**:
```
We thought:   Vercel → Node.js → lib/env.ts (fix vars) → Prisma connects
Reality:      Vercel → Prisma connects (Rust) → Node.js → lib/env.ts (too late)
```

### Lessons Learned

1. **Use framework standards, not custom patterns**
   - Prisma expects `DATABASE_URL` - don't fight it
   - Custom env var names add complexity without benefits

2. **Serverless timing is non-negotiable**
   - Native binaries read env vars before JavaScript runs
   - No runtime workarounds for build-time requirements

3. **Error messages can be misleading**
   - "Authentication failed" wasn't auth failure
   - `(not available)` meant "couldn't parse URL"
   - Diagnosis: Check if env var EXISTS first, credentials second

4. **Runtime sanitization is the wrong layer**
   - Can't fix what happened at compile/init time
   - Validation: Yes. Mutation: No.
   - Get it right in Vercel settings, not in code

5. **Health checks must test actual dependencies**
   - Checking `process.env.DATABASE_URL` in Node.js ≠ proving Prisma can connect
   - Added `prisma.$queryRaw\`SELECT 1\`` to health check
   - Now we test what Prisma **actually sees**, not what Node.js sees

### Preventive Measures Implemented

**Code-level**:
- Pre-commit hook: Blocks `POSTGRES_URL` references in TypeScript
- Validation script: `pnpm validate:env` checks DATABASE_URL format
- Health check diagnostics: Proves Prisma connectivity, not just Node.js

**Documentation**:
- This architecture document (you're reading it!)
- Incident runbook: [database-connection-failure.md](../runbooks/database-connection-failure.md)
- Updated CLAUDE.md with DATABASE_URL guidelines

**Operational**:
- Standardized on `DATABASE_URL` across all environments
- Removed custom env var names from codebase
- Added env var visibility to health check (safe - no values exposed)

---

## Design Principles

### Simplicity Over Cleverness (Ousterhout)

**Reject tactical complexity**:
- Don't add runtime workarounds for configuration mistakes
- Don't create custom abstractions over standard patterns
- Don't fight framework conventions

**Embrace strategic simplicity**:
- Use `DATABASE_URL` because Prisma expects it
- Trust the schema as single source of truth
- Let Vercel handle env var injection (don't override in code)

### Single Source of Truth (Carmack)

**One place to define database connection**:
```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // ← Only here. Nowhere else.
}
```

**Don't duplicate or override**:
```typescript
// ❌ ANTI-PATTERN
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

// ✅ CORRECT
export const prisma = new PrismaClient();  // Trust the schema
```

### Validate, Don't Mutate

**Configuration checks are read-only**:
```typescript
// lib/env.ts
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not configured');
}

if (!process.env.DATABASE_URL.includes('pgbouncer=true')) {
  console.warn('DATABASE_URL missing pgbouncer=true parameter');
}

// ❌ Don't do this:
// process.env.DATABASE_URL = sanitized;  // Too late to help
```

### Make Invalid States Unrepresentable

**Use tooling to prevent mistakes**:
- Pre-commit hooks: Can't commit code using `POSTGRES_URL`
- TypeScript: Config types ensure DATABASE_URL exists
- CI validation: `pnpm validate:env` blocks deploys with wrong config
- Health check: Fails fast if Prisma can't connect

---

## Migration Guide

### If You're Using Custom Env Var Names

**Current state (WRONG)**:
```bash
# Vercel environment variables
POSTGRES_URL=postgresql://...
POSTGRES_URL_NON_POOLING=postgresql://...
```

**Target state (CORRECT)**:
```bash
# Vercel environment variables
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true
```

### Step-by-Step Migration

**1. Update local environment**:
```bash
# .env.local
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true"

# Remove old vars
# POSTGRES_URL=...
# POSTGRES_URL_NON_POOLING=...
```

**2. Update Vercel production**:
```bash
# Get Neon connection string (pooler endpoint)
# From: https://console.neon.tech/ → Project → Connection Details

# Set DATABASE_URL (avoid trailing newline!)
printf '%s' "postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true" | \
  vercel env add DATABASE_URL production

# Verify
vercel env pull --environment production .env.check --yes
cat .env.check | grep "^DATABASE_URL="
```

**3. Update code** (if you have overrides):
```typescript
// Before
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.POSTGRES_URL || process.env.DATABASE_URL
    }
  }
});

// After
export const prisma = new PrismaClient();  // That's it.
```

**4. Validate**:
```bash
pnpm validate:env          # Check env var format
pnpm type-check           # TypeScript validation
pnpm test                 # Run tests
```

**5. Deploy and verify**:
```bash
vercel --prod
curl https://yourapp.com/api/health | jq '.diagnostics'
```

**6. Remove deprecated env vars**:
```bash
vercel env rm POSTGRES_URL production --yes
vercel env rm POSTGRES_URL_NON_POOLING production --yes
```

---

## FAQ

**Q: Can I use a different env var name if I update the schema?**

A: Technically yes, but **strongly discouraged**. Prisma's Rust engine has special handling for `DATABASE_URL` that's battle-tested in serverless environments. Custom names may work locally but fail in production.

**Q: Why can't I just set `DATABASE_URL` in my code before importing Prisma?**

A: Because Prisma's native query engine reads env vars **before** your JavaScript runs. By the time your code executes, Prisma has already parsed the connection string and established connections.

**Q: Do I need both pooler and direct connection URLs?**

A: For serverless deployments (Vercel), you only need the **pooler endpoint** (`-pooler` hostname with `pgbouncer=true`). Direct connections are for migrations, which should run locally or in CI, not in serverless functions.

**Q: What if I need different databases for development and production?**

A: Set `DATABASE_URL` per environment in Vercel:
```bash
vercel env add DATABASE_URL development   # Dev database
vercel env add DATABASE_URL preview       # Preview database
vercel env add DATABASE_URL production    # Prod database
```

**Q: Can I override `DATABASE_URL` in the PrismaClient constructor?**

A: You can try, but it won't work for the connection pool that's already established. The override only applies to new connections, but Prisma's engine already connected using the schema's `env("DATABASE_URL")`.

---

## Related Documentation

- [Database Connection Failure Runbook](../runbooks/database-connection-failure.md)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#datasource)
- [Neon Connection Pooling](https://neon.tech/docs/connect/connection-pooling)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

---

## Conclusion

**Key Takeaways**:

1. **Always use `DATABASE_URL`** - it's not optional, it's the only reliable pattern
2. **Serverless timing is strict** - native binaries run before JavaScript
3. **Trust the schema** - don't override datasource URLs in code
4. **Validate, don't mutate** - check config at startup, but don't modify it
5. **Use pooler endpoints** - required for serverless to avoid connection limits

When in doubt, follow this rule: **Make it work like Prisma's documentation says, not how you think it should work.**

---

**Questions or improvements?** Update this doc and open a PR. Keep it accurate and tested against production deployments.

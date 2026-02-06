# Task: Fix Sentry Issue — PrismaClientKnownRequestError: Server has closed the connection

## Context
You are fixing a bug found by Sentry monitoring in the `sploot` project.

**Sentry Issue:** #7117400497
**Error:** `PrismaClientKnownRequestError: Invalid prisma.$queryRaw() invocation: Server has closed the connection.`
**Location:** `GET /api/health` route handler
**Environment:** production (https://www.sploot.app)
**Events:** 2 occurrences (most recent: Feb 2, 2026)

## What's Wrong
The Prisma client loses its database connection in serverless environments (Vercel). When the `/api/health` endpoint runs a raw query to check the DB, the connection has been closed by the server (idle timeout). This is a classic serverless + connection pooling issue.

## Instructions

1. **Branch first:** `git checkout -b fix/sentry-prisma-connection-pooling`
2. **Find the health route:** Look in `apps/` for the API health route (likely `apps/web/app/api/health/route.ts` or similar)
3. **Fix options (choose best fit):**
   - **Option A (Preferred):** Wrap the Prisma query in a try/catch with retry logic — if connection is stale, disconnect and reconnect:
     ```typescript
     try {
       await prisma.$queryRaw`SELECT 1`
     } catch (error) {
       if (error instanceof Prisma.PrismaClientKnownRequestError) {
         // Reconnect on stale connection
         await prisma.$disconnect()
         await prisma.$connect()
         await prisma.$queryRaw`SELECT 1`
       } else {
         throw error
       }
     }
     ```
   - **Option B:** Add connection pooling configuration in the Prisma schema (connection_limit, pool_timeout)
   - **Option C:** Use `@prisma/extension-accelerate` or connection pooler like PgBouncer
4. **Also check:** The Prisma client singleton pattern — ensure it's using a global instance, not creating new clients per request
5. **Run tests** if they exist
6. **Commit:** `fix: handle stale Prisma connections in health check endpoint`
7. **Push and PR:**
   ```bash
   git push origin fix/sentry-prisma-connection-pooling
   /.sprite/bin/gh pr create --title "fix: handle stale Prisma connections in health check (Sentry #7117400497)" \
     --body "Fixes PrismaClientKnownRequestError caused by stale database connections in serverless environment. Adds retry logic with reconnect on connection loss." \
     --base master
   ```

## Ralph Loop: Self-Healing PR
After opening the PR:
1. Wait 60 seconds for CI to start
2. Check CI status: `/.sprite/bin/gh pr checks <PR_NUMBER> --watch`
3. If CI fails: read the failure, fix it, commit, push
4. Repeat up to 3 times
5. If CI passes: output `TASK_COMPLETE`
6. If stuck after 3 attempts: output `BLOCKED: <reason>`

## IMPORTANT
- Do NOT force-push. Clean commits only.
- Do NOT modify unrelated files.
- Install dependencies first: `pnpm install` (this is a monorepo)
- The default branch might be `master` not `main` — check with `git branch -r`

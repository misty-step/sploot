---
id: 010-repair-auth-boundary-and-api-error-contracts
title: Repair Auth Boundary And API Error Contracts
status: done
lifecycle_stage: Feedback
owner: local
acceptance:
  - Signed-out app routes redirect to sign-in instead of deployed 404s.
  - Auth-required JSON APIs consistently return 401 rather than generic 500s.
  - Protected API route inventory matches middleware and route-level auth behavior.
  - Tests cover signed-out web and API behavior.
evidence_required:
  - deployed curl/browser smoke before and after
  - route tests for stats/tags/protected APIs
  - middleware/auth boundary review
  - API docs update if contracts change
refs:
  - apps/web/middleware.ts
  - apps/web/app/api/stats/route.ts
  - apps/web/app/api/tags/route.ts
  - apps/web/app/app/layout.tsx
---

# Repair Auth Boundary And API Error Contracts

Priority: high
Status: done
Estimate: M

## Goal

Signed-out users and clients hit predictable auth behavior across app pages and
JSON APIs.

## Non-Goals

- Replacing Clerk
- Reworking all app navigation
- Changing authenticated API response shapes beyond error contracts

## Oracle

- [x] Deployed `/app`, `/app/search`, and `/app/upload` redirect to sign-in or
      render a clear auth screen instead of returning a protected-route 404.
- [x] Unauthenticated `/api/stats` and `/api/tags` return `401` JSON, not a
      generic `500`.
- [x] Middleware protected route list and route-level auth checks are reconciled
      with `apps/web/docs/API.md`.
- [x] Focused tests prove signed-out route/API behavior.

## Scope

- `apps/web/middleware.ts`
- `apps/web/app/app/layout.tsx`
- `apps/web/app/api/stats/route.ts`
- `apps/web/app/api/tags/route.ts`
- `apps/web/docs/API.md`

## Why Now

The 2026-05-18 deployed smoke found `https://www.sploot.app/app` and nested app
routes returning 404 for signed-out users, while `/api/stats` and `/api/tags`
return 500 when unauthenticated. That is both UX friction and noisy telemetry.

## Links

- `apps/web/middleware.ts`
- `apps/web/app/api/stats/route.ts`
- `apps/web/app/api/tags/route.ts`
- `apps/web/app/app/layout.tsx`

## What Was Built

- Kept browser app protection in middleware while leaving JSON API auth
  contracts owned by route handlers.
- Normalized unauthenticated API routes to return `401 {"error":"Unauthorized"}`
  instead of falling through to generic `500` handlers, including stats, tags,
  assets, upload, search, telemetry, and related asset subroutes.
- Changed Clerk middleware sign-in redirects to use an absolute request-origin
  URL so Next middleware no longer throws `URL is malformed "/sign-in"`.
- Updated API docs to describe the signed-out `/app` redirect boundary and the
  JSON 401 contract for protected API routes.
- Deployed the current branch to Vercel production so the route contract could
  be verified against `https://www.sploot.app`.

## Evidence

- `pnpm --filter web exec vitest run __tests__/middleware.test.ts __tests__/api/auth-unauthorized-contracts.test.ts __tests__/api/stats.test.ts` passed on 2026-05-18: 3 files, 38 tests.
- `curl -I https://www.sploot.app/app` returned `HTTP/2 307` with
  `location: /sign-in` on 2026-05-18.
- `curl -i 'https://www.sploot.app/api/assets?limit=1'` returned `HTTP/2 401`
  with `{"error":"Unauthorized"}` on 2026-05-18.
- `pnpm --filter web smoke:deployed` passed after deploy on 2026-05-18; see
  `apps/web/docs/deployed-smoke-report.json`.
- Production deploy evidence: Vercel deployment
  `dpl_9DWe7Dhz82D5pX8GFbKd3j4cYZYT`,
  `https://sploot-9hzycv2x3-misty-step.vercel.app`, aliased to
  `https://www.sploot.app`.

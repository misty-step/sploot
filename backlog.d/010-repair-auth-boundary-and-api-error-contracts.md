---
id: 010-repair-auth-boundary-and-api-error-contracts
title: Repair Auth Boundary And API Error Contracts
status: ready
lifecycle_stage: Intent
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
Status: ready
Estimate: M

## Goal

Signed-out users and clients hit predictable auth behavior across app pages and
JSON APIs.

## Non-Goals

- Replacing Clerk
- Reworking all app navigation
- Changing authenticated API response shapes beyond error contracts

## Oracle

- [ ] Deployed `/app`, `/app/search`, and `/app/upload` redirect to sign-in or
      render a clear auth screen instead of returning a protected-route 404.
- [ ] Unauthenticated `/api/stats` and `/api/tags` return `401` JSON, not a
      generic `500`.
- [ ] Middleware protected route list and route-level auth checks are reconciled
      with `apps/web/docs/API.md`.
- [ ] Focused tests prove signed-out route/API behavior.

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

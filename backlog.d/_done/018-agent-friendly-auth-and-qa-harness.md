Status: done
Priority: P1
Estimate: L
Owner: codex

# Agent-Friendly Auth And QA Harness

## Problem

Authenticated Sploot QA currently depends on real Clerk browser state. Agents
can prove signed-out redirects and component behavior, but they repeatedly
cannot produce authenticated `/app` feed evidence or extension upload browser
proof without a human session.

The auth implementation also exposes too much provider detail to routes:
handlers choose between `getAuth`, `requireUserIdWithSync`,
`verifyBearerOrThrow`, and direct Clerk `auth()` imports. That makes route
migration, extension QA, and browser automation brittle.

## Goal

Create a deep auth boundary and deterministic QA auth harness so agents and CI
can exercise authenticated web, API, and extension paths without manual login,
while production auth remains Clerk-backed.

## Acceptance Criteria

- [x] Complete a provider decision spike comparing Clerk-wrapped, Better Auth,
      Supabase Auth, Auth.js/custom, and Keycloak/managed Keycloak against
      agent-readiness criteria.
- [x] Add a typed `AuthenticatedPrincipal`, `AuthPolicy`, and auth result model.
- [x] Add one route-facing auth wrapper that hides Clerk cookie auth, bearer
      auth, optional user sync, and JSON unauthorized response shape.
- [x] Migrate at least one representative protected route to the wrapper while
      preserving `401 {"error":"Unauthorized"}`.
- [x] Add a deterministic local/CI QA auth mode that is disabled in production.
- [x] Add Playwright authenticated web smoke covering `/app` without manual
      Clerk login.
- [x] Add extension API-client token-provider injection so tests can pass a
      deterministic token provider.
- [x] Add docs for auth modes, required env vars, and which modes are permitted
      in local, CI, preview, production, and release proof.
- [x] Preserve secret-scanning and do not commit `.auth` storage state or real
      Clerk credentials.

## Context Packet

Primary plan:

- `docs/auth-agent-readiness-plan-2026-06-05.md`
- `backlog.d/018-agent-friendly-auth-and-qa-harness.ctx.md`

Current repo evidence:

- `apps/web/lib/auth/server.ts`
- `apps/web/lib/auth/verify-bearer.ts`
- `apps/web/lib/auth/api.ts`
- `apps/web/middleware.ts`
- `apps/web/__tests__/api/auth-unauthorized-contracts.test.ts`
- `docs/qa/mobile-command-dock-2026-06-05.md`
- `apps/extension/entrypoints/background/auth-manager.ts`
- `apps/extension/shared/api-client.ts`

External research anchors:

- Clerk Playwright helpers:
  `https://clerk.com/docs/guides/development/testing/playwright/test-helpers`
- Clerk testing overview and Agent Tasks:
  `https://clerk.com/docs/guides/development/testing/overview`
- Clerk Agent Task create API:
  `https://clerk.com/docs/reference/backend/agent-tasks/create`
- Playwright auth state:
  `https://playwright.dev/docs/auth`

## Suggested Sequence

1. Implement a provider-neutral boundary while production remains Clerk-backed.
2. Add additive identity mapping so app users are no longer provider subjects.
3. Implement typed auth primitives and a wrapper around one low-risk route.
4. Extract user sync from identity resolution and attach it to a write policy.
5. Migrate all protected API routes to the wrapper.
6. Add `qa-local` authenticated API/browser fixtures and Playwright config.
7. Spike app-owned/Auth.js-custom and Better Auth adapters behind the boundary;
   evaluate Keycloak only if a hard enterprise/on-prem requirement appears.
8. Add optional Clerk testing and Agent Task harnesses after the local mode is
   green.
9. Refactor extension API auth token dependency and add deterministic tests.
10. Add CI auth smoke and update docs.

## Non-Goals

- Replacing Clerk before the provider-neutral boundary and identity mapping are
  proven.
- Weakening production auth or allowing QA bypasses in production.
- Making Clerk Agent Tasks mandatory while the API remains beta.
- Turning every existing route test into E2E.

## Completion Notes

Move this ticket to `_done/` only after the implementation branch ships and
includes auth-wrapper tests, Playwright authenticated evidence, extension token
provider tests, updated docs, and CI-parity gate evidence.

## What Was Built

- Added provider-neutral auth primitives, a request auth wrapper, and a
  production-disabled `qa-local` HMAC auth mode for local/CI automation.
- Migrated `GET /api/cache/stats` to the route-facing auth wrapper while
  preserving the JSON `401 {"error":"Unauthorized"}` contract.
- Added additive `user_identities` mapping and migration so provider subjects
  can be tracked separately from app-owned users.
- Added Playwright `/app` authenticated smoke coverage without Clerk browser
  state, committed `.auth` storage, or real Clerk credentials.
- Added extension API-client token-provider injection with deterministic tests.
- Added auth-mode docs, setup notes, provider decision record, and a static
  API auth-boundary guard enforced by web lint.

Evidence: `.evidence/018-agent-friendly-auth-qa-harness/2026-06-09.md`
Closes-backlog: 018

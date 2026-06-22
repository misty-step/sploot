# Unify the two auth doors on the policy boundary

Priority: P2 · Status: pending · Estimate: M

> **Groom note (2026-06-22):** bumped P3 → P2. The 2026-06-22 portability audit
> found Clerk is the **stickiest boundary and the true long pole** of any stack
> migration (~10 files, all layers, + the extension). Unifying the doors here is
> the first, load-bearing step of isolating Clerk behind one adapter (044 child
> 4) — finishing it converts a future identity migration from a rewrite into an
> adapter swap. No longer just hygiene; it's on the migration critical path.

## Goal

Sploot has one auth front door, not two. Every protected route resolves auth
through `authenticateRequest(req, policy)` / `withAuthenticatedApi`, so scope
decisions (like upload-only tokens) are governed in exactly one place.

## Context

Shaping/delivering 033 (upload tokens) surfaced that auth runs through **two**
independent paths:

- `lib/auth/request-auth.ts` (`authenticateRequest` + `withAuthenticatedApi`) —
  policy-based, used by ~5 routes (the upload routes opt into `allowUploadToken`
  here).
- `lib/auth/server.ts` (`getAuth` / `getAuthWithUser` / `requireUserId*`) —
  qa-local short-circuit then Clerk `auth()` directly, **no policy parameter**,
  used by ~16 routes (`/api/assets`, `/api/assets/[id]` DELETE, `/api/search`,
  `/api/tags`, `/api/stats`, …). `/api/upload/check` also uses
  `verifyBearerOrThrow` directly.

The upload-token scope guarantee currently holds *because* door 2 never calls
the token verifier — a guard test (`__tests__/lib/auth/upload-token-scope.test.ts`)
asserts `server.ts` stays token-blind. That works, but the invariant is implicit
and would invert silently if the doors were ever merged carelessly (see
ADR-006).

## Oracle

- [ ] `/api/assets`, `/api/assets/[id]`, `/api/search`, `/api/tags`,
      `/api/stats`, `/api/upload/check` (and peers) resolve auth via
      `withAuthenticatedApi` / `authenticateRequest`, not `getAuth*` /
      `verifyBearerOrThrow` directly.
- [ ] The `401 {"error":"Unauthorized"}` contract and user-sync behavior are
      preserved (existing contract tests stay green).
- [ ] `pnpm --filter web auth:guard` is extended to ban `getAuth*` in product
      routes once migrated; `lib/auth/server.ts` can shrink or be folded into
      the boundary.
- [ ] Upload-only scope still holds and is provable by one mechanism (the
      `allowUploadToken` policy), so the `server.ts` token-blind guard test
      becomes redundant rather than load-bearing.

## Notes

Additive, mechanical, route-by-route — preserve `requireUserIdWithSync`'s
user-sync semantics behind the boundary (the policy already has
`requireUserSync`). Low product risk, real architectural payoff: one place to
reason about who can hit what. Discovered via the 033 milestone critic.

# Auth Agent-Readiness Decision

Powder card: `sploot-018`

## Decision

Keep Clerk as the production provider for this slice, hide it behind a
provider-neutral request boundary, and add a signed `qa-local` mode for local
and CI auth proof. Use the new `user_identities` table as the additive mapping
surface before any provider replacement.

## Options Compared

| Option | Fit | Agent readiness | Failure mode | Verdict |
|---|---:|---:|---|---|
| Clerk wrapped | Medium | Medium | Wrapper becomes a Clerk pass-through | Use now as the safety slice |
| Better Auth | High | High | Newer surface; extension parity unproven | Spike after boundary exists |
| Auth.js/custom | High | High | Sploot owns sessions, recovery, abuse controls | Preferred north-star candidate |
| Keycloak | Medium | High | Heavy ops footprint for consumer app | Defer absent enterprise/on-prem need |
| Supabase Auth | Low | Medium | Pulls Neon-first architecture toward Supabase | Reject for this repo |

## Rationale

The highest-risk coupling is not the login page; it is that routes know Clerk
subjects directly and agents cannot load an authenticated `/app` state without
private browser session storage. A Clerk-wrapped boundary removes route
provider knowledge first, while `qa-local` gives local and CI an executable
principal that is rejected in production.

Provider replacement remains intentionally unshipped. Better Auth and
Auth.js/custom should be evaluated behind the new boundary after extension
token issuance, user identity mapping, and route migration are proven.

## Guardrails

- `qa-local` requires `SPLOOT_QA_AUTH_MODE=enabled` and
  `SPLOOT_QA_AUTH_SECRET`.
- `qa-local` is rejected when `NODE_ENV=production` or
  `DEPLOYMENT_ENV=production`.
- `users.id` stays stable; provider subjects are additive rows in
  `user_identities`.
- New protected API routes must use `lib/auth/with-authenticated-api`; the
  legacy direct-import allowlist is checked by `pnpm --filter web auth:guard`.

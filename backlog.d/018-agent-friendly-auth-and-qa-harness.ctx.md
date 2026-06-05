# Context Packet: Agent-Owned Auth Boundary And QA Harness

## PRD Summary

- User: agent workflow, maintainer, release reviewer, and Sploot user.
- Problem: Sploot auth is Clerk-coupled in ways that block deterministic
  agentic QA and make provider replacement risky.
- Why now: authenticated mobile/feed and extension QA repeatedly stop at real
  Clerk session state; the user wants auth.js/custom or Keycloak seriously
  shaped instead of assuming Clerk remains the right provider.
- UX enabled: agents can prove authenticated `/app`, protected APIs, and
  extension upload paths without a human login; users keep their existing
  libraries during any auth migration.
- Deliverable type: migration context packet plus implementation backlog item.
- Success signal: `pnpm --filter web e2e:auth` produces authenticated `/app`
  evidence using a deterministic local principal, while production remains
  Clerk-backed until an adapter replacement is proven.

## Goal

Build an app-owned auth boundary and deterministic QA harness that can keep
Clerk, replace Clerk with app-owned/Auth.js-custom auth, or adopt Keycloak
without rewriting product routes.

## Product Requirements

- P0: A fresh agent can create or load a deterministic authenticated principal
  and exercise web UI, API, and extension auth paths without a manual login.
- P0: Production must not gain a QA bypass, unsigned test principal, or
  environment-dependent auth hole.
- P0: Existing Sploot users and library ownership survive provider migration.
- P0: Product routes consume a typed auth principal under a policy; they do not
  know Clerk, Keycloak, Auth.js, cookie-vs-bearer, or QA-local details.
- P1: Shape and spike app-owned/Auth.js-custom and Keycloak adapters behind the
  boundary before committing to provider replacement.
- P1: Retain Clerk as a rollback provider until the replacement proves web,
  API, extension, release, and CI parity.
- Non-goals: immediate production Clerk removal, destructive `users.id`
  rewrite, and making beta Clerk Agent Tasks a merge gate.

## Non-Goals

- Do not delete Clerk dependencies before the provider-neutral boundary and
  identity mapping are proven.
- Do not make Keycloak the default unless an enterprise/on-prem/compliance
  requirement appears or a spike proves its ops surface is paid for.
- Do not build password/email/security features casually. Custom auth means
  owning account security, sessions, abuse controls, recovery, and audit.
- Do not rely on broad internal mocks as acceptance evidence.
- Do not commit Playwright `.auth` state, auth secrets, private keys, or real
  session tokens.

## Constraints / Invariants

- Sploot is a pnpm Turborepo; use pnpm.
- `DATABASE_URL` is the Prisma connection variable.
- Product JSON APIs preserve `401 {"error":"Unauthorized"}`.
- `apps/web/middleware.ts` protects `/app(.*)` until a replacement route
  guard is implemented.
- `apps/web/prisma/schema.prisma` currently has `User.id` matching Clerk
  `userId`; migration must be additive first.
- Existing assets, tags, storage quotas, and reservations reference `users.id`.
- Chrome extension upload currently depends on a Clerk bearer token; token
  provider extraction is required before provider cutover.
- CI parity remains `pnpm lint && pnpm type-check && pnpm --filter web test &&
  pnpm --filter extension build`, with auth smoke added later.

## Authority Order

tests > type system > code > docs > lore

## Repo Anchors

- `apps/web/lib/auth/server.ts` - current Clerk cookie auth and user sync.
- `apps/web/lib/auth/verify-bearer.ts` - current Clerk bearer verification.
- `apps/web/lib/auth/api.ts` - current unauthorized JSON helper.
- `apps/web/middleware.ts` - protected app route boundary.
- `apps/web/prisma/schema.prisma` - provider-coupled user identity.
- `apps/web/lib/db.ts` - `syncUser` and email-based migration behavior.
- `apps/web/__tests__/api/auth-unauthorized-contracts.test.ts` - current 401
  contract oracle.
- `apps/extension/entrypoints/background/auth-manager.ts` - Clerk extension
  token/session behavior.
- `apps/extension/shared/api-client.ts` - upload API bearer token call site.
- `.github/workflows/ci.yml` - CI parity gate.

## Prior Art

- Clerk Playwright helpers: `@clerk/testing/playwright` can sign in with
  Backend API support, but still depends on Clerk secrets and external service
  state.
- Clerk Agent Tasks: beta browser session bootstrap, useful as optional
  canary but not a merge gate.
- Better Auth CLI/Admin/Agent Auth: stronger agent-facing local control than
  Clerk, but Agent Auth is not stable and extension parity is unproven.
- Auth.js: framework-native session/auth layer, good for app-owned OAuth
  plumbing; not a full user-admin control plane by itself.
- Keycloak: mature Admin REST API and `kcadm` CLI, strong automation surface,
  heavy operating footprint.

Sources:

- `https://authjs.dev/`
- `https://better-auth.com/docs/concepts/cli`
- `https://better-auth.com/docs/plugins/admin`
- `https://better-auth.com/docs/plugins/agent-auth`
- `https://www.keycloak.org/docs-api/latest/rest-api/index.html`
- `https://www.keycloak.org/docs/latest/server_admin/`
- `https://clerk.com/docs/guides/development/testing/playwright/test-helpers`
- `https://clerk.com/docs/reference/backend/agent-tasks/create`

## Alternatives Considered

| Option | Shape | Strength | Failure Mode | Verdict |
|---|---|---|---|---|
| Clerk wrapped | Keep Clerk as provider, hide it behind typed auth facade and add `qa-local` | Least migration; existing web/extension setup remains live | Wrapper can become shallow pass-through; Clerk remains external/manual in places | Choose as first safety slice only |
| App-owned custom core + Auth.js OAuth | Internal users/sessions/tokens in Sploot DB; Auth.js handles OAuth/provider dance where useful | Strong local/CI control; best fit for agent-owned test principals | Sploot owns account security, session lifecycle, recovery, abuse controls | Recommended north star after boundary |
| Keycloak | External/self-hosted IdP with Admin REST and CLI; Sploot uses OIDC tokens | Strongest programmable control plane; mature identity features | Heavy ops/product fit; extension token UX and hosting burden | Defer unless enterprise/on-prem need appears |
| Better Auth | App-owned auth framework with CLI, admin plugin, agent auth/OpenAPI/MCP plugins | Very agent-friendly surface; likely faster than fully custom | Agent Auth unstable; extension parity unproven; newer ecosystem | Spike as serious challenger to custom/Auth.js |
| Auth.js only | Replace Clerk with Auth.js sessions/providers directly in Next.js | Lightweight, framework-native, easier app control | Not enough admin/session control alone; extension bearer model still custom | Use as component, not whole architecture |
| Pure local/session custom | Hand-roll users, sessions, magic links/OAuth callback, tokens, admin scripts | Perfect fit and complete control | Highest security ownership and long-term maintenance | Only if Auth.js/Better Auth obstruct core needs |
| Keep Clerk + Agent Tasks | Use Clerk testing helpers and Agent Tasks to unblock agents | Fastest if Clerk APIs fit | Agent Tasks beta; does not solve provider-coupled DB/routes | Optional canary, not strategy |
| Supabase Auth | Use Supabase local/auth/admin APIs | Good local stack and service-role admin surface | Pulls Sploot from Neon-first architecture toward Supabase | Reject for now |

## Tradeoff Matrix

Scores: 5 is best. Size means smaller implementation/operating size.

| Option | Fit | Size | Privacy | Agent-manageable | Reversible | Testable | Operating Burden |
|---|---:|---:|---:|---:|---:|---:|---:|
| Clerk wrapped | 3 | 5 | 3 | 3 | 5 | 4 | 4 |
| App-owned custom + Auth.js | 5 | 2 | 5 | 5 | 3 | 5 | 3 |
| Keycloak | 3 | 1 | 4 | 5 | 3 | 4 | 1 |
| Better Auth | 4 | 3 | 5 | 5 | 3 | 4 | 3 |
| Auth.js only | 3 | 4 | 4 | 3 | 4 | 3 | 4 |
| Pure custom | 5 | 1 | 5 | 5 | 2 | 5 | 1 |
| Clerk + Agent Tasks | 2 | 4 | 3 | 3 | 5 | 3 | 4 |
| Supabase Auth | 2 | 3 | 4 | 4 | 2 | 4 | 3 |

Clerk wrapped scores high on reversibility because it is the current deployed
state. It does not satisfy the user preference alone. App-owned custom +
Auth.js scores best for outcome fit and agent-manageability, but only after
identity mapping and a route facade prevent data loss. Keycloak has excellent
automation but poor operating fit for a consumer meme library. Better Auth is
the most credible third finalist and should be spiked before writing a pure
custom session stack.

## Technical Design

- Chosen architecture: staged app-owned auth boundary with Clerk as initial
  adapter, additive identity mapping, deterministic `qa-local`, and a follow-on
  replacement spike favoring app-owned/Auth.js-custom over Keycloak.
- Files/systems touched:
  - `apps/web/lib/auth/request-auth.ts` new typed auth boundary.
  - `apps/web/lib/auth/with-authenticated-api.ts` route wrapper.
  - `apps/web/lib/auth/providers/*` provider adapters.
  - `apps/web/prisma/schema.prisma` additive identity mapping table.
  - `apps/web/e2e/*` Playwright auth smoke.
  - `apps/extension/shared/api-client.ts` token provider injection.
  - `apps/extension/entrypoints/background/auth-manager.ts` remains production
    Clerk token provider until replacement is proven.
  - `.github/workflows/ci.yml` auth-smoke job after DB migration.
- Data/control flow:
  1. Route calls `withAuthenticatedApi(policy, handler)`.
  2. Wrapper calls `authenticateRequest(req, policy)`.
  3. Auth boundary chooses adapter by `AUTH_PROVIDER`, default `clerk`.
  4. Adapter returns `AuthenticatedPrincipal` with stable internal `userId`.
  5. `writeWithUserSync` composes identity mapping and user sync.
  6. Handler receives only `principal`, `req`, and route context.
  7. Extension passes a token provider to upload client; production provider
     remains Clerk until app-owned token issuance is ready.
- Build/check boundary:
  - Unit tests cover auth matrix.
  - Route tests cover 401 and positive principal paths.
  - Static import guard prevents direct provider imports in product routes.
  - Playwright proves authenticated `/app` and API access.
  - Extension tests prove token provider behavior.
- ADR decision: required. Provider boundary, identity mapping, and custom auth
  direction affect security, data model, and release posture.
- Design X vs Y:
  - Immediate Keycloak replacement rejected because it is operationally large
    and does not remove the need for a Sploot route facade.
  - Immediate custom/Auth.js replacement rejected because `users.id` is
    provider-coupled and extension auth would drift.
  - Clerk-only wrapper accepted as first slice but rejected as final strategy.
- Comprehension-required: provider-neutral auth facade, internal user identity,
  extension bearer token lifecycle.

## Agent Readiness

- Profile source: missing; no `.harness-kit/agent-readiness.yaml` present.
- Stack feedback strength: TypeScript, Vitest, Prisma migrations, CI pgvector
  Postgres, extension build/test, secret scanning. Browser auth smoke missing.
- ADR decision: required because auth provider and identity semantics change.
- Infrastructure path: target is CLI/API/SDK-managed setup with no dashboard
  state required for local/CI auth.
- Gate: CI parity plus future `pnpm --filter web e2e:auth`.
- Evidence storage: `docs/qa/`, `docs/demo/`, Playwright traces/screenshots,
  and backlog `018` completion notes.
- Mock policy impact: improved. Internal collaborator mocks should decrease;
  boundary tests use public auth facade and deterministic principals.

## Delegation Evidence

- Roster providers used: native subagents only; specialized role `ousterhout`
  was unavailable earlier due account model support. Subagent lanes reported
  internal provider attempts where available.
- Native subagents used:
  - Repo investigator: mapped Clerk hardwiring, schema/user-id coupling,
    extension auth, env/release coupling.
  - Product/premise critic: argued to keep Clerk wrapped; accepted as dissent
    and as evidence for wrapper-first sequencing.
  - Architecture critic: recommended provider-neutral wrapper first.
  - Implementation-risk reviewer: identified identity mapping, extension auth,
    and release gates as the highest-risk surfaces.
  - Test/oracle reviewer: required policy matrix, Playwright auth smoke, static
    import guard, extension token-provider tests.
- Accepted evidence:
  - `User.id` currently matches Clerk user ID; provider swap needs additive
    identity mapping.
  - Extension auth has no drop-in Auth.js equivalent; token-provider extraction
    must precede replacement.
  - `qa-local` must be signed, environment-gated, and rejected in production.
  - Keycloak control plane is strong but product/ops fit is weak.
- Rejected evidence:
  - "Keep Clerk wrapped forever" is rejected as final strategy because it does
    not satisfy the user preference for agent-owned fit.
  - "Immediate custom/Auth.js replacement" is rejected as first slice because
    it risks data and extension breakage.
  - "Keycloak first" is rejected absent enterprise/on-prem requirements.
- Waivers:
  - No repo/home `agents.yaml` was found by subagents; native lanes and web
    research were used.
  - No rendered HTML handoff was produced; this is an internal backlog context
    packet, not visual documentation.

## Premise Source

Premise Source Waiver: the load-bearing premise came from user chat in the
current private thread, not a safe standalone file.

Residual risk: future implementers cannot independently inspect the exact chat
text unless this thread remains available. The packet records the accepted
premise: the user suspects Auth.js/custom or Keycloak may be preferable and is
willing to pay larger implementation cost for agent friendliness and fit.

## Exemplar Techniques

- No `exemplars.md` exists at repo root.

## Oracle

- [ ] `pnpm --filter web exec vitest run __tests__/api/auth-unauthorized-contracts.test.ts`
      still proves the protected API 401 contract.
- [ ] New auth boundary unit tests cover mode, environment, request source,
      credential kind, policy, principal source, status, and user-sync behavior.
- [ ] Static import guard fails if protected product routes import
      `@clerk/nextjs/server`, `@clerk/backend`, `getAuth`,
      `getAuthWithUser`, `requireUserIdWithSync`, or `verifyBearerOrThrow`
      directly after migration.
- [ ] `pnpm --filter web e2e:auth` proves authenticated `/app` and one
      protected API request without manual login.
- [ ] `pnpm --filter extension test` proves injected token-provider behavior.
- [ ] `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`
      remains green.

## Deliverable

- Output: provider-neutral auth facade, additive identity mapping, deterministic
  QA auth mode, Playwright auth smoke, extension token-provider boundary, and
  provider replacement spike decision.
- Acceptance oracle: commands in `## Oracle`.
- Evidence artifacts: `docs/qa/auth-agent-readiness-<date>.md`, Playwright
  traces/screenshots on failure, CI run link, and backlog completion notes.
- Residual risk: production provider replacement remains unproven until the
  app-owned/Auth.js-custom or Better Auth spike passes the same oracles.

## Observability Plan

- Changed behavior to watch: auth source, auth failure reason, QA-local usage,
  provider adapter, user sync status, extension token failure.
- Named signal or evidence surface: structured auth logs and Sentry tags for
  `auth.provider`, `auth.source`, `auth.policy`, `auth.syncStatus`, and
  `auth.failure`.
- Instrumentation debt if no signal exists: add redacted auth-boundary logging
  before route migration.

## Formal Spec

- Formal Spec Required: yes, lightweight executable matrix only.
- Trigger criteria: core auth/permissions behavior changes, production bypass
  risk, data migration risk, and multiple-agent implementation milestones.
- Informal spec: each auth mode may authenticate only allowed request sources
  in allowed environments under explicit policies; denied modes return stable
  401/403 responses and never sync users accidentally.
- Formal examples: table-driven fixture at
  `apps/web/__tests__/lib/auth/auth-policy-matrix.test.ts` with rows:
  mode, environment, request source, credential kind, policy, expected
  principal source, expected status, user sync allowed.
- Acceptance oracle: Vitest command for auth matrix plus Playwright auth smoke.
- Hardening budget: add static import guard and one mutation-style negative
  case for production `qa-local` rejection.
- Waiver path: full formal methods waived unless multi-provider session
  reconciliation, refresh token state machines, or privilege delegation become
  part of the implementation.

## Acceptance Evidence

- Acceptance source: this context packet and backlog item `018`.
- Evidence that proves it: shape-only validation is file presence, grep anchors,
  and final committed branch; implementation evidence is listed in `## Oracle`.
- Exact command/path/route exercised for shape:
  - `rg -n "App-owned custom|Keycloak|Formal Spec|AuthPolicy|qa-local" backlog.d/018-agent-friendly-auth-and-qa-harness.ctx.md`
  - `git status --short --untracked-files=all`
- Oracle / acceptance artifact hash:
  `sha256:cb843621e453e9a762e628d14e02bdc81a2f0d2598eba056ee949e188b565486 backlog.d/018-agent-friendly-auth-and-qa-harness.md`
- Contract-change acknowledgment: no runtime contract changed in this shape.
- Residual risk: no implementation or browser auth smoke exists yet.

## Implementation Sequence

1. Add auth policy matrix fixture and typed `AuthenticatedPrincipal` /
   `AuthPolicy` without route migration.
2. Add `authenticateRequest(req, policy)` and `withAuthenticatedApi`.
3. Migrate `/api/cache/stats` or `/api/tags`; preserve 401 JSON contract.
4. Add static import guard for protected routes.
5. Add additive identity mapping table; keep `users.id` unchanged until
   backfill/dual-write proves safe.
6. Extract `syncAuthenticatedUser(principal)`.
7. Add signed `qa-local` mode with production rejection tests.
8. Add Playwright authenticated smoke and CI auth job.
9. Extract extension `AuthTokenProvider` and tests.
10. Spike app-owned/Auth.js-custom and Better Auth adapters behind the facade.
11. Re-evaluate Keycloak only if a product requirement justifies operating an
    external IdP.
12. Remove Clerk only after adapter parity, extension parity, release validation,
    deployed smoke, and data migration evidence are all green.

## Risk + Rollout

- Data risk: provider subject IDs cannot replace `users.id` destructively.
  Rollout uses additive identity mapping, dual-write, backfill, then constraint.
- Security risk: `qa-local` becomes a bypass. Guard by env, signature, test-only
  config, production rejection tests, and redacted observability.
- Extension risk: replacement breaks MV3 token refresh. Guard by token-provider
  interface and keep Clerk provider until replacement passes extension smoke.
- Rollback: default `AUTH_PROVIDER=clerk`, keep Clerk deps/env/sign-in pages and
  extension auth live until all routes and tests pass behind the facade.
- Closeout: merge only after docs, API docs, setup docs, extension docs, CI, and
  backlog completion notes match the shipped provider state.

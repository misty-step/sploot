# Auth Agent-Readiness Plan - 2026-06-05

## Objective

Redesign Sploot authentication so agents and CI can exercise authenticated web,
API, and extension paths without relying on a human browser session, while
keeping Clerk as the production identity provider.

The target is not "make tests log in once." The target is a deeper auth module
whose interface is simpler than its implementation:

```ts
authenticateRequest(req, policy) -> AuthenticatedPrincipal | AuthResponse
```

Routes should not know whether identity came from Clerk cookies, extension
bearer tokens, a Clerk Agent Task, or a local QA principal. They should ask for
a typed principal under a named policy.

## Evidence From Current Repo

- `apps/web/middleware.ts` protects `/app(.*)` and intentionally leaves API
  routes to enforce JSON auth contracts.
- `apps/web/lib/auth/server.ts` exposes `getAuth`, `getAuthWithUser`,
  `requireUserId`, and `requireUserIdWithSync`.
- `apps/web/lib/auth/verify-bearer.ts` separately verifies extension/browser
  bearer requests and embeds default web, local, and extension authorized
  parties.
- Some API routes call `getAuth`, some call `requireUserIdWithSync`, upload
  calls `verifyBearerOrThrow(req)`, and embedding routes import Clerk `auth()`
  directly.
- `apps/web/lib/auth/api.ts` detects auth failures by matching error strings.
- `apps/web/__tests__/api/auth-unauthorized-contracts.test.ts` covers the
  signed-out JSON contract but does so with broad internal mocks.
- `docs/qa/mobile-command-dock-2026-06-05.md` records the recurring blocker:
  authenticated visual feed QA is blocked in headless local QA by Clerk.
- `apps/extension/entrypoints/background/auth-manager.ts` correctly keeps a
  fresh Clerk client per check, but `apps/extension/shared/api-client.ts`
  imports `getAuthToken` directly instead of depending on a token-provider
  interface.

## External Research

- Clerk's Playwright helpers now support `clerk.signIn()` from
  `@clerk/testing/playwright`. The recommended `emailAddress` mode creates a
  server-side token through the Backend API, bypassing verification and MFA
  steps, and requires `CLERK_SECRET_KEY`.
  Source: https://clerk.com/docs/guides/development/testing/playwright/test-helpers
- Clerk testing docs explicitly call out Agent Tasks as a way to create
  authenticated sessions on behalf of users for automated E2E and AI agent
  workflows.
  Source: https://clerk.com/docs/guides/development/testing/overview
- Clerk Agent Tasks are beta and create a URL that, when visited, creates a
  session for a specified user. Inputs include `onBehalfOf`, `permissions`,
  `agentName`, `taskDescription`, `redirectUrl`, and optional session duration.
  Source: https://clerk.com/docs/reference/backend/agent-tasks/create
- Clerk session tokens used directly in tests are short-lived, currently
  documented as valid for 60 seconds, so any direct bearer-token harness must
  mint or refresh tokens per test or per short interval.
  Source: https://clerk.com/docs/guides/development/testing/overview
- Playwright recommends authenticating in a setup project and reusing saved
  storage state for tests that can share an account, or creating one auth state
  per parallel worker for tests that mutate server-side state.
  Source: https://playwright.dev/docs/auth

## Strategic Diagnosis

Current auth is production-capable but not agent-friendly because the route
surface is shallow and repetitive:

1. Identity provider details leak into route handlers.
2. Cookie-vs-bearer distinction leaks into business endpoints.
3. User database sync is coupled to identity resolution.
4. Unauthorized serialization is stringly typed and repeated.
5. Extension IDs and Clerk authorized parties are configured in multiple places.
6. Browser QA has no deterministic authenticated principal, so agents can only
   prove signed-out redirects or isolated component behavior.

The Ousterhout move is to deepen the auth module. Make the complexity live in
one module that owns provider selection, policy, test principals, user sync,
error translation, and observability. The rest of the app should receive a
small, typed principal.

Clerk should not be assumed as the permanent implementation. Its current
automation surface is mixed:

- Strong: Backend API coverage for many resources, Playwright helpers, testing
  tokens, session-token creation, and beta Agent Tasks.
- Weak for agents: the official Clerk MCP server currently provides SDK
  snippets and implementation patterns, not live resource management tools.
- Risky for gates: Agent Tasks are beta, and direct session tokens are short
  lived, so robust CI still needs wrapper code and refresh logic.
- Still manual-prone: dashboard settings, domains, provider configuration, and
  extension-origin hygiene can remain awkward unless every required setting is
  represented in a repo-owned contract.

Therefore the strategic plan is provider-agnostic first, Clerk-specific second.
If the deep auth boundary is done correctly, Sploot can keep, wrap, or replace
Clerk without rewriting product routes. Given the user's preference for
agent-owned fit, the north star should be app-owned auth with Auth.js/custom or
Better Auth components behind the boundary. Keycloak remains a serious but
deferred alternative: its control plane is excellent, but its operating surface
is hard to justify unless Sploot gains enterprise, on-prem, compliance, or
shared-infrastructure requirements.

## Provider Evaluation Matrix

Before committing to a full Clerk-centered QA harness, evaluate providers
against agent-readiness criteria:

| Provider / Shape | Agent-Readiness Upside | Risk / Cost | Initial Verdict |
|---|---|---|---|
| Clerk, wrapped | Already integrated; strong UI; Backend API; Playwright helpers; beta Agent Tasks | MCP is docs/snippets, not a live admin control plane; Agent Tasks beta; dashboard/config drift remains | Viable only behind a provider-neutral boundary |
| Better Auth | Self-hosted in app DB; CLI for schema/diagnostics/secrets; admin plugin; agent-auth plugin with OpenAPI/MCP adapters | Newer ecosystem; migration work; must own more security/product details | Serious candidate for most agent-friendly local/CI control |
| Supabase Auth | Local Supabase stack; service-role admin APIs; Postgres adjacency fits Neon/Postgres mental model | Auth schema and hosted platform constraints; Sploot currently uses Neon, not Supabase project infra | Worth evaluating if broader Supabase migration is on table |
| Auth.js / custom | Maximum repo control; easiest deterministic local test principals | Need to own auth UX, account security, emails, abuse controls, sessions | North-star direction, but only after identity mapping and facade |
| Keycloak / managed Keycloak | Full Admin REST API; mature realm/client/user automation; self-hostable | Heavy operational surface; overkill for consumer meme library | Defer unless enterprise/on-prem need appears |
| WorkOS / Stytch / Descope | Strong enterprise auth/product APIs depending on provider | May not improve local deterministic QA enough; vendor-specific | Evaluate only if product needs enterprise/B2B auth |

Evaluation criteria:

- Can an agent create/update/delete test users non-interactively?
- Can an agent mint a short-lived browser/API session without UI login?
- Can local CI run auth with no external network or vendor dashboard?
- Is every production-relevant setting expressible as code or API state?
- Can the provider support Chrome extension auth without dashboard drift?
- Can we generate MCP/OpenAPI tools for the auth control plane?
- Can secrets and test sessions be scoped, rotated, and redacted cleanly?

## Proposed Architecture

### 1. Server Auth Boundary

Add `apps/web/lib/auth/request-auth.ts` with:

```ts
type AuthPolicy =
  | 'read'
  | 'writeWithUserSync'
  | 'extensionOrCookie'
  | 'browserOnly'
  | 'qaOnly';

type AuthenticatedPrincipal = {
  userId: string;
  source: 'clerk-cookie' | 'clerk-bearer' | 'clerk-agent-task' | 'qa-local';
  sessionId?: string | null;
  email?: string;
  syncStatus?: 'success' | 'failed' | 'skipped';
};

type AuthResult =
  | { ok: true; principal: AuthenticatedPrincipal }
  | { ok: false; response: Response };
```

Responsibilities hidden inside the module:

- Clerk cookie auth through `auth()`.
- Clerk bearer auth through `authenticateRequest()`.
- Clerk Agent Task/browser storage state support for E2E setup.
- Local QA principal support only when `SPLOOT_QA_AUTH_MODE=local` and
  `NODE_ENV !== 'production'`.
- Optional user sync for write policies.
- Typed unauthorized/forbidden responses.
- Canary/logging metadata redaction.

### 2. Route Wrapper

Add `withAuthenticatedApi(policy, handler)` so routes become:

```ts
export const GET = withAuthenticatedApi('read', async ({ principal, req }) => {
  return listAssets(principal.userId, req);
});
```

This removes repeated `try/catch`, error-string matching, and route-local
auth-provider decisions.

### 3. QA Auth Modes

Define an explicit matrix:

| Mode | Purpose | Provider | CI Safe | Notes |
|---|---|---|---|---|
| `contract` | Signed-out redirect and 401 contracts | none | yes | Existing baseline |
| `qa-local` | Fast local/CI browser and API happy paths | signed local principal | yes | Disabled in production |
| `clerk-testing` | Real Clerk auth without UI login | `@clerk/testing/playwright` | yes with secrets | Uses test Clerk user |
| `clerk-agent-task` | Agent/browser session bootstrap | Clerk Agent Tasks | maybe | Beta; use as opt-in canary |
| `live-human` | Manual production release proof | real user session | no | Evidence-only, not a gate |

### 4. Playwright Harness

Add a web E2E package slice:

- `apps/web/playwright.config.ts`
- `apps/web/e2e/auth.setup.ts`
- `apps/web/e2e/app-authenticated.spec.ts`
- `apps/web/e2e/api-authenticated.spec.ts`
- gitignored `apps/web/playwright/.auth/`

Acceptance:

- `/app` renders authenticated library shell in CI.
- A seeded user can list assets/tags without redirecting to Clerk.
- Failed auth setup fails as its own test project, not as unrelated UI flakes.
- Screenshots, traces, and video are retained on failure.

### 5. Extension Token Provider Boundary

Refactor extension upload code so `uploadImage` accepts:

```ts
type AuthTokenProvider = () => Promise<string | null>;
```

Production passes `getAuthToken`. Tests pass a deterministic provider. The
fresh-Clerk-client invariant remains entirely inside `auth-manager.ts`.

### 6. Authorized Party Contract

Move web, local, staging, and extension origins into one shared auth identity
contract, for example:

- `packages/common/src/auth-origins.ts`, or
- `apps/web/lib/auth/origins.ts` plus extension validation import if the build
  boundary permits it.

Acceptance:

- Backend bearer verification and extension release validation read the same
  source of truth or a generated artifact from it.
- `CLERK_AUTHORIZED_PARTIES` only appends environment-specific origins.
- Tests fail if a shipped extension origin is missing from the backend allowlist.

## Implementation Phases

### Phase 0: Provider-Neutral Boundary And Identity Mapping

- Add a provider-neutral auth boundary and additive identity mapping while
  production remains Clerk-backed.
- Keep `AUTH_PROVIDER=clerk` as rollback default.
- Do not rewrite `users.id` or remove Clerk SDKs until routes, extension token
  provider, and QA-local smoke all pass behind the boundary.
- Shape implementation from the context packet preserved on Powder card `sploot-018`.

### Phase 0b: Replacement Spike

- Build narrow adapter spikes for app-owned/Auth.js-custom and Better Auth.
- Keep Keycloak in the matrix, but require an explicit enterprise/on-prem or
  comparable product requirement before choosing it.
- Prototype only the smallest proof: create test user, mint API token, mint
  browser session, run `/app` authenticated smoke, revoke session.

### Phase 1: Stabilize The Contract

- Add typed `AuthFailure`, `AuthenticatedPrincipal`, and `AuthPolicy`.
- Add tests for auth result translation without touching routes.
- Add `withAuthenticatedApi` and migrate one low-risk read route, likely
  `/api/tags` or `/api/cache/stats`.
- Preserve the exact `401 {"error":"Unauthorized"}` contract.

### Phase 2: Separate Identity From User Sync

- Extract `syncAuthenticatedUser(principal)` from `getAuthWithUser`.
- Make `writeWithUserSync` compose identity resolution with sync.
- Keep the circuit breaker, Canary, and logging behavior, but move it behind
  the policy implementation.

### Phase 3: Migrate Product Routes

- Migrate all protected API routes to the wrapper.
- Remove direct imports of Clerk `auth()` from product routes.
- Retire stringly unauthorized detection after route migration.
- Keep middleware protection for `/app(.*)` unchanged unless a later browser
  auth plan requires a narrow QA bypass.

### Phase 4: Add Agentic QA Auth

- Add Playwright with a setup project.
- Implement `qa-local` first because it proves the app can run without external
  Clerk for deterministic CI.
- Add `clerk-testing` as an opt-in CI/nightly lane when `CLERK_SECRET_KEY` and
  a test user email are present.
- Evaluate `clerk-agent-task` separately because it is beta; use it for local
  agent browser sessions before making it required.

### Phase 5: Extension Harness

- Inject `AuthTokenProvider` into extension API client.
- Add extension tests for signed, missing, and expired token paths.
- Add one browser smoke that uses the deterministic token provider to prove
  context-menu upload reaches the API contract.

### Phase 6: CI And Documentation

- Add `pnpm --filter web e2e:auth` or equivalent.
- Add CI job gated by local deterministic auth.
- Add optional nightly/live job for Clerk testing mode.
- Update `apps/web/docs/API.md`, `apps/web/SETUP.md`, `apps/extension/CLAUDE.md`,
  and root `AGENTS.md` auth notes if route behavior changes.

## Security Guardrails

- `qa-local` must be impossible in production:
  - reject when `NODE_ENV === 'production'`;
  - require `SPLOOT_QA_AUTH_MODE=local`;
  - require a signed header or loopback-only request;
  - log source as `qa-local`;
  - never accept arbitrary user IDs without a local signing key.
- Test principal IDs use `qa_user_*` and seeded emails under `sploot.test`.
- No test secrets are committed; `.auth` storage state stays gitignored.
- Clerk Agent Tasks remain opt-in until beta risk is accepted.
- Production auth remains Clerk-backed.

## Acceptance Criteria

- A fresh agent can run one command and produce authenticated `/app` browser
  evidence without manual Clerk login.
- Protected API routes consume one typed auth wrapper and preserve existing
  JSON 401 behavior.
- Extension upload tests can supply a deterministic token provider.
- CI contains at least one authenticated happy-path browser/API gate.
- Docs explain all auth modes, required env vars, and which modes are allowed
  in CI, local development, preview, production, and release proof.

## Open Questions

- Should `qa-local` be implemented as a signed header, a local-only cookie, or
  a short-lived internal JWT?
- Should Clerk Agent Tasks be used only for local agent sessions, or also for
  preview-deployment QA?
- Does Sploot need per-worker isolated users for Playwright, or is a shared
  read-only seeded account enough for the first browser gate?
- Should the authorized-party contract live in `packages/common`, or should it
  be generated from app-specific config to avoid coupling extension builds to
  web internals?

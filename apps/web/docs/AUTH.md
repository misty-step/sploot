# Auth Modes

Sploot production auth remains Clerk-backed. Product routes should depend on
`lib/auth/with-authenticated-api` and `AuthenticatedPrincipal`, not Clerk
request APIs directly.

## Modes

| Mode | Env | Provider | Permitted surfaces |
|---|---|---|---|
| `clerk` | default | Clerk cookies or Clerk session bearer token | local, preview, production |
| `qa-local` | `SPLOOT_QA_AUTH_MODE=enabled`, `SPLOOT_QA_AUTH_SECRET`, and an explicit deployment identity allowlist | signed Sploot QA token | allowlisted non-production deployments only |
| `upload-token` | always available | hashed personal API token (`Authorization: Bearer splt_…`) | **opt-in routes only**: save (`/api/upload`, `/api/upload/url`) + search (`/api/search`) |

`qa-local` is enabled only when `SPLOOT_DEPLOYMENT_IDENTITY` is a member of the
comma-separated `SPLOOT_QA_ALLOWED_DEPLOYMENT_IDENTITIES` allowlist. The
identity and `DEPLOYMENT_ENV` values `prod`/`production` are always rejected;
`NODE_ENV=production` is also hard-refused. When QA is disabled,
stray QA headers/cookies are ignored so valid Clerk or upload-token credentials
can continue through their own policy. When QA is explicitly enabled, a QA
credential is terminal and cannot fall through to another tenant.

## QA Token

QA tokens are HMAC-signed and short lived. Tests should pass them through the
`x-sploot-qa-auth` header or the `sploot_qa_auth` cookie. Do not commit browser
storage state, Clerk session cookies, or real Clerk credentials.

The Playwright auth smoke uses:

```bash
pnpm --filter web e2e:auth
```

The smoke starts a local Next server with `qa-local` enabled and opens `/app`
with a signed deterministic principal. Passing the smoke proves the app auth
boundary can be crossed without manual Clerk login.

## Upload Tokens (personal API tokens)

Personal API tokens (still called "upload tokens" in the code/table names —
`upload_tokens`, `/api/upload-tokens` — for continuity with sploot-033) let a
non-session client (the iPhone "Save to Sploot" shortcut, the sploot MCP
server, other agents/automation) authenticate save + search API calls without
a Clerk session.

- Format: `splt_` + 32 random bytes (base64url). Only `sha256(token)` is stored
  (`upload_tokens` table); the plaintext is returned once at mint and never
  again.
- Scope is enforced by policy, not by a scope field: `authenticateRequest`
  checks an upload token only when a route passes `allowUploadToken: true`.
  Three routes opt in — the two upload routes plus `POST /api/search`
  (sploot-071) — so a token presented anywhere else returns the stable `401`.
  Every protected product API route now enters through `withAuthenticatedApi`,
  and Clerk identity sync is required before the handler. The route's
  `AuthPolicy` is the only upload-token decision point. The page-only
  `lib/auth/server.ts` path remains token-blind as defense in depth;
  `auth:guard` prevents product routes from importing either legacy door.
- Clerk sync failures are typed at the boundary: missing `currentUser` is
  `401` with `code: "identity_missing"`, unavailable sync is retryable `503`
  with `code: "sync_unavailable"`, and a sync transaction conflict is `409`
  with `code: "sync_conflict"`; serializable `P2034` conflicts set
  `retryable: true`. The handler is never called for these states. The
  verified Clerk subject must exactly match `currentUser.id` before email or
  orphan migration. A missing `user_identities` table is typed unavailable,
  never a successful sync. Clerk verifier/provider failures are typed `401`
  for unauthorized responses or retryable `503` otherwise. User persistence
  and the `user_identities` binding commit in one serializable transaction;
  identity conflicts cannot reassign a provider subject, and bounded retries
  cover transient `P2034`/race `P2002` failures.
  Upload-token verification remains throw-safe: a DB error (including a
  not-yet-migrated table) resolves to the stable `401`, never `500`. Revoked and unknown tokens are
  indistinguishable.
- Managed at `/api/upload-tokens` (mint/list) and `/api/upload-tokens/{id}`
  (revoke), which are **session-authenticated** — an upload token cannot manage
  tokens. UI: **Settings → Upload tokens**.
- Implementation: `lib/auth/upload-token.ts`. User recipe:
  `docs/shortcuts/save-to-sploot.md`.

Because the token is verified against the `upload_tokens` table, the migration
must be applied to an environment (`prisma migrate deploy`) before the mint
route works there.

## QA Data Seeding

`qa-local` covers auth; `qa:seed` covers data. Against a local pgvector
postgres (`DATABASE_URL` must point at localhost):

```bash
pnpm --filter web qa:seed                  # QA user + 24 renderable assets
pnpm --filter web qa:seed --teardown       # remove everything it created
pnpm --filter web qa:seed --user-id u --count 36
```

Asset rows satisfy the `blob_url` CHECK constraint by pointing at the reserved
host `https://sploot-qa-seed.public.blob.vercel-storage.com/...`; the bytes are
generated PNGs in `public/qa-blob-seed/` (gitignored). When the dev server runs
with `SPLOOT_QA_AUTH_MODE=enabled`, a QA-only image loader
(`lib/qa/qa-image-loader.ts`) maps that host back to the local files, so the
grid renders without dropping constraints or dismissing integrity banners. The
loader is inert in production builds.

Mint a token for the seeded user with `createQaLocalAuthToken` from
`lib/auth/qa-local.ts` (default seed user id: `qa-design-user`), set it as the
`sploot_qa_auth` cookie, and open `/app`. In a browser, `GET
/api/qa-auth/login` does this in one hop (mints the token, sets the cookie,
redirects to `/app`) — the route 404s unless qa-local mode is enabled and is
hard-refused in production like the rest of the harness.

## One-Command Local Boot

`pnpm dev:local` (repo root) composes all of the above: provisions a local
pgvector Postgres in Docker, applies migrations, runs `qa:seed`, boots the dev
server with qa-local auth enabled, and finishes with a doctor pass that writes
an evidence packet (health, signed-in `/app`, seeded grid readback, search
response, and a grid screenshot when the `agent-browser` CLI is available) to
`.sploot-local/doctor/`. `pnpm dev:local:down` removes the database container
and generated files.

## Evidence Packets

`pnpm --filter web qa:evidence` composes the auth harness and the seed into a
one-command verification run: tests, an authenticated dev server, browser
walks with screenshots, and a structured packet under `docs/qa/evidence/`.
See `docs/qa/README.md` (repo root) for usage and how to read a packet.

## Route Migration

New protected JSON API routes should use:

```ts
withAuthenticatedApi(handler)
```

The wrapper returns the stable API auth failure shape:

```json
{ "error": "Unauthorized" }
```

The guard inventories every API route, permits only explicit operational/public
exemptions, and fails on direct provider/legacy auth imports or a missing
`withAuthenticatedApi` boundary. Run:

```bash
pnpm --filter web auth:guard
```

to catch new direct imports of Clerk or legacy auth helpers from API routes.

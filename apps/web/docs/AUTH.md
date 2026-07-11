# Auth Modes

Sploot production auth remains Clerk-backed. Product routes should depend on
`lib/auth/with-authenticated-api` and `AuthenticatedPrincipal`, not Clerk
request APIs directly.

## Modes

| Mode | Env | Provider | Permitted surfaces |
|---|---|---|---|
| `clerk` | default | Clerk cookies or Clerk session bearer token | local, preview, production |
| `qa-local` | `SPLOOT_QA_AUTH_MODE=enabled` plus `SPLOOT_QA_AUTH_SECRET` | signed Sploot QA token | local and CI only |
| `upload-token` | always available | hashed personal API token (`Authorization: Bearer splt_…`) | **opt-in routes only**: save (`/api/upload`, `/api/upload/url`) + search (`/api/search`) |

`qa-local` is rejected when `NODE_ENV=production`,
even if the mode and secret are present.

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
  The `lib/auth/server.ts` auth path (`getAuth*`, used by most read/delete
  routes) never calls the verifier at all; `POST /api/search` itself moved off
  that path onto `withAuthenticatedApi` to make the opt-in possible (partial,
  route-scoped step toward the full migration tracked in
  `backlog.d/035-unify-auth-doors-on-policy-boundary.md`).
- Verification is throw-safe: a DB error (including a not-yet-migrated table)
  resolves to `401`, never `500`. Revoked and unknown tokens are
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

Legacy direct imports remain temporarily allowlisted until each route is
migrated. Run:

```bash
pnpm --filter web auth:guard
```

to catch new direct imports of Clerk or legacy auth helpers from API routes.

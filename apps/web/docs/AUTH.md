# Auth Modes

Sploot production auth remains Clerk-backed. Product routes should depend on
`lib/auth/with-authenticated-api` and `AuthenticatedPrincipal`, not Clerk
request APIs directly.

## Modes

| Mode | Env | Provider | Permitted surfaces |
|---|---|---|---|
| `clerk` | default | Clerk cookies or Clerk session bearer token | local, preview, production |
| `qa-local` | `SPLOOT_QA_AUTH_MODE=enabled` plus `SPLOOT_QA_AUTH_SECRET` | signed Sploot QA token | local and CI only |
| `upload-token` | always available | hashed personal upload token (`Authorization: Bearer splt_…`) | **upload routes only** (`/api/upload`, `/api/upload/url`) |

`qa-local` is rejected when `NODE_ENV=production` or `VERCEL_ENV=production`,
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

## Upload Tokens

Personal upload tokens let a non-session client (the iPhone "Save to Sploot"
shortcut, a CLI, automation) authenticate **upload-only** API calls. They exist
because Apple Shortcuts cannot carry a Clerk session.

- Format: `splt_` + 32 random bytes (base64url). Only `sha256(token)` is stored
  (`upload_tokens` table); the plaintext is returned once at mint and never
  again.
- Scope is enforced by policy, not by a scope field: `authenticateRequest`
  checks an upload token only when a route passes `allowUploadToken: true`.
  Just the two upload routes opt in, so a token presented anywhere else returns
  the stable `401`. The `lib/auth/server.ts` auth path (`getAuth*`, used by
  read/delete routes) never calls the verifier at all.
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
`sploot_qa_auth` cookie, and open `/app`.

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

# Auth Modes

Sploot production auth remains Clerk-backed. Product routes should depend on
`lib/auth/with-authenticated-api` and `AuthenticatedPrincipal`, not Clerk
request APIs directly.

## Modes

| Mode | Env | Provider | Permitted surfaces |
|---|---|---|---|
| `clerk` | default | Clerk cookies or Clerk session bearer token | local, preview, production |
| `qa-local` | `SPLOOT_QA_AUTH_MODE=enabled` plus `SPLOOT_QA_AUTH_SECRET` | signed Sploot QA token | local and CI only |

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

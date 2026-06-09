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

# sploot-rs

Installable auth shell for the Sploot rewrite. One owner, mapped from a Cloudflare Access JWT. No library features.

This directory is the repo root. Install and test from here:

```sh
pnpm install --ignore-workspace
pnpm test
```

Needs Rust 1.91.1, `worker-build` 0.8.7, and Playwright WebKit. `pnpm test` builds the worker, migrates a local D1, and drives the Access stub on `127.0.0.1:8787`. It does not call Cloudflare.

## Sessions

iOS can copy the Safari Access cookie into the installed app. The first standalone launch might already be signed in. It might not. Both are checked locally: a preset `CF_Authorization` cookie opens the shell, and a missing cookie is one redirect to the login page. The login page does not bounce.

An authenticated identity that is not on the allowlist gets **403** and the page "This account isn't on the allowlist." That page does not redirect and does not reload. A missing or expired session is **401** at the worker. In front of the worker, the Access stub turns that into one redirect to login. The shell treats HTTP 401 and an opaque redirect as "Session expired — [ sign in ]". It treats 403 as the allowlist banner and stays put.

## Operator setup, after P3

Nothing here creates a Worker, a D1 database, DNS, or an Access application. When that approval exists:

1. Create the preview Access app on its hostname. Session 15 minutes for the iPhone check. Bypass `/manifest.webmanifest`, `/icons/*`, `/apple-touch-icon.png`, and `/healthz`.
2. Create D1 `sploot-rs-preview`, put its id in `env.preview`, and apply `migrations/` with wrangler. Do not use the all-zero id.
3. `wrangler secret put CSRF_KEY --env preview`
4. Seed the owner. Keep the address out of git:

```sql
INSERT INTO owners (id, created_at) VALUES ('owner', '2026-10-04T00:00:00Z');
INSERT INTO identities (subject, kind, owner_id, scopes, created_at, revoked_at)
VALUES ('EMAIL', 'human', 'owner', '', '2026-10-04T00:00:00Z', NULL);
```

5. Deploy is a separate recorded step. This CI workflow has no deploy job.

`seed.demo.sql` inserts only `demo@sploot.test`. `unmapped@sploot.test` is a test identity with no row.

Error pages inline `app.css` because `/app.css` requires an owner. The CSP `style-src` adds that stylesheet's sha256 so the inline copy can load. `script-src` stays `'self'`.

S0 replaces the skeleton and Access check from misty-step/sploot#372. Search, Vectorize, the harness, and `ensure_schema` stayed behind.

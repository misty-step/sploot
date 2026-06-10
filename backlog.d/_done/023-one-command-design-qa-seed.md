# One-command design QA seed

Priority: P2 · Status: done · Estimate: S

## Goal

An agent can seed a deterministic QA user plus renderable asset fixtures
locally with one command — and tear them down — without dropping database
constraints.

## Oracle

- [ ] A `pnpm --filter web qa:seed` (name flexible) provisions the qa-local
      user and ≥20 assets that render at `/app` under qa-local auth against
      local pgvector, without modifying CHECK constraints.
- [ ] A teardown mode removes everything it created; `git status` stays clean.
- [ ] The workflow is documented in-repo (e.g. `apps/web/docs/` or the QA
      harness docs), not only in agent session memory.

## Notes

The 2026-06-10 design QA pass required: dropping the `assets.blob_url` CHECK
constraints (which require `https://*.public.blob.vercel-storage.com/*`),
hand-upserting a `users` row, serving images from `public/qa-blob-seed/`, and
dismissing the client integrity banner (`use-assets.ts` validates URLs contain
'blob'/'vercel'). That dance is documented only in agent memory.

Options: a dev/QA-only allowlist for local seed URLs in both validators, or
seed with constraint-shaped URLs proxied by a dev-only route. Builds directly
on the 018 qa-local auth harness; this is the data half that 018 left out.

## What Was Built

PR #209 (`59f62de`). pnpm --filter web qa:seed / --teardown: QA user +
generated PNG fixtures with CHECK-compliant URLs on a reserved
sploot-qa-seed host; QA-only image loader maps the host to static files.
Verified rendered at /app under qa-local auth. Documented in docs/AUTH.md.

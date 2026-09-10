# Web

Canonical repo instructions are `../../AGENTS.md`. `VISION.md` is optional and is not a work gate.

## Boundaries

- This workspace retains the Next.js predecessor's DigitalOcean, Neon Postgres/pgvector, Vercel Blob, Clerk, Replicate and Sentry contracts. Canonical serving is the separate Go instance at `https://sploot.mistystep.io`; native runtime cutover does not authorize deleting predecessor source, provider data or CI. Historical Next browser events use first-party `/api/telemetry`.
- Read `docs/adr/010-digitalocean-runtime-controls.md` before changing hosting, caching, embedding limits, or provider surfaces. The provider-retirement gate rejects new compute-provider runtime.
- Product-facing copy follows root `DESIGN.md`. Do not apply that voice to commits, pull-request text, or engineering docs.

## Checks

Use `CI=1 pnpm test` in this package, or `CI=1 pnpm --filter web test` from the repository root, for a one-shot Vitest run. Interactive `pnpm test` is watch-capable. Database-backed paths need `DATABASE_URL` against pgvector Postgres after named migrations; report `DB path unverified` when that evidence is missing. Hosted `merge-gate` remains authoritative.

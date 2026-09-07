# Sploot

Sploot is a personal meme library: save images, find them with semantic text search, and feed the library from the browser extension or MCP server.

## Surfaces

- `apps/web` owns the Next.js App Router UI and API, Clerk auth, Prisma/Neon Postgres with pgvector, Vercel Blob, Replicate embeddings, Sentry diagnostics, and DigitalOcean deployment. Route contract: `apps/web/docs/API.md`. Token-scoped save/search: `apps/web/docs/PUBLIC_API.md`.
- `apps/extension` owns the WXT Chrome extension, Clerk WebSSO, capture, store listing, and Chrome Web Store packet. Unpacked output is `apps/extension/dist/chrome-mv3`.
- `apps/mcp` owns `@sploot/mcp` / `sploot-mcp`.
- `packages/common` owns shared upload limits, MIME validation, and API types. Add shared code in `packages/common/src/`, export it from `index.ts`, and import it as `@sploot/common`.

`README.md` is current product scope, `DESIGN.md` is design law, `ARCHITECTURE.md` plus each app architecture file are boundaries, and `docs/five-faces.md` is the surface ledger. `VISION.md` is optional intent, not a workflow or work gate. Linear owns current work. Historical issues are context, not a queue.

Product-facing copy follows `DESIGN.md` (deadpan, one slang term, functional labels). Operational and engineering prose stays factual.

## Invariants

- Use pnpm only. Base branch is `origin/master`.
- Prisma reads `DATABASE_URL` when its Rust engine initializes. Do not add aliases such as `POSTGRES_URL`. A pooled Neon URL uses a `-pooler` host and `pgbouncer=true`; shipping schema uses named migrations. Privileged deploy authority is `apps/web/scripts/migrate-deploy.mjs`. CI migrates `pgvector/pgvector:pg15`.
- `@sploot/common` is the shared upload/MIME/API source. Update both consumers and `apps/web/docs/API.md` when route behavior changes.
- Clerk keys must match the target: `pk_test_*` with localhost for development, `pk_live_*` with `https://www.sploot.app` for production. Web deploy and extension release are separate surfaces with separate evidence.
- Hosted GitHub `merge-gate` is the ship gate. Do not weaken database, auth, migration, WXT, provider-retirement, design, economics, or environment checks. A skipped database path is `DB path unverified`, not a pass. A local command subset is not hosted CI parity.
- One-shot web tests under an interactive terminal: `CI=1 pnpm --filter web test`.
- Report exact proof and acceptance scope. Raw QA packets stay out of Git by default; see `docs/qa/README.md`. `pnpm dev:local:down` deletes `.sploot-local/`, including default QA packets.
- Keep secret values out of chat and repository files.

## Load-bearing risks

- Extension release needs authenticated right-click upload/duplicate proof and a current Chrome Web Store dashboard receipt.
- Health-route Prisma connection changes around `apps/web/app/api/health/route.ts` need runtime evidence.
- Embedding scheduler and rate-limit changes must keep database processing locks, per-user/global Postgres leases, minute windows, `EMBEDDING_DAILY_BUDGET`, Sentry breach reporting, and the separate cron/manual-route bounds.
- `.github/workflows/release.yml` must prove the configured GitHub token path without weakening permissions.
- `apps/web/docs/API.md` is hand-maintained and can drift from routes.

## On-demand

Path rules: `.omp/rules/prisma-db.mdc`, `common-contract.mdc`, `extension.mdc`.
Skills: `.agents/skills/misty-sploot/` (token-scoped MCP) and `.agents/skills/sploot-qa/` (real-surface QA).
Provider/runtime boundary: `apps/web/docs/adr/010-digitalocean-runtime-controls.md`.

# Sploot

Sploot is a pnpm Turborepo for a personal meme library: save images, find them with semantic text search, and use the browser extension or MCP server to feed the library.

## Surfaces and authorities

- `apps/web` owns the Next.js App Router UI and API, Clerk auth, Prisma/Neon Postgres with pgvector, Vercel Blob storage, Replicate embeddings, Sentry diagnostics, and DigitalOcean deployment. Its route contract is documented in `apps/web/docs/API.md`; the published token-scoped save/search contract is `apps/web/docs/PUBLIC_API.md`.
- `apps/extension` owns the WXT/React Chrome extension, popup/background capture, Clerk extension auth, API client, store listing, and Chrome Web Store release packet.
- `apps/mcp` owns `@sploot/mcp` / `sploot-mcp`, exposing token-scoped save and search tools.
- `packages/common` owns shared upload limits, MIME validation, and API response types used by web and extension. Put shared code in `packages/common/src/`, export it from `index.ts`, then import it through `@sploot/common`.
- Read `VISION.md` for product direction, `ARCHITECTURE.md` plus each app's architecture file for boundaries, and `docs/five-faces.md` for the status ledger.
- Work from the operator's current request. Check current code and overlapping work; historical issues are context, not a required queue.

## Commands

Use `pnpm` from the repository root:

```sh
pnpm install
pnpm dev                 # all apps
pnpm dev:web             # web only
pnpm dev:extension       # extension only
pnpm build
pnpm lint
pnpm type-check
pnpm test
pnpm clean

pnpm --filter web test
pnpm --filter web db:migrate:dev
pnpm --filter web db:studio
pnpm --filter extension build
pnpm --filter extension build:prod
```

Use `CI=1 pnpm --filter web test` for a one-shot web test run under an interactive terminal. The CI-parity gate and DB caveats live in `.omp/RULES.md` and `.omp/commands/gate.md`.

## Environment

Web runtime values belong in the web environment/secret manager: `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, and `SENTRY_AUTH_TOKEN`. Extension dev/prod values are `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`, and `VITE_CLERK_SYNC_HOST` in `.env` / `.env.production`. MCP uses `SPLOOT_API_TOKEN`; keep all secret values out of chat and repository files.

## Contracts and production safety

- Use pnpm only; base branch is `origin/master`.
- Prisma reads `DATABASE_URL` when its Rust engine initializes. Do not add aliases such as `POSTGRES_URL`. A pooled Neon URL uses a `-pooler` host and `pgbouncer=true`; schema changes that ship use named migrations, and CI deploys them against `pgvector/pgvector:pg15`.
- Treat `@sploot/common` as the single shared upload/MIME/API source. Update both consumers and `apps/web/docs/API.md` when route behavior changes.
- Keep web deploy and extension release as separate surfaces with separate evidence. A matching Clerk key is required: `pk_test_*` with localhost for dev and `pk_live_*` with `https://www.sploot.app` for production.
- Report completed work in the session or PR with exact proof, links, and acceptance-criterion evidence.
- The legacy harness and repo-local lifecycle catalogs are retired. Use globally installed Harness Kit skills; add a local exception only when it is specific to Sploot and keep the bridge narrow.

## Gates, hooks, and release

The full ship gate is the CI-parity sequence in `.omp/commands/gate.md`. Do not weaken a gate or hide a DB, auth, migration, WXT, or environment failure. CI additionally performs a frozen install, Prisma migration against pgvector, web and extension lint/test/build, the retrieval-quality eval, the economic-safety ratchet, and the required `merge-gate` aggregate job.

Lefthook runs secret scans, lint, and type checks locally; local tests that need pgvector remain CI-backed. GitHub Actions is the release gate. DigitalOcean `deploy_on_push` sends a green merge to `master` to production only after the required `merge-gate`; extension packages are submitted manually from `apps/extension/.output/`.

## Known production risks

- Before an extension release, verify authenticated right-click upload/duplicate behavior and the Chrome Web Store dashboard receipt against current state.
- Stale Prisma serverless connections around `apps/web/app/api/health/route.ts` need runtime evidence when that path changes.
- Embedding scheduler/rate-limit changes must preserve DB processing locks, per-user/global Postgres leases, minute windows, `EMBEDDING_DAILY_BUDGET`, Sentry breach reporting, and the separate cron/manual-route bounds.
- Release fixes in `.github/workflows/release.yml` must prove the `GH_RELEASE_TOKEN` path without weakening permissions.
- `apps/web/docs/API.md` is hand maintained and can drift from routes; include its updates with the corresponding code change and evidence.

## Path-scoped guidance

`.omp/rules/prisma-db.mdc`, `common-contract.mdc`, and `extension.mdc` carry path-specific database, shared-package, and extension facts. `.agents/skills/misty-sploot/` documents the MCP tools; `.agents/skills/sploot-qa/` documents real-surface QA and evidence paths.

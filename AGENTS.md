# Sploot

Sploot is a pnpm Turborepo for a personal meme library: save images, find them with semantic text search, and use the browser extension or MCP server to feed the library.

## Surfaces and authorities

- `apps/server` owns the persistent local Go/HTML/HTMX product: SQLite, private filesystem media, local CLIP inference, built-in accounts and extension device pairing. No SaaS credentials are required. Its runtime and recovery procedure is in `apps/web/docs/DEPLOYMENT.md`; route ownership is in `apps/web/docs/API.md`.
- `apps/web` retains the deployed Next.js predecessor, Clerk auth, Prisma/Neon Postgres with pgvector, Vercel Blob storage, Replicate embeddings, Sentry diagnostics, and DigitalOcean deployment. This source and existing production data are not migrated by running the local Go product. The published token-scoped save/search contract is `apps/web/docs/PUBLIC_API.md`.
- `apps/extension` owns the WXT/React Chrome extension, popup/background capture, instance selection, device-paired bearer auth, API client, store listing, and Chrome Web Store release packet.
- `apps/mcp` owns `@sploot/mcp` / `sploot-mcp`, exposing token-scoped save and search tools.
- `packages/common` owns shared upload limits, MIME validation, and API response types used by web and extension. Put shared code in `packages/common/src/`, export it from `index.ts`, then import it through `@sploot/common`.
- Use `README.md` for current product scope, `DESIGN.md` for design constraints, `ARCHITECTURE.md` plus each app's architecture file for boundaries, and `docs/five-faces.md` for the surface ledger. `VISION.md` is optional intent/economic context, not a mandatory workflow or work gate.
- Work from the operator's current request. Linear owns current work, prioritization, and selected unresolved opportunities. Check current code and overlapping work; historical issues are context, not a required queue.

## Commands

Use `pnpm` from the repository root:

```sh
pnpm install
pnpm dev                 # persistent local Go product
pnpm dev:web             # retained Next predecessor
pnpm dev:extension       # extension only
pnpm build
pnpm lint
pnpm type-check
pnpm test
pnpm clean

pnpm --filter server run doctor
pnpm --filter server test:integration
pnpm test:local          # isolated real-browser/local-inference gauntlet
pnpm --filter web test
pnpm --filter web db:migrate:dev
pnpm --filter web db:studio
pnpm --filter extension build
pnpm --filter extension build:prod
```

Use `CI=1 pnpm --filter web test` for a one-shot web test run under an interactive terminal. The CI-parity gate and DB caveats live in `.omp/RULES.md` and `.omp/commands/gate.md`.

## Environment

The local Go runtime uses `SPLOOT_DATA_DIR` (default repository `.sploot-local/library` via `pnpm dev`), `SPLOOT_MODEL_DIR` (default user cache), and an optional `SPLOOT_BASE_URL`. First startup downloads pinned model/runtime files. Shutdown never removes accounts or media. Off-loopback access requires HTTPS and an explicit registration policy; see the runtime procedure.

Predecessor web values belong in its environment/secret manager: `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, and `SENTRY_AUTH_TOKEN`. The extension selects its instance in the popup; `VITE_API_BASE_URL` sets the initial URL, not credential authority. MCP uses `SPLOOT_API_TOKEN` and optional `SPLOOT_API_BASE_URL`; keep all secret values out of chat and repository files.

## Contracts and production safety

- Use pnpm only; base branch is `origin/master`.
- The Go library owns versioned SQLite migrations and its private data directory. Never seed, reset, or remove an operator's library during acceptance; use isolated directories and restore targets.
- In the retained Next predecessor, Prisma reads `DATABASE_URL` when its Rust engine initializes. Do not add aliases such as `POSTGRES_URL`. A pooled Neon URL uses a `-pooler` host and `pgbouncer=true`; schema changes that ship use named migrations, and CI deploys them against `pgvector/pgvector:pg15`.
- Treat `@sploot/common` as the single shared upload/MIME/API source. Update both consumers and `apps/web/docs/API.md` when route behavior changes.
- Keep local acceptance, production deployment, and extension release as separate surfaces with separate evidence. Clerk key matching applies only to the retained Next predecessor. The current extension requires an instance implementing device pairing.
- Report completed work with exact proof and acceptance scope; link the PR and a sanitized conclusion from the Linear work item or session. Raw QA packets belong in approved retained artifact storage, not in Git by default; keep fixtures and selected public demo assets versioned. See `docs/qa/README.md`.
- The legacy harness and repo-local lifecycle catalogs are retired. Use globally installed Harness Kit skills; add a local exception only when it is specific to Sploot and keep the bridge narrow.

## Gates, hooks, and release

The full ship gate is the CI-parity sequence in `.omp/commands/gate.md`. Do not weaken a gate or hide a DB, auth, migration, WXT, or environment failure. CI additionally performs a frozen install, Prisma migration against pgvector, web and extension lint/test/build, the retrieval-quality eval, the economic-safety ratchet, and the required `merge-gate` aggregate job.

Lefthook runs secret scans, lint, and type checks locally; predecessor tests that need pgvector remain CI-backed. GitHub Actions is the release gate. DigitalOcean `deploy_on_push` sends a green merge to `master` to production only after the required `merge-gate`; extension release artifacts are built under `apps/extension/dist/` and submitted manually.

## Known production risks

- Before an extension release, verify authenticated right-click upload/duplicate behavior and the Chrome Web Store dashboard receipt against current state.
- Stale Prisma serverless connections around `apps/web/app/api/health/route.ts` need runtime evidence when that path changes.
- Predecessor embedding scheduler/rate-limit changes must preserve DB processing locks, per-user/global Postgres leases, minute windows, `EMBEDDING_DAILY_BUDGET`, Sentry breach reporting, and separate cron/manual-route bounds. Local inference must preserve owner-fenced durable claims and immutable model/preprocessing identity.
- Release fixes in `.github/workflows/release.yml` must prove the `GH_RELEASE_TOKEN` path without weakening permissions.
- `apps/web/docs/API.md` is hand maintained and can drift from routes; include its updates with the corresponding code change and evidence.

## Path-scoped guidance

`.omp/rules/prisma-db.mdc`, `common-contract.mdc`, and `extension.mdc` carry path-specific database, shared-package, and extension facts. `.agents/skills/misty-sploot/` documents the MCP tools; `.agents/skills/sploot-qa/` documents real-surface QA and evidence paths.

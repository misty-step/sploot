# Sploot

Sploot is a personal meme library: save images, find them with semantic text search, and feed the library from the browser extension or MCP server.

## Surfaces

- `apps/server` owns the persistent Go/HTML/HTMX product: SQLite, private filesystem media, local CLIP, built-in accounts and extension device pairing. No SaaS credentials are required. Runtime/recovery: `apps/web/docs/DEPLOYMENT.md`. Routes: `apps/web/docs/API.md`.
- `apps/web` retains the Next.js predecessor source and its Clerk, Prisma/Neon Postgres, Vercel Blob, Replicate, Sentry and DigitalOcean contracts. The canonical hosted Go origin is `https://sploot.mistystep.io`; running another Go instance does not migrate identities/data or authorize removal of retained providers/gates.
- `apps/extension` owns WXT capture, instance selection, device-paired bearer auth, store listing and the Chrome Web Store packet. Unpacked output is `apps/extension/dist/chrome-mv3`.
- `apps/mcp` owns `@sploot/mcp` / `sploot-mcp`.
- `packages/common` owns shared upload limits, MIME validation and API types. Add shared code in `packages/common/src/`, export it from `index.ts`, and import it as `@sploot/common`.

`README.md` is current product scope, `DESIGN.md` is design law, `ARCHITECTURE.md` plus each app architecture file are boundaries, and `docs/five-faces.md` is the surface ledger. `VISION.md` is optional intent, not a workflow or work gate. Linear owns current work. Historical issues are context, not a queue.

Product-facing copy follows `DESIGN.md` (deadpan, one slang term, functional labels). Operational and engineering prose stays factual.

## Invariants

- Use pnpm only. Base branch is `origin/master`.
- `pnpm dev` runs the persistent Go library; `pnpm dev:web` runs the retained predecessor. Never seed, reset or remove an operator's `.sploot-local/library` during acceptance. Use isolated libraries and restore targets. Shutdown never deletes accounts or media.
- Prisma reads `DATABASE_URL` when its Rust engine initializes. Do not add aliases such as `POSTGRES_URL`. A pooled Neon URL uses a `-pooler` host and `pgbouncer=true`; shipping schema uses named migrations. Privileged deploy authority is `apps/web/scripts/migrate-deploy.mjs`. CI migrates `pgvector/pgvector:pg15`.
- `@sploot/common` is the shared upload/MIME/API source. Update both consumers and `apps/web/docs/API.md` when route behavior changes.
- Clerk key matching applies only to the retained Next predecessor: `pk_test_*` for development, `pk_live_*` for production. The current extension requires an instance implementing device pairing. Local acceptance, web deployment and extension release are separate surfaces with separate evidence.
- Hosted GitHub `merge-gate` is the ship gate. Do not weaken database, auth, migration, WXT, provider-retirement, design, economics or environment checks. A skipped database path is `DB path unverified`, not a pass. Local checks and Go acceptance commands live in `apps/web/docs/DEPLOYMENT.md#acceptance-gates`; a local command subset is not hosted CI parity.
- One-shot web tests under an interactive terminal: `CI=1 pnpm --filter web test`.
- Report exact proof and acceptance scope. Raw QA packets stay out of Git by default; see `docs/qa/README.md`. The retired `dev:local:down` command is not a cleanup procedure.
- Keep secret values out of chat and repository files.

## Load-bearing risks

- Extension release needs authenticated right-click upload/duplicate proof and a current Chrome Web Store dashboard receipt.
- Health-route Prisma connection changes around `apps/web/app/api/health/route.ts` need runtime evidence.
- Predecessor embedding scheduler and rate-limit changes must keep database processing locks, per-user/global Postgres leases, minute windows, `EMBEDDING_DAILY_BUDGET`, Sentry breach reporting and separate cron/manual-route bounds. Local inference must preserve owner-fenced durable claims and immutable model/preprocessing identity.
- `.github/workflows/release.yml` must prove the configured GitHub token path without weakening permissions.
- `apps/web/docs/API.md` is hand-maintained and can drift from routes.

## How to build here

Agents over-build. Ship the smallest change that solves the core user story. Question requirements. Keep the product focused. Say no to speculative knobs, queues, layers, and flags.

Deep modules, simple interfaces (Ousterhout): no shallow pass-through wrappers, no single-use constant modules, no config knobs that push complexity onto callers, no test seams in production config.

Good taste (Torvalds): remove special cases. Reuse existing helpers. When you add a new path, delete the old one in the same PR. Don't break existing users or API contracts (status codes, receipts, stored data). If a data identity changes, ship the data step with it.

Prefer end-to-end, integration, and user-story tests: `pnpm --filter server test:integration`, the go-server smoke `pnpm --filter server smoke --binary build/sploot`, and `sploot doctor --url … --json`. No tautological unit tests (for example, asserting a SQL string contains a fragment). Fix flaky tests in their own PR, not inside a feature PR.

Before starting, check open PRs and branches that touch the same files or area, and sequence your work after them rather than racing. Keep PRs small and readable. Every PR description includes "What I deleted / didn't build".

Canonical shared helpers (reuse, don't copy):

- Stored id grammar: `contract.ValidAssetID`, `apps/server/internal/contract/ids.go`
- SHA-256 hex grammar: `contract.ValidSHA256Hex`, `apps/server/internal/contract/checksum.go`
- MIME allowlist: `contract.IsAllowedMIME`, `apps/server/internal/contract/generated.go` (generated from `@sploot/common`; normalization moving to contract in pending #352, today `normalizeMIME` in `apps/server/internal/ingest/media.go`)
- UTF-16 length: `utf16Length`, `apps/server/internal/library/service.go` (moving to contract in pending #356; don't add another copy)
- ECMAScript trim: `trimClientWhitespace`, `apps/server/internal/library/tags.go` (same note, pending #356)
- Tag-name identity: `normalizeTagName`/`normalizeTagNames`, `apps/server/internal/library/tags.go` (exported for upload in pending #345)
- Owner/ready checks: `(*Service).ready`, `(*Service).beginOwner`, `validateID`, `badRequest`, `apps/server/internal/library/service.go`
- Owner media path: `ingest.OwnerMediaPrefix`, pending #349. Today the layout is inlined; also see `validMediaPath` in `apps/server/internal/ingest/storage.go`
- Cancel-aware I/O: `ctxio.Reader`/`ctxio.Writer`, `apps/server/internal/ctxio/ctxio.go`
- Cross-process media/library lock: `medialock.Acquire`, `apps/server/internal/medialock/lock.go`
- Idempotent save receipts: `(*Service).claim`, `apps/server/internal/ingest/ingest.go`. It is the single receipt lookup; don't add a second query.

## On-demand

Path rules: `.omp/rules/prisma-db.mdc`, `common-contract.mdc`, `extension.mdc`.
Skills: `.agents/skills/misty-sploot/` (token-scoped MCP) and `.agents/skills/sploot-qa/` (real-surface QA).
Go configuration, acceptance and recovery: `apps/web/docs/DEPLOYMENT.md`.
Production deploy and rollback: `deploy/deploy.sh`, invoked by `.github/workflows/deploy.yml`. Procedure: `apps/web/docs/DEPLOYMENT.md#deploy-and-rollback`.
Predecessor provider/runtime boundary: `apps/web/docs/adr/010-digitalocean-runtime-controls.md`.

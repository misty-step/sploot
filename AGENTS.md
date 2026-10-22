# Sploot

Shared standard: [Constitution](https://foundations.mistystep.io/) and [Way of working](https://foundations.mistystep.io/way-of-working).

Sploot is a personal meme library: save images, find them with semantic text search, and feed the library from the browser extension or MCP server.

## Surfaces

- `apps/server` owns the persistent Go/HTML/HTMX product: SQLite, private filesystem media, local CLIP, built-in accounts and extension device pairing. No SaaS credentials are required. Runtime/recovery: `docs/DEPLOYMENT.md`. Routes: `docs/API.md`. The canonical hosted origin is `https://sploot.mistystep.io`; separate local instances do not migrate identities/data.
- The Next.js predecessor workspace is retired. Its source/migrations remain in immutable `4c1eb5f1313a578347bc3f4b95fb2a3c10cd6e8f` history; private source archives and providers remain retained indefinitely. Source deletion does not authorize provider/archive destruction or another writer.
- `apps/extension` owns WXT capture, instance selection, device-paired bearer auth, store listing and the Chrome Web Store packet. Unpacked output is `apps/extension/dist/chrome-mv3`.
- `apps/mcp` owns `@sploot/mcp` / `sploot-mcp`.
- `packages/common` owns shared upload limits, MIME validation and API types. Add shared code in `packages/common/src/`, export it from `index.ts`, and import it as `@sploot/common`.

`SPEC.md` is the sole current behavior authority; QA runs against it. `README.md` is setup/navigation, `DESIGN.md` is design law, `ARCHITECTURE.md` plus each app architecture file are technical boundaries, and `docs/five-faces.md` is the surface ledger. `VISION.md` is optional intent, not a workflow or work gate. Linear owns current work. Historical issues are context, not a queue.

Product-facing copy follows `DESIGN.md` (deadpan, one slang term, functional labels). Operational and engineering prose stays factual.

## Invariants

- Use pnpm only. Base branch is `origin/master`.
- `pnpm dev` runs the persistent Go library. Never seed, reset or remove an operator's `.sploot-local/library` during acceptance. Use isolated libraries and restore targets. Shutdown never deletes accounts or media.
- `@sploot/common` is the shared upload/MIME/API source. Update the Go generator and clients plus `docs/API.md` when the contract changes.
- The extension requires an instance implementing device pairing. Local acceptance, production deployment and extension release are separate surfaces with separate evidence.
- Hosted GitHub `merge-gate` is the ship gate. Preserve independent Go, auth, recovery, WXT, MCP, shared-contract, provider-retirement, design and environment checks. Authorized predecessor retirement removes only its exclusive gates. Local checks and Go acceptance commands live in `docs/DEPLOYMENT.md#acceptance-gates`; a local command subset is not hosted CI parity.
- Report exact proof and acceptance scope. Raw QA packets stay out of Git by default; see `docs/qa/README.md`. The retired `dev:local:down` command is not a cleanup procedure.
- Keep secret values out of chat and repository files.

## Load-bearing risks

- Extension release needs authenticated right-click upload/duplicate proof and a current Chrome Web Store dashboard receipt.
- Local inference must preserve owner-fenced durable claims and immutable model/preprocessing identity.
- `.github/workflows/release.yml` must prove the configured GitHub token path without weakening permissions.
- `docs/API.md` is hand-maintained and can drift from routes.

## How to build here

Local integration commands: `pnpm --filter server test:integration`, the go-server smoke `pnpm --filter server smoke --binary build/sploot`, and `sploot doctor --url … --json`.

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

Path rules: `.omp/rules/common-contract.mdc`, `extension.mdc`.
Skills: `.agents/skills/misty-sploot/` (token-scoped MCP) and `.agents/skills/sploot-qa/` (real-surface QA).
Go configuration, acceptance and recovery: `docs/DEPLOYMENT.md`.
Production deploy and rollback: `deploy/deploy.sh`, invoked by `.github/workflows/deploy.yml`. Procedure: `docs/DEPLOYMENT.md#deploy-and-rollback`.
Predecessor archive and offline import boundary: `docs/DEPLOYMENT.md#production-migration-boundary`.
Run `upkeep where <task-kind>` before dispatching.

## No fallbacks

No fallbacks, backup paths or masking safety nets. Write the one best solution: direct, clean, simple, elegant. If it fails, it must fail loudly and visibly so we can fix it. Security checks (auth, signatures, schema validation) stay, but fail loudly, never silently.

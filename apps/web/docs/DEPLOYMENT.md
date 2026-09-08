# deployment

The deployed predecessor is the long-lived `apps/web` Next.js service on
DigitalOcean App Platform. The canonical origin is `https://www.sploot.app`;
the configured `master` source deployment remains separate from the Go
replacement candidate in `apps/server`.

**No Go production cutover or current real-library backup is proved.** Production
authority/current-library access is unavailable for that acceptance. Isolated
fixture recovery is not a backup of the current personal library. Keep the old
application, its deployment artifact, and the Prisma schema until real acceptance
and rollback-safe cutover. Apple signing and real iPhone acceptance are also
unperformed; see the [Shortcut procedure](./shortcuts/save-to-sploot.md).

## runtime dependencies

- Neon Postgres with pgvector, supplied as `DATABASE_URL`;
- Vercel Blob, supplied as `BLOB_READ_WRITE_TOKEN` (the one intentional Vercel
  data-plane dependency);
- Clerk identity;
- Replicate embeddings;
- Sentry error and performance diagnostics.

the embedding limiter and daily/monthly provider-attempt ceilings live in
Postgres. These counters are provider-rate safety, not durable dollar admission
or reconciliation. There is no KV, Redis, or Upstash runtime dependency.

## Go candidate runtime

The default `pnpm dev:local` / `pnpm dev` command runs the candidate against a
fresh disposable local database, not production and not Next.js. The complete
[local start/stop commands](../../../README.md#quick-start) live in the root
README. `pnpm --filter server smoke` boots, exercises, and removes an isolated
session; `pnpm --filter server build` produces both Go binaries.

For an intentional provider-connected run:

```bash
pnpm --filter server build
apps/server/build/sploot -env-file "$HOME/.config/sploot/server.env"
```

Create that trusted environment file outside the checkout as a private regular
file, mode `0600`. The server accepts `KEY=value` assignments; it does not
discover a checkout `.env` file. Do not paste credentials into commands, logs,
or repository files. This command starts HTTP and the indexing worker together;
it does not provision accounts, apply migrations, or seed data.

| Binding | Candidate behavior |
|---|---|
| `DATABASE_URL` | Required explicit Postgres authority. Existing pgvector schema and account IDs are retained; a pooled Neon host must use `-pooler` and `pgbouncer=true`. The pgx connection removes that Prisma-specific startup marker. No alias is read. |
| `NEXT_PUBLIC_BASE_URL`, `SPLOOT_LISTEN_ADDR` | Exact application origin and listen host/port. Hosted origin must be HTTPS. The container listens on `0.0.0.0:3001`; local default is `127.0.0.1:3001`. |
| `SPLOOT_DEPLOYMENT_ENV`, `SPLOOT_DEPLOYMENT_COMMIT` | Explicit environment and immutable source revision. Hosted startup requires the revision. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Same Clerk instance and existing identity mappings. Hosted authentication requires matching live keys; the candidate admits no new accounts. |
| `CLERK_AUTHORIZED_PARTIES` | Optional comma-separated additional exact origins for Clerk/CORS. Preserve the intended web and Chrome-extension origins. |
| `BLOB_READ_WRITE_TOKEN` | Existing Vercel Blob write authority for enabled hosted uploads. Do not move or rewrite existing media URLs as part of runtime replacement. |
| `REPLICATE_API_TOKEN` | Required for new image indexing and uncached query embeddings. Uses the existing pinned CLIP revision and generated embedding dimension. |
| `SENTRY_DSN` | Required for hosted Go diagnostics. It is a runtime binding; the predecessor's browser source-map build bindings do not configure Go. |
| `SEARCH_CURSOR_SECRET` | Stable signing authority of at least 32 bytes; falls back to the Clerk secret, or local QA secret only outside hosting. |
| `SPLOOT_UPLOADS_ENABLED` | `false` pauses saves before media writes; default `true`. Reads/export/delete are not a full write-freeze mechanism. |
| `SPLOOT_EMBEDDINGS_ENABLED`, `SPLOOT_COST_ADMISSION_HALT` | New provider work requires embeddings enabled and admission not halted. Cached query vectors remain usable. |
| `EMBEDDING_DAILY_BUDGET` | Optional positive reduction of the generated global daily attempt ceiling; cannot raise it. Per-user/global windows, concurrency, daily/monthly counters, and database constraints remain active. |
| `STRIPE_LEDGER_BOOTSTRAP_REQUIRED` | Preserve the existing schema-readiness requirement if activated; not an instruction to enable billing. |
| `SPLOOT_MEDIA_DIRECTORY`, `SPLOOT_RESTORED_LIBRARY_DIRECTORY`, QA auth bindings | Explicit local-only ingestion or verified recovery media/auth modes; rejected in staging/production. Local ingestion and Blob write authority are mutually exclusive. |

The provider-free launcher accepts none of these authority overrides or an
`-env-file`. It clears inherited vendor/migration credentials, uses signed
loopback-only QA auth, and seeds 24 curated media fixtures plus the cached
`reaction face meme` query. New media is saved for that launch but remains
unindexed; an uncached query returns `503` with `code: "embeddings_disabled"`.
Its temporary database/media/secrets/logs are removed on shutdown. This is real
local HTTP/SQL/media proof, not Clerk/Blob/Replicate or provider-quality proof.

Live indexing requires an intentionally selected migrated database, readable
media, the real Replicate token, `SPLOOT_EMBEDDINGS_ENABLED=true`, and
`SPLOOT_COST_ADMISSION_HALT=false`. Quota/attempt ceilings must still admit work.
Saving alone is not indexing acceptance: observe the asset become ready and a
new description retrieve it. Bound isolated provider experiments with a lower
`EMBEDDING_DAILY_BUDGET`; never treat cached-fixture retrieval as live inference.

### Isolated integration database

`pnpm --filter server test:integration` runs race-enabled Go tests against the
real migrated schema. It requires FFmpeg/ffprobe, a C toolchain, and a
**fresh, exclusively owned loopback pgvector database with no users/assets or
admission state**. Do not point it at the seeded `dev:local` database, a restored
library, staging, or production.

Create a disposable database on a local pgvector Postgres 15 server. Place only
its direct `DATABASE_URL` assignment in a trusted mode-0600
`$HOME/.config/sploot/integration.env`, then run from the repository root:

```bash
(
  unset DATABASE_URL_DIRECT STRIPE_LEDGER_BOOTSTRAP_DATABASE_URL
  unset STRIPE_LEDGER_MIGRATION_DATABASE_URL STRIPE_LEDGER_BOOTSTRAP_REQUIRED
  set -a
  . "$HOME/.config/sploot/integration.env"
  set +a
  pnpm --filter web db:migrate &&
  pnpm --filter server test:integration
)
```

This uses the same named migrations, not `db push` or a substitute test schema.
Missing database evidence must be labeled **DB path unverified**; do not weaken
the guards or report skipped DB paths as acceptance.

## required environment — deployed Next.js predecessor

```env
NODE_ENV=production
DEPLOYMENT_ENV=production
SPLOOT_DEPLOYMENT_ENV=production
DATABASE_URL=
DATABASE_URL_DIRECT=
NEXT_PUBLIC_BASE_URL=https://www.sploot.app
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
BLOB_READ_WRITE_TOKEN=
REPLICATE_API_TOKEN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_TRACES_SAMPLE_RATE=0.1
SPLOOT_ENROLLMENT_MODE=closed
SPLOOT_ENROLLMENT_MAX_ACCOUNTS=
SPLOOT_DEPLOYMENT_APP_ID=${APP_ID}
SPLOOT_DEPLOYMENT_COMMIT=${_self.COMMIT_HASH}
SPLOOT_DEPLOYMENT_CHANGE_ID=
```

`DATABASE_URL_DIRECT` is preferred for migrations and the runner always fails
closed when `DATABASE_URL` is absent. The Stripe ledger schema is inert until
its webhook authorities are configured. Before billing is enabled, provision
the separate Stripe bootstrap and schema-migration roles, bind
`STRIPE_LEDGER_BOOTSTRAP_DATABASE_URL` and
`STRIPE_LEDGER_MIGRATION_DATABASE_URL` to the singleton PRE_DEPLOY job, and set
`STRIPE_LEDGER_BOOTSTRAP_REQUIRED=true` on both that job and the web runtime.
With the runtime flag enabled, `/api/health` reads the bootstrap marker through
the restricted application role and binds its version to the newest applied
Prisma migration. Before billing activation, omit the runtime flag (or set it
to `false`); limiter/schema health stays mandatory without referencing an
intentionally absent Stripe bootstrap. The PRE_DEPLOY runner refuses to derive
either privileged authority from the runtime pooled URL.

The privileged Stripe ledger bootstrap is a three-phase state machine recorded
in `sploot_bootstrap.stripe_ledger_bootstrap_state`: the transactional
pre-bootstrap commits `preparing`, the transactional post-bootstrap commits
`ready`, and any failure runs the existence-safe rollback which commits
`failed`. If even the rollback fails, `migrate-deploy.mjs` writes a last-resort
`failed` marker plus a durable failure report
(`stripe-ledger-bootstrap-failure-report.json`, path overridable via
`STRIPE_BOOTSTRAP_REPORT_PATH`). The always-on migration-history gate uses the
workspace `pg` client and needs no external binary; the privileged bootstrap
phases shell out to `psql`, so activating billing requires proving `psql`
exists in the PRE_DEPLOY image (it is not required before then). The single declared contract version lives in
`apps/web/prisma/stripe-ledger-bootstrap.version`; every psql invocation of the
pre/post scripts must pass it as the `bootstrap_version` variable (the helper
and CI both read the file — an unset variable is a hard failure). Both fault
paths can be rehearsed with
`PGOPTIONS="-c sploot.stripe_bootstrap_fault=pre|post"`.

`SPLOOT_DEPLOYMENT_ENV` is the deterministic deployment marker. Production and
staging deployments must set it explicitly. Bind it and
`SPLOOT_DEPLOYMENT_COMMIT=${_self.COMMIT_HASH}` with scope
`RUN_AND_BUILD_TIME`: Sentry compiles the browser environment and release into
the build. Runtime-only bindings cannot repair an already compiled browser.
Keep `SPLOOT_DEPLOYMENT_APP_ID=${APP_ID}` and `SPLOOT_DEPLOYMENT_CHANGE_ID`
at `RUN_TIME`. Set
`SPLOOT_DEPLOYMENT_CHANGE_ID` to a nonempty immutable operator-generated
change ID. DigitalOcean assigns the provider deployment ID after the update;
record it in the proof packet, never in the public health contract. The public
enrollment endpoint intentionally returns only `configuration`, `mode`, and
`status`; use the authenticated admin readback and provider receipt for
deployment identity and diagnostics. `status: "unknown"` (HTTP 503) is the
distinct database-unavailable read under a valid GA/capped configuration —
fail-closed for sign-up but never mislabeled as an ordinary policy pause;
`closed` mode never touches the database and always reports `paused`.

`SPLOOT_ENROLLMENT_MODE` is the server-owned pre-GA containment boundary. In
`capped` mode, new `users` rows are admitted only while the aggregate count is
below `SPLOOT_ENROLLMENT_MAX_ACCOUNTS`; Postgres serializes the count and
insert. `closed` pauses new accounts. Missing or malformed values fail closed
in production. Existing users do not pass through this admission check, so
reads, downloads/exports, and deletes remain available.

## Platform routing health vs deep readiness

DigitalOcean routes the web service on
`services[name=web].health_check.http_path`, and that path MUST be the
shallow process-liveness endpoint `/api/health/live` — never the deep
DB-backed oracle `/api/health`. Incident 2026-07-15: production routed on
`/api/health`, a database stall made it 503 at its 5s timeout, and
DigitalOcean removed the only web instance from routing
(`no_healthy_upstream`) until a scoped restart. Liveness has no database,
provider, Clerk, telemetry, network, or model dependency, so a dependency failure can
never evict the process from routing.

The repo-owned lifecycle enforces this: `deriveClosedStageSpec` installs
`health_check.http_path=/api/health/live` (preserving other authored probe
knobs), and every staged, GA, and rollback mutation is validated with
`assertRoutedSpecBindings`. Only the one-time legacy pre-bind
(`--bootstrap-bindings`) leaves an old runtime's probe untouched, because
that runtime cannot serve the liveness route yet.

`/api/health` remains the deep readiness oracle for operators, deployed
verification, and diagnostics. It stays fail-closed (503 on database, schema,
or required-bootstrap failure) and shares one bounded database probe across
concurrent requests. A request timeout never launches duplicate database work.
Next.js uses its shared Prisma
client; Go uses a bounded shared pgx probe. Neither uses readiness failure to
disconnect the runtime database pool globally.

## Automatic DigitalOcean release on merge — predecessor

The recorded predecessor configuration has `github.deploy_on_push: true` on
both the `web` service and `web-pre-deploy-migrate` job. That binding was set
and verified on 2026-07-23 for App Platform app
`29aea848-c348-4189-97ac-0ab2d7309567`. This historical receipt is not a current
deployment readback and does not switch the service to Go.

The safety boundary is `master` branch protection, not a manual release
gate: GitHub's required `merge-gate` aggregate must pass before a commit can
reach protected `master`. A merged PR is not evidence that the provider
deployment finished; compare the actual source and running artifact after
DigitalOcean completes the deployment.

`apps/web/scripts/deployment-provider-transaction.mjs` owns this invariant in
code: `applySourceDescriptor` unconditionally forces `deploy_on_push: true`
on the `web` service and the `web-pre-deploy-migrate` job every time the
enrollment lifecycle stages, lifts, or rolls back a spec, so no lifecycle
mutation can silently disable it again.

Before recording a deployed claim, compare the intended commit with the
active App Platform source commit and confirm no deployment is in progress.
The predecessor's `GET /api/version` returns the latest release tag (or `null`),
not the running commit; it cannot prove source identity by itself.
`pnpm --filter web enrollment:lifecycle` remains useful without `--apply` for
predecessor enrollment-mode dry-run validation and readback. Verify the active
source commit, `/api/version`, `/api/health/live`, `/api/health`, enrollment state,
and production migration history before recording acceptance. The candidate's
route differences are explicit in [`API.md`](./API.md).


## deploy contract — deployed Next.js predecessor

```bash
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web start
```

The build is compilation-only and intentionally needs no runtime database or
application secret bindings. Bind `NEXT_PUBLIC_SENTRY_DSN` at
`RUN_AND_BUILD_TIME` and `SENTRY_AUTH_TOKEN` as an encrypted `BUILD_TIME`
secret. The production build requires these bindings and uploads source maps
under `SPLOOT_DEPLOYMENT_COMMIT`, then deletes local source maps.
`SENTRY_DSN`, if set separately, is runtime-only. The local/CI
`pnpm deployment:build` command deliberately clears all Sentry bindings; it
proves compilation without sending events or uploading source maps, not a
production Sentry release. DigitalOcean owns
production migration: the singleton `web-pre-deploy-migrate` `PRE_DEPLOY` job
runs `pnpm --filter web exec node scripts/migrate-deploy.mjs` before replacing
the service, while the service run command remains start-only. CI applies
migrations only to its pgvector test database and never owns production
credentials. Migrations are forward-only and additive unless their own SQL
says otherwise.

## verification — deployed Next.js predecessor

```bash
DEPLOYMENT_URL=https://www.sploot.app pnpm --filter web validate:deployment
pnpm --filter web smoke:deployed
```

Enrollment proof must target the exact active deployment URL:

```bash
pnpm --filter web probe:enrollment -- \
  --url "$EXACT_DEPLOYMENT_URL" --expect-mode closed --expect-status paused
```

the health contract requires database `up`, the embedding limiter `up`, the
final claim-token columns/validated constraints/revival trigger `up`, and the
share-slug cache `local`. a green process without that end-to-end response is
not a verified deployment. the deployed smoke also asserts `/api/health/live`
answers `alive` — the platform routing probe is explicitly shallow, and the
deep `/api/health` contract above remains the readiness authority.

## rollback

for a deliberate application rollback, first set
`SPLOOT_EMBEDDINGS_ENABLED=false` on the web service and verify the deployed
generate-embedding route returns `503` with `code: "embeddings_disabled"`.
keep the switch false while rolling the DigitalOcean source deployment to the
last green commit, then repeat both verification commands. Do not re-enable
embeddings until the current admission runtime has been restored and its
DB-backed integration proof is green.

ADR-010's limiter tables and the `embedding_attempt_count_ceiling` database
constraint are additive and may remain. This attempt-count constraint rejects
daily counters above 2,272 and monthly counters above 68,181, so even an
automatic rollback to the former 2,000-attempt daily runtime fails closed at
the current configured attempt ceiling. It is derived from the provider-rate
model and does not enforce durable provider dollars. Older code does not
maintain the monthly bucket, which is why the kill switch is mandatory for any
deliberate or extended rollback. Forward recovery is preferred.

The embedding migrations that add `NOT VALID` constraints and their
`VALIDATE CONSTRAINT` scans are separate Prisma migrations. The repo-owned
runner supplies five-second `lock_timeout` and 30-second `statement_timeout`
to every Prisma migration, including the immutable 150000/150100/150200
additive history; a timeout aborts that migration and leaves the previous
committed phase intact. Do not combine an ADD and VALIDATE step or manually
remove the claim-token/revival constraints during rollback. The deploy runner
and CI post-bootstrap read back the full circuit columns, attempt ceiling,
both required indexes, both validated constraints, and
`asset_embeddings_revival_budget` before
declaring the bootstrap ready.

## Rollback-safe Go cutover procedure

This is an **unperformed operator procedure**, not a deployment receipt. It
keeps the existing DO app/service, database, Blob store, Clerk instance,
Replicate model, Sentry authority, and Node migration job. A new hosted stack,
new account namespace, and dual-writing application are not required.

1. Read and privately retain the exact active DO spec, completed deployment ID,
   source revision, service build/run settings, ingress, secret bindings, and
   last known-good Next.js artifact. Confirm protected-`master`/`merge-gate`
   behavior and no deployment in progress. Historical IDs in this document do
   not replace current operator readback.
2. Obtain explicitly authorized current-library source access. Complete
   [backup, verification, and isolated restore](#library-backup-and-isolated-restore),
   then compare current account ownership, metadata, vectors, public slugs, and
   currently stored source/thumbnail bytes. Arrange writer quiescence for the recovery window;
   the upload/embedding kill switches alone do not pause metadata edits or
   deletes. Do not infer current-library recovery from seeded fixtures.
3. Exercise the candidate against an isolated restored copy and the intended
   auth/provider configuration. Require browser capture/restart/retry,
   extension save/duplicate, token save/search, download/export access, public
   links, and bounded live indexing/search evidence. Keep existing IDs and
   media references unchanged. Signing/device acceptance remains separate
   from desktop/browser evidence.
4. Only after authorized acceptance, derive a narrow spec change from the live
   spec. Preserve the existing `services[name=web]` identity, origin/ingress,
   source policy, sizing, and runtime secrets. Its Go build settings are:

   ```yaml
   # Fields on the existing web service, not a replacement full app spec.
   source_dir: apps/server
   dockerfile_path: apps/server/Dockerfile
   http_port: 3001
   health_check:
     http_path: /api/health/live
   ```

   Preserve the remaining authored health-check settings. Remove the
   predecessor's Next.js `build_command`, `run_command`, and buildpack
   `environment_slug` overrides so the Dockerfile owns compilation and its
   `tini`/`sploot` entrypoint owns startup. `source_dir` is the Docker build
   context; `dockerfile_path` is relative to the repository root
   ([DO app-spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)).
   Bind the Go environment above; do not enable QA/filesystem modes in hosting.
5. Keep exactly one `jobs[name=web-pre-deploy-migrate]` with `kind: PRE_DEPLOY`.
   It must retain the **repository-root Node workspace context**, not inherit
   `apps/server` or its Dockerfile. Keep:

   ```text
   build_command: corepack enable && pnpm install --frozen-lockfile && pnpm --filter web exec prisma generate
   run_command: pnpm --filter web exec node scripts/migrate-deploy.mjs
   ```

   Preserve its explicit database/direct/bootstrap authorities and source
   revision. The Go service never runs Prisma migrations itself. The existing
   `deployment-provider-transaction.mjs` lifecycle still hardcodes the
   predecessor's Node start command and copies its source context; **do not use
   it blindly to stage or roll back a Go service**. This document does not
   claim that automation has been converted.
6. Let PRE_DEPLOY finish before the service replacement. Verify the provider's
   completed revision, current health/version contracts, migrated readiness,
   closed enrollment, and the authenticated acceptance paths against the exact
   deployed origin. `/api/health/services` configuration flags alone are not
   proof of a successful external provider call. Keep the predecessor artifact
   and additive schema available until the rollback window is accepted.

For application rollback, pause new captures and provider work
(`SPLOOT_UPLOADS_ENABLED=false`, `SPLOOT_EMBEDDINGS_ENABLED=false`,
`SPLOOT_COST_ADMISSION_HALT=true`), restore the retained service spec/artifact
and Node build/run settings, and recheck the provider receipt, shallow liveness,
deep readiness, existing account access, public links, downloads/export, and
migration history. Keep embeddings disabled as required by the existing limiter
rollback guidance above. **Do not restore an old database over newer library
writes or drop additive schema as an application rollback.** Database disaster
recovery is a separately authorized restore to an empty isolated target.

## Library backup and isolated restore

`apps/server/build/library-backup` is an operator recovery tool, separate from
the session-authenticated web export. It captures the full database, including
identity/account data, metadata, vectors, tokens, and migration history, plus
currently stored source and thumbnail media. Database rows/catalog, archive
files, and media are checked by inventory and SHA-256; incomplete media is not
a complete backup. The tool preserves physical stored bytes and all database
metadata; it cannot reconstruct original input bytes discarded by the
predecessor's image optimization. Legacy input `size`/`checksum_sha256` values
must not be confused with physical `storage_size`/`storage_sha256` metadata.

### Authority and prerequisites

- Build with `pnpm --filter server build`. Install compatible `pg_dump` and
  `pg_restore` on `PATH`. Prefer a matched client pair for the source PostgreSQL
  major; `pg_dump` must not be older than the source, and `pg_restore` must read
  that archive version. The container currently supplies PostgreSQL 15 clients;
  a newer production source requires a compatible newer pair, not suppressing
  a version mismatch. The target server must not be older than the source.
- `backup` reads **only `DATABASE_URL`** for source authority and uses read-only
  transactions. Supply a direct URL with rights to read every source table;
  pooled endpoints and `pgbouncer=true` are refused. `DATABASE_URL_DIRECT` is
  not an alias for this tool.
- Put the source assignment in a trusted current-user-owned mode-0600 regular
  file outside Git, such as `$HOME/.config/sploot/recovery-source.env`.
  Source that file only in the backup subprocess below. Its permissions are
  an operator prerequisite; the CLI reads the exported value, not the file.
- Put **only the explicit target URL**, not an environment assignment, in
  `$HOME/.config/sploot/recovery-target.url`. The CLI enforces current-user
  ownership, regular-file type, and exactly `0600` permissions on this file.
  URLs/credentials are not command-line arguments or normal tool output.
- Create an existing private parent directory outside every repository tree.
  Set `SNAPSHOT` and `RESTORED_MEDIA` to distinct **new** paths beneath it.
  The tool creates private directories/files. Allow space for the full archive,
  all media, and a second restored media copy. Snapshots contain private data
  and executable SQL: retain them in approved private storage and restore only
  trusted archives.
- Create a fresh, empty, exclusively owned loopback target database with a
  **different database name from the source**, even on another server. Install
  pgvector on that server, but do not run migrations or pre-create the vector
  extension in the empty target. Stop all application/indexing sessions to it.
  A nonlocal isolated target requires deliberate `--allow-remote-target` on
  restore and target verification; it is never permission to restore to source.

### Capture, resume, and verify

Run from the repository root, with `SNAPSHOT` set as described above:

```bash
(
  set -a
  . "$HOME/.config/sploot/recovery-source.env"
  set +a
  unset PGSERVICE
  apps/server/build/library-backup backup --directory "$SNAPSHOT"
)
apps/server/build/library-backup verify --directory "$SNAPSHOT"
```

Public Blob delivery URLs need no Blob credentials. Additional public replicas
can use repeated `--allow-media-host` flags for exact HTTPS hostnames; do not
add wildcards or route production backup through the local fixture allowance.
For a deliberate QA-only snapshot, `--fixture-directory` is the Go ingestion
media root, or `apps/web/public` for predecessor QA media.

The database archive and source inventory share one exported read-only
snapshot. A changed sequence or failed database phase requires a **new**
snapshot directory; do not salvage it as complete. If the database-ready
manifest exists but media fetching failed:

```bash
apps/server/build/library-backup resume --directory "$SNAPSHOT"
apps/server/build/library-backup verify --directory "$SNAPSHOT"
```

Repeat any needed media-host/fixture options on `resume`. It uses SHA-verified
per-object receipts and does not reconnect to the source database; snapshot-only
`verify` also needs no database authority. A successful snapshot verification
is not yet a restore drill.

### Restore and prove recovery

```bash
apps/server/build/library-backup restore \
  --directory "$SNAPSHOT" \
  --target-url-file "$HOME/.config/sploot/recovery-target.url" \
  --media-directory "$RESTORED_MEDIA"

apps/server/build/library-backup verify \
  --directory "$SNAPSHOT" \
  --target-url-file "$HOME/.config/sploot/recovery-target.url" \
  --media-directory "$RESTORED_MEDIA"
```

Restore uses a single database transaction, never `--clean`, never drops
objects, and never retries into a populated database. It preserves application
owner IDs and data but uses the isolated target role (`--no-owner`,
`--no-privileges`), not production database-role grants. URLs are not rewritten.
Only successful database/catalog and restored-media parity produces the local
`restore.json` receipt.

If the database committed but verification was interrupted, use the second
command to recover read-only parity proof. Otherwise choose another fresh empty
target and new media directory. Fix privilege, client/archive version, pgvector,
or disk-space failures; do not bypass the safety checks.

To browse verified restored bytes with Go, select the target `DATABASE_URL` and
`SPLOOT_RESTORED_LIBRARY_DIRECTORY="$RESTORED_MEDIA"` in a separate private
runtime environment file, with a loopback origin and
`SPLOOT_DEPLOYMENT_ENV=development`. Set `SPLOOT_UPLOADS_ENABLED=false`,
`SPLOOT_EMBEDDINGS_ENABLED=false`, and `SPLOOT_COST_ADMISSION_HALT=true` during
readback. Keep the recovery directory immutable. Existing real accounts still
require their matching Clerk identity; QA auth is limited to QA identities and
is not an owner-ID override. The server verifies the media manifest/bytes at
startup and serves them without changing stored media URLs.

Retain sanitized scope/revision/verdict and the private recovery receipt under
the [QA evidence lifecycle](../../../docs/qa/README.md), not raw snapshots in
Git. Current production/library access and an actual current-library drill are
still missing; no command example here supplies that authority or proves it.

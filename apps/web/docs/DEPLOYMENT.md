# Runtime operations, recovery, and deployment

`apps/server` is the self-contained persistent Sploot product, used by the
canonical hosted library and separate local installations. `apps/web` retains
the Next.js predecessor source and provider-specific recovery operations.
Starting Go does **not** migrate or back up predecessor data. Do not apply
predecessor database/provider settings to Go or replace a deployed service as
part of a local startup. The offline conversion procedure does not itself
authorize provider writes, deletion, DNS changes, or another production cutover.

## Canonical hosted Go instance

The canonical hosted library is `https://sploot.mistystep.io`. Local
`pnpm dev` libraries remain independent. The production Go binary is pinned
at `/opt/sploot/releases/e975904b/sploot`, with deployment revision binding
`e975904b76f777147b7f2cd0c5831ba1644cf440`; its SHA-256 is
`01ff3b40957073048b0fcbb6c819f01d53f6a1db36519f8f7a63e141b22bb90a`.
The portable Go build has no embedded VCS field: the immutable artifact hash
and explicit deployment binding, not a claim about embedded Git metadata,
identify this release. Later MCP-only source changes do not reidentify this
Go executable.

Observed production bindings on 2026-09-10:

- Existing exe.dev VM `sploot-pilot.exe.xyz`, 1 vCPU, 2 GiB RAM, 10 GiB disk.
- Persistent, enabled system `sploot.service`, user/group `sploot`, listening
  on `0.0.0.0:3001` behind exe.dev HTTPS. `Restart=on-failure`,
  `TimeoutStopSec=120`, `MemoryMax=1536M`; private filesystem/hardening settings
  remain enabled.
- `/etc/sploot/production.env` selects `/var/lib/sploot/production`,
  `/var/cache/sploot/models`, production exposure, closed registration,
  enabled uploads and local embeddings. `/opt/sploot/current` selects the
  same immutable release for recovery.
- Only the exe.dev **web** gate is public; Sploot authentication protects
  private APIs/media. SSH, terminal access, existing shares and proxy port
  were not opened or broadened. Anonymous library requests return `401`.
- `/etc/sploot/recovery.env` selects the same production directory.
  `sploot-backup.service` uses the root-protected credential through
  `LoadCredential`, with `MemoryMax=256M`, `CPUQuota=50%`, idle I/O and `Nice=10`.
  Exactly one enabled `sploot-backup.timer` uses `OnCalendar=hourly` and
  `Persistent=true`; there is no separate Sploot cron scheduler.
- Private R2 bucket `sploot-recovery`: hourly snapshots protected for 72h and
  expired after 4d; daily snapshots protected for 30d and expired after 31d;
  the separate complete predecessor archive is retained indefinitely.
  The decryption identity remains in operator custody, not on the VM.

Check the actual unit, `/api/health/services`, recovery receipt and available
disk before operating; these dated bindings are not ongoing health evidence.
Backup currently stages a verified snapshot, tar and age ciphertext at once.
Account for current SQLite/WAL pages, rounded media files, directories and
tar/encryption overhead **plus** the configured 1 GiB save reserve. Do not
lower the reserve or assume this 10 GiB host can accommodate arbitrary growth.
A successful backup's remote metadata receipt is not independent restore proof.

The extension selects `https://sploot.mistystep.io` explicitly; its development
default remains loopback. Repository-built MCP defaults to
`https://sploot.mistystep.io/api` as of merged
`9d0b34b69b937fba900e9438afb1ea9d56ba82e8` (PR #339); explicit local/self-hosted
overrides remain supported. Unpacked extension and built MCP acceptance do
not claim a Web Store, npm publication, or physical Apple-device release.

`SPLOOT_REDIRECT_HOSTS=sploot.app,www.sploot.app` is the explicit native
legacy-host policy. Those registered HTTPS aliases are browser redirects,
not another writable API: GET/HEAD browser paths receive `308` to the fixed
canonical origin, preserving escaped paths and dropping queries; API paths
and other methods receive `410`. Unlisted Host values receive `421`.
DNS, alias/TLS readiness and old-record cache horizons must be verified
separately before retiring a predecessor endpoint.

On 2026-09-10 the exact approved DigitalOcean app
`68a12c8a-282e-4f1a-84bb-e7c6f074aeaa` was retired after acceptance. Provider
GET404, list absence and old default-ingress NXDOMAIN were observed. Legacy
apex A `161.210.95.211` and `www` CNAME `sploot-pilot.exe.xyz`, ten unrelated
zone records, both trusted HTTPS redirect/410 policies and canonical readiness
survived deletion. Former provider deploy/rollback recipes below are historical:
there is no remaining old app to roll back, and they do not authorize recreating
a Next writer after native saves.

Graceful stop/start, automatic recovery after an exact service-main-process
SIGKILL, actual VM reboot, and a second reboot with the timer enabled all
preserved a post-cutover original and credentials. The natural 17:00 UTC
backup completed at 17:01:32Z; its actual R2 object was independently
downloaded, hash checked, decrypted and fully verified after synthetic cleanup.
Minimum sampled free space was 2,023,264,256 bytes, preserving the 1 GiB reserve.
This is dated evidence, not a guarantee of future growth capacity.

### Controlled rollback after native writes

This is a procedure, not a claim that production was rolled back. Keep
registration closed and never resume the Next writer or its jobs.

1. Stop the timer; stop and wait for both backup and native services to become
   inactive. `uploads=false` alone does not freeze account/metadata/deletion
   writes.
2. Retain a new private copy of the **entire current** production directory:
   SQLite, any WAL/SHM/journal, media and `signing.key`, plus environment files,
   service configuration and release-link target. Encrypt it off-VM and
   independently extract/compare every file before repair. Never replace it
   with the old bootstrap or pre-cutover candidate after new saves.
3. Prefer fixing configuration around the verified native release/current
   epoch, or restore that verified current epoch into a fresh private target
   on a repaired host. Never overwrite an active SQLite directory.
   A portable restore retains passwords/material but deliberately strips
   sessions, device/PAT/invitation authority and signing key; users sign in,
   re-pair/re-mint, and unclaimed owners require fresh offline invitations.
4. Start the proposed native authority on private verification ingress with
   uploads explicitly disabled. Restrict all verification traffic, since this
   flag does not pause every mutation. Check current and post-cutover originals,
   owner isolation, search and canonical routing while the former writer stays
   stopped.
5. After acceptance, select the verified directory for the one persistent
   native service and one backup timer, still with uploads disabled. Prove
   readiness and encrypted recovery, then restore the approved public web
   ingress and reopen saves.

The old PostgreSQL/Next state has no reverse conversion of native saves.
Restoring old DNS is therefore **not** rollback. If current-epoch recovery
cannot preserve every committed save, retain it and serve maintenance until
repaired rather than reopen the predecessor. Hourly snapshots provide a
60-minute RPO objective after total host loss, not a zero-loss guarantee.
Exact source/runtime acceptance, protected receipt locations, decoder caveats
and the explicitly bounded retirement decision are recorded in `HANDOFF.md`
and MIS-46/MIS-47; retained source providers and CI are not removed by this
procedure.

## Self-contained Go runtime

The [root quick start](../../../README.md#quick-start) owns installation and the
ordinary `pnpm dev` / `pnpm dev:local` loop. It opens
`http://127.0.0.1:3001`, stores a persistent library at repository
`.sploot-local/library`, and lets users register real email/password accounts.
There is no seeded-only mode, QA login, Clerk, Neon, Blob, or Replicate prerequisite.
Email is an account identifier; email delivery/verification and password-reset
service are not implemented.

### Host prerequisites and commands

Building/running from source requires Go 1.26+ (see `apps/server/go.mod`), CGO,
a C compiler, SQLite development headers, and FFmpeg/ffprobe. On Arch, `sqlite`
supplies the headers; on Debian/Ubuntu, install `libsqlite3-dev`. Workspace
commands additionally require Node.js 22+ and pinned pnpm 10.22.0. The compiled
binary does not need Node, Postgres, Prisma, or an external inference daemon.

The model bundle supports glibc Linux and macOS on amd64/arm64. Its Linux
native runtime needs libstdc++/libgcc; musl/Alpine and Windows are unsupported.
Use the [Dockerfile](../../server/Dockerfile) for the container alternative.

From the repository root:

```sh
pnpm --filter server models:prepare
pnpm --filter server build
apps/server/build/sploot serve \
  --data-dir "$PWD/.sploot-local/library"
```

Preparation is optional: normal startup serves the library while downloading and
verifying missing artifacts. Indexing/search becomes ready only after successful
native initialization. The build emits `apps/server/build/sploot` and
`apps/server/build/library-backup`; UI/static assets and SQLite migrations are
embedded. Do not start another process on an already-used listen port.

Inspect the running instance from another terminal:

```sh
pnpm --filter server run doctor
apps/server/build/sploot doctor --url http://127.0.0.1:3001 --json
```

Doctor calls `/api/health/services` with a bounded HTTP request. It reports
SQLite/schema and actual inference readiness without account or media data.
It does not upload media, test account access, or prove retrieval quality.
`/api/health/live` is shallow liveness. `/api/health` remains HTTP 200 for a healthy
library even when search is loading/unavailable, with `status: "degraded"`,
`libraryReady: true`, `searchReady: false` and an exact `dependencies.search` state.
`/api/health/services` returns 503 while enabled inference is loading/unavailable;
explicitly disabled inference is a configured pause, not a model-ready claim.

Ctrl-C/SIGTERM stops HTTP and joins model preparation, requests and indexing
before destroying native state. Native execution is not preemptible and can
extend shutdown beyond the HTTP grace period. **Ordinary shutdown never deletes
the library or cache.** Restart with the same data directory to retain accounts,
media, shares, tokens and pending indexing work.
The retired `--session`/`--down` disposable launcher is not an operating path.

### Acceptance gates

Hosted GitHub [`merge-gate`](../../../.github/workflows/ci.yml) is the ship
authority. Native cutover alone does not authorize removal of retained
predecessor source, database/provider contracts, or CI gates.
From the repository root, run these local checks in order and record every exit:

```sh
pnpm lint
pnpm type-check
pnpm lint:design
pnpm test:economics
CI=1 pnpm --filter web test
pnpm --filter web eval:search
pnpm --filter extension lint
pnpm --filter extension test
pnpm --filter extension build
```

DB-backed predecessor tests require `DATABASE_URL` pointing to isolated pgvector
Postgres, prepared with the owned `pnpm --filter web db:migrate` procedure. Never
use production data for acceptance. A skipped DB path is **DB path unverified**,
not a pass. CI additionally owns frozen installation, restricted-role migrations,
web build/browser checks and the required aggregate; this local subset is not
hosted CI parity.

The Go product additionally requires actual SQLite, native inference and browser
acceptance:

```sh
pnpm --filter server test:integration
pnpm --filter server build
pnpm --filter server models:prepare
pnpm --filter server exec playwright install chromium
pnpm --filter server smoke --binary build/sploot
pnpm --filter extension build:e2e
xvfb-run -a pnpm --filter server smoke --extension --binary build/sploot
docker build --tag sploot-local apps/server
```

The gauntlet allocates new private libraries and uses actual pinned CPU CLIP.
It never seeds or deletes the ordinary `.sploot-local/library`. Linux native
extension capture needs `xdotool`; the shared Chromium launcher selects X11
under Xvfb without changing the caller's Wayland environment. A prepared model
cache can be reused; downloads are needed only for missing pinned artifacts.
Keep local evidence separate from production migration, Apple device/signing
and Chrome Web Store release receipts.

### Configuration and private-directory lifetime

CLI flags override process settings; process settings take precedence over an
explicit optional `--env-file`. No checkout `.env` file is auto-discovered.
An environment file must be a private regular file (mode `0600`) containing
supported `KEY=value` assignments, not a shell script or provider credentials:

```sh
apps/server/build/sploot serve \
  --env-file "$HOME/.config/sploot/server.env"
```

| Setting / CLI | Local runtime behavior |
|---|---|
| `SPLOOT_DATA_DIR` / `--data-dir` | Library root; pnpm's launcher supplies repository `.sploot-local/library`. The binary's fallback is `.sploot-local/library` relative to its working directory. Use an absolute path for overrides. |
| `SPLOOT_MODEL_DIR` / `--model-dir` | Separate reusable artifact cache; default OS user-cache directory plus `sploot/models`. It is not a library or a backup destination. |
| `SPLOOT_LISTEN_ADDR` / `--listen` | Default `127.0.0.1:3001`. `--port` selects another loopback port and cannot be combined with `--listen`; `PORT` supplies the fallback port when no listen address is set. |
| `SPLOOT_BASE_URL` / `--base-url` | Exact canonical browser/API origin. Derived from a loopback listen address by default. Off-loopback access requires explicit HTTPS; hosted environments require HTTPS even on loopback. Preserve this Host through a proxy. |
| `SPLOOT_REDIRECT_HOSTS` | Optional comma-separated legacy DNS hostnames, without schemes, ports or wildcards. Their GET/HEAD browser paths redirect permanently to the canonical origin with query strings discarded. API paths and other methods return 410; unlisted hosts remain rejected. Configure DNS and proxy aliases separately. |
| `SPLOOT_REGISTRATION_OPEN` | `true` by default only for loopback development/test. Nonlocal/hosted access requires an explicit `true` or `false`. Closing registration does not revoke existing accounts. |
| `SPLOOT_UPLOADS_ENABLED` | `true` by default; `false` pauses saves, not metadata edits, deletion, downloads, or export. |
| `SPLOOT_EMBEDDINGS_ENABLED` | `true` by default; `false` disables new local indexing/query embeddings. It is an explicit operational pause, not the ordinary startup mode. |
| `SPLOOT_STORAGE_LIMIT_BYTES` | Nonnegative instance-wide retained-media ceiling; `0` (default) means no artificial limit. Includes originals, previews, trash and unfinished reclamation. |
| `SPLOOT_STORAGE_RESERVE_BYTES` | Nonnegative minimum free disk after a worst-case save reservation; default `1073741824` (1 GiB). `0` removes the extra reserve, not the incoming-write space check. |
| `SPLOOT_DEPLOYMENT_ENV` | `development` by default; accepts `development`, `test`, `staging`, or `production`. It controls exposure policy, not vendor selection. |
| `SPLOOT_DEPLOYMENT_COMMIT` | Optional immutable revision for diagnostics; otherwise the executable derives available build revision metadata. |
| `SENTRY_DSN` | Optional diagnostics. No telemetry credential is required. |

The pnpm launcher runs the server with `apps/server` as its working directory;
relative overrides resolve there. Vendor/database variables are not local Go
authority, and the optional environment-file parser rejects unsupported keys.
`DATABASE_URL`, Clerk keys, Blob tokens, and Replicate tokens configure only the
retained predecessor.

Keep the live data directory current-user-owned and mode `0700`, including when
supplying a pre-existing path. `library.sqlite`, its WAL/SHM companions, `media/`,
and the generated private 32-byte `signing.key` form the library. The key is a
private regular file, not a value to paste into an environment file. Do not
delete it to repair a startup error. Filesystem privacy is not encryption;
protect the host and backups accordingly. Never copy only a live SQLite file
while ignoring its WAL; use the recovery commands below.

### Storage admission and permanent trash reclamation

These settings are operator policy, not user plans. Saves serialize their
worst-case spool/publication reservation across processes sharing the library,
check filesystem availability before reading media, then enforce the instance
ceiling transactionally. Unknown free space fails closed. Disk reserve includes
space consumed outside the media ledger, such as SQLite, models and other files.
An instance limit is not a disk-size limit or a backup-retention policy.

Settings reports only the signed-in owner's retained bytes, including trash;
it does not disclose another account's usage or invent a remaining allowance.
Moving a meme to trash revokes its public share but keeps its original and preview.
The browser's separately confirmed **Delete permanently** action reclaims those
files. Paired-device and personal-token credentials cannot perform this action.
Deletion does not erase copies already present in backups.

A durable owner-fenced purge intent is committed before physical deletion.
Startup completes interrupted purges; retries never remove a restored/live asset
or replay a purged upload receipt. Retained tombstones are not a trash-restore path.
Capacity/reserve failures return 507 and require storage management, not automatic
retries; inability to inspect disk returns 503 `storage_unavailable`.

### Pinned local inference

[`apps/server/internal/inference/bundle.json`](../../server/internal/inference/bundle.json)
is the model, preprocessing, runtime, license, size, and SHA-256 authority.
It pins `Xenova/clip-vit-base-patch32` revision
`d15189d7028b43f1d3e65039190477f6af591c2a`, separate quantized text/vision ONNX
encoders, aligned normalized 512-D projections, and ONNX Runtime 1.22.0's CPU
execution provider. There is no GPU requirement or fake/cached-fixture fallback.

The first preparation fetches public weights/tokenizer/preprocessing from the
pinned Hugging Face revision and a matching native runtime from GitHub.
Incomplete or mismatched artifacts are not loaded. Subsequent starts verify
and reuse the installed bundle; complete caches support offline indexing and
search. The immutable version directory and install lock belong to the cache,
not to an account. Recovering a library can reuse or re-download that cache.
Preparation failure leaves HTTP, account access, saved media, saves and export
available and leaves pending indexing untouched. Inspect the logged failure,
repair permissions/artifacts/native libraries and restart; there is no automatic
initialization retry loop or fallback to old cached vectors.

One native executor prioritizes FIFO interactive queries over queued indexing.
At most eight queries wait, for at most 15 seconds; a waiting indexer gets a turn
after four queries. Queue overflow/expiry returns 429 `embedding_busy` with
`Retry-After: 1`. Loading returns 503 `embedding_loading` with `Retry-After: 2`;
unavailable/disabled states require operator action rather than automatic retry.

Use the same explicit directory for preparation and runtime when overriding it;
the standalone preparation helper takes `-directory`, not the server's
`--model-dir`:

```sh
pnpm --filter server models:prepare -directory "$HOME/.cache/sploot/models"
apps/server/build/sploot serve \
  --data-dir "$PWD/.sploot-local/library" \
  --model-dir "$HOME/.cache/sploot/models"
```

The preparation helper also accepts `-text "a description"` and
`-image "/absolute/path/to/poster.png"` to run actual CPU inference and report
vector dimensions/norms and, when both inputs are supplied, cosine similarity.
Preparation alone proves artifact installation, not a successful library search.
Resolve network, permissions, disk-space, unsupported-platform, and native
library errors rather than substituting fabricated vectors or disabling a gate.

### Container runtime

The existing `apps/server/Dockerfile` builds the CGO application and recovery
binaries and supplies FFmpeg/ffprobe. Build context is `apps/server`:

```sh
docker build --tag sploot-local apps/server
```

The image runs as UID/GID `10001`, binds container `0.0.0.0:3001`, and defaults
to production exposure rules. It needs a durable volume at
`/var/lib/sploot/library` and a separate cache volume at
`/var/cache/sploot/models`. Bind mounts must be writable by that user and keep
the library private; an ephemeral container layer is not library storage.

For an operator-provided HTTPS reverse proxy, replace the example origin below
with the actual reachable origin before running. The proxy must preserve the
canonical Host and terminate HTTPS; this command does not provision DNS/TLS:

```sh
docker run --name sploot-local \
  --publish 127.0.0.1:3001:3001 \
  --mount type=volume,source=sploot-library,target=/var/lib/sploot/library \
  --mount type=volume,source=sploot-models,target=/var/cache/sploot/models \
  --env SPLOOT_BASE_URL=https://sploot.example.net \
  --env SPLOOT_REGISTRATION_OPEN=true \
  sploot-local
```

Choose registration policy deliberately. HTTP on a private container port is
not permission to advertise an off-loopback HTTP origin. Use `docker stop
sploot-local` and `docker start --attach sploot-local` to stop/reopen it; neither
removes the named volumes. Never remove a library volume as routine cleanup.
No DigitalOcean change or container deployment receipt is implied by this recipe.

### Local acceptance versus predecessor gates

`pnpm --filter server smoke` owns a fresh temporary acceptance library and
Chromium process; it does not seed or reset the ordinary library. It covers
real accounts, new local inference, media, browser/mobile-viewport behavior,
restart, export, and isolated recovery. It requires Playwright Chromium and the
host media/build prerequisites. `pnpm --filter server test:integration` uses
isolated SQLite state with the race detector; no `DATABASE_URL` is required.

The [extension procedure](../../extension/README.md) distinguishes real-backend
device-pairing/capture checks from deterministic API fixtures. A responsive
mobile browser exercise is not physical iPhone, Apple signing, or Chrome Web
Store proof. Those release boundaries remain in their owning procedures.
Run conclusions belong in the work record, not in this operating manual.

## Retained Next.js predecessor

Everything below through [predecessor rollback](#rollback--retained-nextjs-predecessor)
describes retained Next.js procedures, not the canonical Go deployment.

### Runtime dependencies — retained Next.js predecessor

- Neon Postgres with pgvector, supplied as `DATABASE_URL`;
- Vercel Blob, supplied as `BLOB_READ_WRITE_TOKEN`;
- Clerk identity;
- Replicate embeddings;
- Sentry error and performance diagnostics.

The embedding limiter and daily/monthly provider-attempt ceilings live in
Postgres. These counters are provider-rate safety, not durable dollar admission
or reconciliation. There is no KV, Redis, or Upstash runtime dependency.
Prisma/pgvector-backed migration and CI gates remain mandatory for this surface;
without their database evidence, report **DB path unverified**.


## required environment — retained Next.js predecessor

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

## Platform routing health vs deep readiness — retained Next.js predecessor

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
Next.js uses its shared Prisma client and never disconnects the runtime pool
globally on a readiness failure. The separate Go runtime probes SQLite and
sqlite-vec; it does not implement this predecessor limiter/bootstrap probe.

## Automatic DigitalOcean release on merge — historical predecessor

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
and production migration history before recording acceptance. The separate Go
route contracts are explicit in [`API.md`](./API.md).


## deploy contract — retained Next.js predecessor

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

## verification — retained Next.js predecessor

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

## Rollback — retained Next.js predecessor

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

## Production migration boundary

The self-contained Go product is **not** a drop-in runtime replacement on the
Postgres/Clerk/Blob authorities. Its SQLite schema, password accounts, private
media, local model identity, and device protocol are different. The explicit
offline converter below creates a new native library; starting the server or
using native backup/restore alone does not perform predecessor conversion.

Retain Next.js source and artifacts, named Prisma migrations, and vendor data.
The exact approved DigitalOcean runtime and associated deployments/jobs were
retired on 2026-09-10; that retirement does not authorize broader removal.
Any further production migration requires
separate authorization, source access, an identity/data conversion contract,
verified original-media recovery, acceptance on the intended origin, and a
rollback strategy that preserves writes. A local SQLite backup or a green
browser smoke is not evidence for any of those source-library obligations.
The existing deployment lifecycle automation remains predecessor-specific.

### Offline predecessor conversion

`sploot import-predecessor` consumes three private inputs:

1. A complete capture root with `capture.json`, schema/retrieval artifacts and
   every downloaded object. Schema is `sploot.predecessor.capture.v1`; `tables`
   maps exact public PostgreSQL table names to untouched `row_to_json` rows,
   `clerkUsers` contains complete Clerk REST user JSON, and `objects` contains
   `{url,pathname,size,sha256,path}` with measured stored-byte receipts.
   `completeness.database`, `.clerk`, `.objects`, and `.verified` must all be true.
   `counts.tables`, `.users`, `.assets`, `.clerkUsers`, `.objects`, and `.bytes`
   must match the captured collections. All public tables, not just native
   product tables, belong in the capture. Its JSON is bounded to 256 MiB.
2. A **stopped, consistent native base clone**, including `library.sqlite`,
   `signing.key` and media. It must have no SQLite WAL, SHM or rollback journal.
   The importer copies files without opening source SQLite and never modifies
   this base. A normal portable backup is not a substitute: it strips the
   sessions and signing secret this operation is required to preserve.
3. A private JSON mapping with schema `sploot.predecessor.mapping.v1`.
   `owners` must enumerate the complete union of DB and Clerk identities.
   `{sourceUserId,targetUserId}` selects an existing base account by exact ID.
   `{sourceUserId}` creates a separate account preserving that source ID;
   optional `loginEmail` is an explicit login-identifier override for collisions
   or missing email. Two source identities cannot map to the same target.
   No email is compared to infer an existing-account link.

Every directory is current-user-owned mode0700 and every input file is a
mode0600 regular file. Symlink components are rejected. Source, base, target
and archive must be separate; target/archive must be new and outside Git.
The claims file must also be new, in a separate private parent outside those
directories and Git. Allocate space for the whole source archive, native media,
generated posters, database, and the later backup/restore exercise.

From the repository root, after building:

```sh
apps/server/build/sploot import-predecessor \
  --capture-directory "$CAPTURE" \
  --base-directory "$OFFLINE_BASE" \
  --mapping-file "$PRIVATE_OWNER_MAPPING" \
  --target-data-dir "$NEW_NATIVE_LIBRARY" \
  --archive-directory "$NEW_SOURCE_ARCHIVE" \
  --claims-file "$NEW_PRIVATE_CLAIM_LINKS" \
  --base-url https://sploot.example.net \
  --invitation-lifetime 24h
```

This command has no network/provider authority and sends no email. It verifies
every captured hash/size, preserves the entire capture tree in the separate
archive, and records the exact capture JSON, mapping and conversion report in
the private native `predecessor_imports` table. Neither that table nor the raw
source archive is exposed by owner media/search/export APIs.

Native asset IDs, ownership, created/updated/deleted timestamps, favorites,
shuffle keys, valid public slugs, tags and links are retained. Main media files
are **exact current stored bytes**, with native size/checksum and storage
receipts measured from those bytes. Historical upload receipts remain untouched
in provenance; transformed stored bytes are never described as byte-identical
historical uploads. Source dimensions remain in capture; native dimensions and
genuine JPEG posters come from the same constrained FFmpeg/ffprobe decoder as
uploads, without rewriting main files. All new embeddings are pending local
512-D work, including deferred trash; no old 768-D vector becomes native ready.
Native MIME and filename extensions describe the stored bytes, not a stale
historical upload label. Standard ISO MP4 brands pass the same constrained
video decoder used by new uploads. Prisma timestamp-without-zone values retain
their UTC meaning and fractional precision; untouched source JSON remains provenance.

Different predecessor IDs may have identical canonical bytes after historical
transforms. Native schema preserves each identity with its own path, timestamps,
favorites, shares and trash state. It indexes owner/checksum without enforcing
identity uniqueness by content; ordinary saves still deduplicate atomically
inside immediate SQLite writer transactions, choosing a live match before trash
and then the earliest created ID deterministically. The private report records
canonical duplicate groups, historical-original recovery candidates, and
unassigned objects. Recovered originals and unassigned blobs stay in the
nonsearchable source archive; they are not guessed into an owner's collection.

An invalid, conflicting or trashed share stops import with a private issue.
Resolve it explicitly in mapping `shares`, for example
`{assetId,action:"replace",slug:"valid-new-slug",reason:"operator decision"}`
or `{assetId,action:"revoke",reason:"operator decision"}`. The original share and
decision remain in provenance; no incompatible share is silently dropped.
Compatible `/s/{slug}` and `/m/{id}` links exist on the new origin only until
separate redirect/cutover work establishes old-domain continuity.

Mapped accounts retain their existing password hashes, signing key and native
sessions. All other identities receive unusable password markers and separate
one-use invitations. The private claims JSON contains the only plaintext links;
the database stores token hashes, a one-minute-to-seven-day expiry and consumption
state. Opening a link does not consume it. The same-origin password claim is
transactional, owner-fenced and uses the ordinary password/cookie conventions.
Registration can remain closed. Protect and deliver these links individually
through an authorized channel; do not paste them into logs or issue trackers.

To replace an expired invitation, stop the relevant native instance first:

```sh
apps/server/build/sploot invite-owner \
  --data-dir "$OFFLINE_NATIVE_LIBRARY" \
  --user-id "$UNCLAIMED_NATIVE_ID" \
  --base-url https://sploot.example.net \
  --claims-file "$NEW_PRIVATE_CLAIM_LINKS" \
  --invitation-lifetime 24h
```

This operator action rotates only an unclaimed account's token; it cannot reset
an activated account's password. The instance must be offline without SQLite
sidecars. No automatic mail or general password-reset service is provided.
This also works immediately after a portable restore, before its first server
startup: invitation issuance requires an offline database, not the signing key
deliberately excluded from snapshots. The server generates its new key on startup.

The importer stages privately and publishes the target with atomic no-replace
rename only after native media/recovery checks. On rejection, no partial target
or claim file is published; retain the new archive's `import-report.json`,
resolve the actual failure and use fresh output names. A failure after the final
publication/durability boundary requires inspecting the complete target and
private report rather than deleting or overwriting it.

Before promotion, run native backup, verify, isolated restore and target verify
below on the actual converted library, then exercise account isolation,
downloads, JPEG posters, shares, trash, password claims and real local indexing
on the intended origin. **Back up/encrypt the separate complete source archive
as well as the native snapshot**, and verify independent recovery before any
predecessor retirement. The native backup preserves embedded source metadata,
but deliberately does not include the external archive or plaintext claim links.
Portable restore strips invitations and sessions; unclaimed accounts require
fresh offline invitations after restore.

### Scheduled encrypted remote snapshots

`apps/server/scripts/backup-remote.py` runs the native backup and verification
commands, encrypts the complete snapshot with an age public recipient, uploads
to private R2, and checks remote size/SHA-256 metadata before recording success.
It requires Python3, boto3, age, tar and the built `library-backup`.
The decryption identity belongs in separate operator custody, never on the VM.

The `apps/server/deploy/sploot-backup.service` and `.timer` templates run one
hourly scheduler as the `sploot` user. Install the runner at
`/opt/sploot/backup-remote.py`, point `/opt/sploot/current` at the selected release,
and supply a root-owned mode0600 `/etc/sploot/recovery.env` containing
`SPLOOT_DATA_DIR`, `SPLOOT_BACKUP_RECIPIENT` and
`SPLOOT_BACKUP_BUCKET_URL=https://<account-id>.r2.cloudflarestorage.com/sploot-recovery`.
Supply a separately protected `/etc/sploot/recovery.credentials` in AWS INI
format (`[default]`, `aws_access_key_id`, `aws_secret_access_key`), restricted
to the recovery bucket. Systemd passes it through `LoadCredential`; the runner
accepts its root-owned, read-only ACL credential inside `CREDENTIALS_DIRECTORY`.
Standalone credential files must remain owner-only. No secret belongs in command
arguments or the public recipient setting.

Enable only the intended production scheduler, never a preview or VM clone.
Hourly objects use `production/hourly/`; the first successful run each UTC day
also uploads a distinct `production/daily/` object. Configure bucket locks and
lifecycle rules separately: hourly protection72h/expiry4d, daily
protection30d/expiry31d, preserving unrelated rules. Retain the encrypted full
predecessor capture separately under protected `predecessor/`.

Run the service once and inspect `/var/lib/sploot/recovery-status.json` before
enabling the timer. A failed attempt writes the adjacent `.failure` receipt and
does not replace the last successful receipt. A fresh upload/HEAD receipt is
not restore proof: download independently, decrypt, restore into a new private
directory, verify before startup, then exercise that restored library.

## Library backup and isolated restore

This procedure recovers **Go SQLite libraries, local or hosted**, not the retained
Postgres/Blob library. `library-backup` is an operator full-library utility,
distinct from the per-owner `/api/library/export` ZIP. The same subcommands
are available as `sploot backup/resume/verify/restore`.

### Snapshot contents and credential lifetime

Backup uses SQLite's online backup API for a consistent committed database,
including WAL state, then copies immutable referenced originals and posters
with byte-count and SHA-256 verification. The portable copy retains all
accounts and password hashes, asset IDs/original filenames, metadata, vectors,
tags, favorites, trash, public share slugs, completed receipts, and indexing
state. Interrupted indexing claims become pending; in-progress upload leases
are not portable completed receipts.

**Portable recovery deliberately invalidates credentials on the restored
copy.** Browser/device sessions, pairing requests, personal upload tokens,
account invitations and authentication attempts are removed; `signing.key` is
excluded. Users retain passwords but must sign in, mint new `splt_` tokens,
and pair devices again; unclaimed accounts need new operator invitations.
The restored server creates a fresh signing key. Source accounts and
credentials are untouched by backup/restore. Model files are a separately
reusable cache, not private-library backup contents.

Snapshots still contain private media and password hashes. Keep them in
approved private storage and restore only trusted snapshots. Hash parity is
integrity evidence, not encryption or a guarantee that an untrusted snapshot
is safe.

### Capture, resume, and verify

Build the tools with `pnpm --filter server build`. No database URL, `pg_dump`,
`pg_restore`, remote storage token, or provider account is needed.

Use a current-user-owned mode-`0700` source directory. Snapshot and restore
destinations must be outside Git repositories, separate from the source and
each other, with an existing private parent. A snapshot destination must be
new; a restore target must be absent or an empty mode-`0700` directory.
Allow space for the full database/media snapshot and a second restored copy.

From the repository root, choose unused destination names on every new capture:

```sh
umask 077
mkdir -p -m 0700 "$HOME/.local/share/sploot/recovery"
DATA_DIR="$PWD/.sploot-local/library"
SNAPSHOT="$HOME/.local/share/sploot/recovery/snapshot-001"
RESTORED="$HOME/.local/share/sploot/recovery/restored-001"

apps/server/build/library-backup backup \
  --data-dir "$DATA_DIR" --directory "$SNAPSHOT"
apps/server/build/library-backup verify --directory "$SNAPSHOT"
```

For a custom live library, set `DATA_DIR` to its actual absolute path. Backup
uses SQLite's online snapshot and holds a shared media-coordination lock until
all referenced files are copied and verified. Saves can continue; permanent
deletion requires the exclusive lock and waits. Upload/embedding switches are
not a full write freeze. Never declare an incomplete media copy a complete backup.

If the frozen database manifest exists but copying media was interrupted:

```sh
apps/server/build/library-backup resume \
  --data-dir "$DATA_DIR" --directory "$SNAPSHOT"
apps/server/build/library-backup verify --directory "$SNAPSHOT"
```

Resume retains that frozen database, reuses verified objects, and repairs
missing/corrupt copies from the same live media root; it does not recapture
newer metadata. If the database phase did not complete, use a new snapshot
directory. `verify` alone requires no source-library authority. Optional bounds
are `--max-object-bytes`, `--object-timeout` (default `5m`, range `1s`–`1h`),
and `--timeout` (default `2h`, maximum seven days). Diagnose real copy, privacy,
integrity, and disk-space failures rather than bypassing safety guards.
An interrupted backup no longer holds its media lock. Keep permanent deletion
paused until resume succeeds: a subsequently purged original that was never
copied cannot be recovered from that frozen snapshot. Use another verified
recovery copy or create a new current snapshot; do not discard the verification
failure or substitute newer metadata.

### Restore, prove parity, then reopen

Do not run a service against the restore target during these commands:

```sh
apps/server/build/library-backup restore \
  --directory "$SNAPSHOT" --target-data-dir "$RESTORED"
apps/server/build/library-backup verify \
  --directory "$SNAPSHOT" --target-data-dir "$RESTORED"

apps/server/build/sploot serve --data-dir "$RESTORED" --port 3002
```

Restore stages the verified SQLite database and media beside the target, then
publishes atomically. It never replaces an existing library or retries into a
populated target. `restore.json` records snapshot identity, verified database/
object parity, and credential policy. Target verification is **before startup**:
once the app writes sessions, indexing state, or library changes, the target is
intentionally no longer byte-identical to the snapshot.

Open `http://127.0.0.1:3002`, sign in with a restored account's password, and
check its expected media, metadata, playback, and downloads. Pair devices and
mint personal tokens afresh. Reuse the original model cache or pass an explicit
`--model-dir`; recovery never needs the source account's old session credential.
Keep the source and snapshot intact while proving restored behavior.

Keep raw snapshots and private receipts out of Git. The
[QA evidence lifecycle](../../../docs/qa/README.md) owns retained run evidence;
link a sanitized scope/revision/verdict from the work record. This procedure
does not establish recovery or migration of the unchanged old real library.

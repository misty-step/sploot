# Runtime operations, recovery, and deployment

`apps/server` is the self-contained persistent Sploot product, used by the
canonical hosted library and separate local installations. The Next.js
predecessor workspace is retired; its complete private archive and immutable
source history remain recovery material, not a second runtime.
Starting Go does **not** migrate or back up predecessor data. Do not apply
predecessor database/provider settings to Go or replace a deployed service as
part of a local startup. The offline conversion procedure does not itself
authorize provider writes, deletion, DNS changes, or another production cutover.

## Canonical hosted Go instance

The canonical hosted library is `https://sploot.mistystep.io`. Local
`pnpm dev` libraries remain independent. The observed API deployment binding for
the MIS-47 source-retirement decision was
`4c1eb5f1313a578347bc3f4b95fb2a3c10cd6e8f`; health was `ok` and search ready.
That configured revision is not executable identity. Verify the service's
actual running executable, immutable artifact hash and release target alongside
`/api/version` before operating; a health response or `current` symlink alone
does not prove which artifact systemd started.

The historical cutover Go binary recorded on 2026-09-10 was pinned
at `/opt/sploot/releases/e975904b/sploot`, with deployment revision binding
`e975904b76f777147b7f2cd0c5831ba1644cf440`; its SHA-256 is
`01ff3b40957073048b0fcbb6c819f01d53f6a1db36519f8f7a63e141b22bb90a`.
The portable Go build has no embedded VCS field: the immutable artifact hash
and explicit deployment binding, not a claim about embedded Git metadata,
identify that historical release, not the current deployment.

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

### Deploy and rollback

`deploy/deploy.sh` is the production deploy path. GitHub Actions workflow
`.github/workflows/deploy.yml` runs it (`workflow_dispatch`, concurrency group
`production`). Do not point `/opt/sploot/current` at a release by hand.

The job only runs when dispatched on `master`. `deploy` builds that commit with
`pnpm --filter server build`, the same build CI uses. It copies `sploot` and
`library-backup` to `/opt/sploot/releases/<full sha>/`, requires at least 1 GiB
free under `/var/lib/sploot`, and starts `sploot-backup.service`. The switch
waits for a new `status: ok` receipt in `/var/lib/sploot/recovery-status.json`.
It records the previous **running executable's** release directory for rollback,
not a potentially stale `current` link or environment-bound revision. It points
`/opt/sploot/current` at the new
directory, sets `SPLOOT_DEPLOYMENT_COMMIT` in `/etc/sploot/production.env`, and
binds the existing production service's `ExecStart` to `/opt/sploot/current/sploot`
without changing its environment or hardening settings. After restart, the script
requires `/proc/<MainPID>/exe` to resolve to the selected release and prints its
SHA-256. An old fixed executable cannot pass by reporting a new environment-bound
commit.

The release check polls `https://sploot.mistystep.io` for three minutes:
`/api/version` must report the new sha, `/api/health` must be `ok`, anonymous
`/api/assets` must return 401, and `/` must return 303 to `/sign-in`. If that
fails, the script points `current` and `SPLOOT_DEPLOYMENT_COMMIT` back at the
previous release, restarts, and the job fails.

`rollback` switches to that saved previous release and runs the same check.
`status` prints the current and previous release paths and `/api/version`.
`query` runs one read-only statement that starts with `SELECT`, via
`sqlite3 -readonly -safe`, against `library.sqlite` in the production data directory.
The workflow connects as `exedev` at `sploot-pilot.exe.xyz` and uses sudo.

The extension selects `https://sploot.mistystep.io` explicitly; its development
default remains loopback. Repository-built MCP defaults to
`https://sploot.mistystep.io/api` as of merged
`9d0b34b69b937fba900e9438afb1ea9d56ba82e8` (PR #339); explicit local/self-hosted
overrides remain supported. Unpacked extension and built MCP acceptance do
not claim a Web Store, npm publication, or physical Apple-device release.

Cutover client acceptance retained one decoder caveat: a migrated H264 original
failed the host Chromium VAAPI decoder despite byte parity. The same original
completed playback with software decoding, full FFmpeg decode and range
requests. Originals were not transcoded and host GPU/browser policy was not
changed; this is not an all-default-browser playback guarantee.

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
survived deletion. There is no remaining old app to roll back; historical
provider records do not authorize recreating a Next writer after native saves.

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
   inactive. Confirm no process still holds the live library. `uploads=false`
   alone does not freeze account/metadata/deletion writes.
2. Retain a new private copy of the **entire current** production directory:
   SQLite, any WAL/SHM/journal, media and `signing.key`, plus environment files,
   service configuration and release-link target. Encrypt it off-VM and
   independently extract/compare every file before repair. Never replace it
   with the old bootstrap or pre-cutover candidate after new saves.
3. Prefer fixing configuration around the verified native release/current
   epoch, or restore that verified current epoch into a fresh private target
   on a repaired host. Never overwrite an active SQLite directory.
   A complete stopped raw epoch preserves credentials.
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
Linear MIS-46/MIS-47 record exact source/runtime acceptance and the bounded
retirement decision; protected receipts and recovery indexes remain under
operator-controlled `$HOME/.local/share/sploot/migration/`. Follow the
[evidence ownership policy](./qa/README.md#ownership-and-safe-handling);
do not publish raw provider output, private media or credentials.

Independent source PostgreSQL recovery proved a logical restore, not physical
or bit-for-bit recovery. Retained caveats include dropped-column ordinal
normalization, pgvector 0.8.0→0.8.6 drift, uncaptured original locale and two
historical migration checksum differences. Do not rewrite old migrations to
hide those differences. Source providers, archives and credentials remain retained. The separately
authorized MIS-47 source retirement removes the Next workspace and its
exclusive CI jobs, not provider data or independent consumer safety gates.

## Self-contained Go runtime

The [root quick start](../README.md#quick-start) owns installation and the
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
Use the [Dockerfile](../apps/server/Dockerfile) for the container alternative.

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

Hosted GitHub [`merge-gate`](../.github/workflows/ci.yml) is the ship
authority. Preserve the existing Go, extension, MCP, shared-contract, security,
design gates; the authorized Next source retirement removes
only predecessor-exclusive paths. Provider/archive retention is unchanged.
From the repository root, run these local checks in order and record every exit:

```sh
pnpm lint
pnpm type-check
pnpm lint:design
pnpm --filter extension lint
pnpm --filter extension test
pnpm --filter extension build
```

Never use production data for acceptance. CI additionally owns frozen
installation, the Go and client build/test paths, real isolated browser stories,
and the required aggregate; this local subset is not hosted CI parity.

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
`DATABASE_URL`, Clerk keys, Blob tokens, and Replicate tokens are historical
predecessor settings, not configuration for the current runtime.

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

[`apps/server/internal/inference/bundle.json`](../apps/server/internal/inference/bundle.json)
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

### Local acceptance versus release evidence

`pnpm --filter server smoke` owns a fresh temporary acceptance library and
Chromium process; it does not seed or reset the ordinary library. It covers
real accounts, new local inference, media, browser/mobile-viewport behavior,
restart, export, and isolated recovery. It requires Playwright Chromium and the
host media/build prerequisites. `pnpm --filter server test:integration` uses
isolated SQLite state with the race detector; no `DATABASE_URL` is required.

The [extension procedure](../apps/extension/README.md) distinguishes real-backend
device-pairing/capture checks from deterministic API fixtures. A responsive
mobile browser exercise is not physical iPhone, Apple signing, or Chrome Web
Store proof. Those release boundaries remain in their owning procedures.
Run conclusions belong in the work record, not in this operating manual.


## Production migration boundary

The self-contained Go product is **not** a drop-in runtime replacement on the
Postgres/Clerk/Blob authorities. Its SQLite schema, password accounts, private
media, local model identity, and device protocol are different. The explicit
offline converter below creates a new native library; starting the server or
using native backup/restore alone does not perform predecessor conversion.

The exact approved DigitalOcean runtime and associated deployments/jobs were
retired on 2026-09-10. MIS-47 separately authorizes deleting the retained Next
workspace and its exclusive users after verified Go cutover. Neither decision
authorizes deleting source providers, private archives or credentials.

The full predecessor source, named Prisma migrations and their compatibility
record remain byte-for-byte in immutable Git history at
[`4c1eb5f1313a578347bc3f4b95fb2a3c10cd6e8f`](https://github.com/misty-step/sploot/tree/4c1eb5f1313a578347bc3f4b95fb2a3c10cd6e8f/apps/web).
Use that revision for historical inspection/recovery, not a recreated writer.
The complete captured schema, PostgreSQL rows, Clerk JSON, original objects,
checksums, conversion mapping and recovery receipts remain in the protected
operator archive; do not replace it with a checkout or native SQLite snapshot.
Any further production migration requires
separate authorization, source access, an identity/data conversion contract,
verified original-media recovery, acceptance on the intended origin, and a
rollback strategy that preserves writes. A local SQLite backup or a green
browser smoke is not evidence for any of those source-library obligations.
The current deploy/rollback path is the native procedure above; no Next
deployment command remains supported.

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
provider/archive change. Retain the complete source archive indefinitely.
The native backup preserves embedded source metadata,
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
predecessor capture indefinitely under protected `predecessor/`, outside the
hourly/daily expiration policies. No source retirement changes this retention.

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
[QA evidence lifecycle](./qa/README.md) owns retained run evidence;
link a sanitized scope/revision/verdict from the work record. This procedure

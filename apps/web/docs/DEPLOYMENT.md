# deployment

the web application runs as a long-lived DigitalOcean App Platform service.
the canonical public origin is `https://www.sploot.app`; merges to `master`
trigger the configured source deployment.

## runtime dependencies

- Neon Postgres with pgvector, supplied as `DATABASE_URL`;
- Vercel Blob, supplied as `BLOB_READ_WRITE_TOKEN` (the one intentional Vercel
  data-plane dependency);
- Clerk identity;
- Replicate embeddings;
- Canary diagnostics.

the embedding limiter and daily/monthly provider-attempt ceilings live in
Postgres. These counters are provider-rate safety, not durable dollar admission
or reconciliation. There is no KV, Redis, or Upstash runtime dependency.

## required environment

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
CANARY_ENDPOINT=https://canary.mistystep.io
CANARY_API_KEY=
CANARY_SERVICE_NAME=sploot-web
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

`SPLOOT_DEPLOYMENT_ENV` is the deterministic runtime marker. Production and
staging deployments must set it explicitly; missing or ambiguous markers fail
closed and are rejected by `pnpm validate:env` before the build.
The App Platform spec must bind `SPLOOT_DEPLOYMENT_APP_ID` to `${APP_ID}` and
`SPLOOT_DEPLOYMENT_COMMIT` to `${_self.COMMIT_HASH}`. Set
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
provider, Clerk, Canary, or model dependency, so a dependency failure can
never evict the process from routing.

The repo-owned lifecycle enforces this: `deriveClosedStageSpec` installs
`health_check.http_path=/api/health/live` (preserving other authored probe
knobs), and every staged, GA, and rollback mutation is validated with
`assertRoutedSpecBindings`. Only the one-time legacy pre-bind
(`--bootstrap-bindings`) leaves an old runtime's probe untouched, because
that runtime cannot serve the liveness route yet.

`/api/health` remains the deep readiness oracle for operators, deployed
verification, and diagnostics. It stays fail-closed (503 on database, schema,
or required-bootstrap failure), shares one bounded database probe across
concurrent requests, and never globally disconnects the shared Prisma client.

## Automatic DigitalOcean release on merge

Merging `master` deploys production. The `web` service and the
`web-pre-deploy-migrate` job both carry `github.deploy_on_push: true` on the
live App Platform spec (set 2026-07-23; verified live via `doctl apps get
29aea848-c348-4189-97ac-0ab2d7309567 --output json`), so a push to `master`
starts a new App Platform deployment without any additional manual step.

The safety boundary is `master` branch protection, not a manual release
gate: GitHub requires the `merge-gate` status check (the aggregate of all 18
CI jobs, admins included) to pass before any commit can reach `master`. A
merged PR is therefore evidence that CI was green at the merge commit; it is
not yet evidence that the deployment finished. DigitalOcean typically takes a
few minutes to build and cut over traffic.

`apps/web/scripts/deployment-provider-transaction.mjs` owns this invariant in
code: `applySourceDescriptor` unconditionally forces `deploy_on_push: true`
on the `web` service and the `web-pre-deploy-migrate` job every time the
enrollment lifecycle stages, lifts, or rolls back a spec, so no lifecycle
mutation can silently disable it again.

Before recording a deployed claim, compare the intended commit with the
active App Platform source commit and `GET /api/version`, and confirm no
deployment is still in progress. `pnpm --filter web enrollment:lifecycle`
remains useful without `--apply` for enrollment-mode dry-run validation and
readback (a separate concern from the deploy trigger above). Verify the
exact active source commit, `/api/version`, `/api/health/live`,
`/api/health`, the public enrollment state, and production migration history
before recording production acceptance.


## deploy contract

```bash
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter web start
```

The build is compilation-only and intentionally needs no runtime database or
secret bindings. DigitalOcean owns production migration: the singleton
`web-pre-deploy-migrate` `PRE_DEPLOY` job runs `pnpm --filter web exec node
scripts/migrate-deploy.mjs` before replacing the service, while the service run
command remains start-only. CI applies migrations only to its pgvector test
database and never owns production credentials. Migrations are forward-only
and additive unless their own SQL says otherwise.

## verification

```bash
DEPLOYMENT_URL=https://www.sploot.app pnpm --filter web validate:deployment
EXPECT_CANARY_CONFIGURED=1 pnpm --filter web smoke:deployed
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

## sploot release verification

`release:verify` is a read-only product-runtime proof for an Estate release transaction. it never invokes `doctl`, reads provider state, writes a database/storage surface, or performs compensation. Estate remains the authority for provider readback, rollback, and quarantine.

forward mode probes the exact `/api/health/live`, `/api/health`, and `/api/health/enrollment` routes. `rollback_safety` repeats those probes, then reads the bearer only from `SPLOOT_RELEASE_VERIFIER_BEARER_TOKEN` and posts valid JSON to `/api/embeddings/text`; only the exact HTTP 503 typed `embeddings_disabled` response is accepted. redirects, non-HTTPS URLs (outside explicit local test mode), malformed/unknown/oversized/stale responses, and 401/403 responses fail closed.
ordinary probe failures still emit a signed closed packet with `ok: false`, the affected check set to `false`, and generic redacted failure observations; the process exits nonzero so automation cannot mistake it for a green run. malformed authority/input, missing bearer, invalid signing key, and expired evidence windows produce no packet.

```bash
pnpm --filter web release:verify -- \
  --transaction-id "$ESTATE_TRANSACTION_ID" \
  --mode forward \
  --target-commit "$TARGET_COMMIT" \
  --target-deployment-id "$TARGET_DEPLOYMENT_ID" \
  --target-change-id "$TARGET_CHANGE_ID" \
  --target-marker "$TARGET_MARKER" \
  --base-url "$EXACT_DEPLOYMENT_URL" \
  --observed-at "$OBSERVED_AT" --expires-at "$EXPIRES_AT" \
  --signing-key-file "$SIGNING_KEY_FILE" \
  --checks liveness,health,enrollment
```

for a local HTTP fixture only, add `--test-mode`; never use that switch for a deployed URL. rollback safety uses the same command with `--mode rollback_safety` and the bearer environment reference. the token is never accepted as a flag and never appears in evidence, signatures, errors, or logs.

evidence is closed JSON under `sploot.release-verification.v1`. observed/expiry timestamps must be current, ordered, and no more than five minutes apart. the optional `--checks` list must exactly match Estate's declared required checks (the default public set is `liveness,health,enrollment`; rollback mode also requires `rollback_safety`). the signature is detached Ed25519 over canonical UTF-8 JSON of the `evidence` object (recursively sorted object keys, array order preserved, no whitespace). the outer packet contains only `schema`, `evidence`, `signature` (base64url without padding), and `public_key` (raw 32-byte Ed25519 public key, base64url without padding). `evidence.verifier_identity` is `ed25519:<sha256(raw-public-key)>`; Estate uses that identity to select the trusted key. requested target metadata—including the base URL—is signed request binding, not an observed commit claim. `target_change_id` remains an independent caller-supplied binding; the verifier never derives it from health/version output.

```json
{
  "schema": "sploot.release-verification.v1",
  "evidence": {
    "schema": "sploot.release-verification.v1",
    "verifier_identity": "ed25519:<sha256-of-raw-public-key>",
    "transaction_id": "estate-tx-123",
    "mode": "forward",
    "requested": {
      "target_commit": "<requested-commit>",
      "target_deployment_id": "<requested-deployment>",
      "target_change_id": "<requested-change>",
      "target_marker": "<requested-marker>",
      "base_url": "https://example.invalid"
    },
    "ok": true,
    "observed_at": "2026-07-18T12:00:00.000Z",
    "expires_at": "2026-07-18T12:04:00.000Z",
    "checks": { "liveness": true, "health": true, "enrollment": true },
    "runtime": {
      "liveness": { "http_status": 200, "status": "alive", "service": "sploot-web" },
      "readiness": { "http_status": 200, "status": "ok", "timestamp": "2026-07-18T12:01:00.000Z", "version": "0.1.0", "dependencies": { "database": "up", "embedding_limiter": "up", "share_slug_cache": "local" } },
      "enrollment": { "http_status": 200, "configuration": "valid", "mode": "closed", "status": "paused" }
    },
    "safety": null,
    "redaction": "provider secrets, bearer credentials, and signing private bytes omitted"
  },
  "signature": "<base64url-ed25519-signature>",
  "public_key": "<base64url-raw-ed25519-public-key>"
}
```

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

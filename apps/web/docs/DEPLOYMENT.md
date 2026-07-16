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
record it in the proof packet, never in the spec. Runtime health must echo the
resolved app ID, change ID, commit, marker, and enrollment mode.

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

## Executable DigitalOcean lifecycle

Enrollment changes are audited DigitalOcean App Platform mutations, not local
shell environment experiments. The repo-owned command is fail-closed and
dry-run by default. It rejects a capped-first lifecycle, requires a structured
App spec with exact bindings, snapshots and proves the active closed
deployment, then performs one DigitalOcean spec update (which itself creates
the deployment), observes the single provider deployment, waits for it, and
uses the exact HTTPS health endpoint as runtime authority. The probe checks
`mode`, `gaLifted`, `acceptingNewAccounts`, app ID, change ID, marker, and
resolved commit. If any step after mutation fails, it restores the snapshotted
closed spec through the same one-update path only when the source was not
updated and the exact provider identity receipt is still available. A source
update or lost provider identity produces a redacted operator-recovery packet;
the command never pretends that a spec-only update rolled Git back. It does not print
the spec, environment values, secrets, or `doctl` output.

For the one-time transition from an older closed runtime that does not yet
expose `/api/health/enrollment`, pre-bind the deployment identity before
merging the new runtime. This spec-only transaction preserves the live source,
commands, jobs, routes, scaling, secrets, and auto-deploy setting; it does not
request a source update or probe an endpoint the old runtime cannot expose:

```bash
pnpm --filter web enrollment:lifecycle -- \
  --mode closed --bootstrap-bindings --app-id "$DO_APP_ID" \
  --url "$EXACT_DEPLOYMENT_URL" --marker production \
  --commit "$CURRENT_DEPLOY_COMMIT" --change-id "$CHANGE_ID"
```

Review the dry-run, then repeat it with `--apply`. Retain the returned provider
deployment ID and verify that the same source commit remains active. The flag
refuses already-bound or partially-bound specs, so it cannot be reused as a
general environment editor. It also refuses if `--commit` is no longer the
exact active source commit. Merge the reviewed runtime promptly after this
receipt; if an unrelated auto-deploy intervenes, stop and re-run the dry-run
against the new active commit. Once the new runtime is deployed, all later
changes use the normal closed/GA lifecycle and its live enrollment probe.

Dry-run the closed action first:

```bash
pnpm --filter web enrollment:lifecycle -- \
  --mode closed --app-id "$DO_APP_ID" --spec ./deploy/app-spec.yaml \
  --url "$EXACT_DEPLOYMENT_URL" --marker production \
  --commit "$DEPLOY_COMMIT" --change-id "$CHANGE_ID"
```

After reviewing the plan, run the same command with `--apply`. The operator's
authenticated `doctl` context performs the audited App Platform update (GA
also requests the provider-supported source update),
observes its provider deployment ID, and runs the exact URL probe. A failed
readback/probe exits non-zero and the lifecycle remains closed.

Only after the closed deployment's output and audit record are retained may a
separate deliberate GA lift run. It first proves the named closed deployment,
then applies the GA spec, redeploys, pins the new deployment, and requires the
same exact readback/probe:

```bash
pnpm --filter web enrollment:lifecycle -- \
  --mode ga --closed-deployment-id "$CLOSED_DEPLOYMENT_ID" \
  --app-id "$DO_APP_ID" --spec ./deploy/app-spec-ga.yaml \
  --url "$EXACT_DEPLOYMENT_URL" --marker production \
  --commit "$GA_COMMIT" --change-id "$GA_CHANGE_ID" --apply
```

The command is the deployment mutation authority; do not substitute an inline
local `SPLOOT_ENROLLMENT_MODE=ga` value or a public-origin probe from another
deployment. The named `--closed-deployment-id` is a provider deployment ID and
must be the exact active closed deployment at the time of a GA lift. Rollback
repeats the closed lifecycle and exact proof. No lifecycle example may use
capped as the first deployed state.

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
  --url "$EXACT_DEPLOYMENT_URL" --expect-mode closed \
  --expect-app-id "$DO_APP_ID" --expect-change-id "$CHANGE_ID" \
  --expect-commit "$DEPLOY_COMMIT" --expect-marker production \
  --expect-accepting false
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

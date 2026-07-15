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

the embedding limiter and daily spend ceiling live in Postgres. there is no KV,
Redis, or Upstash runtime dependency.

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

`DATABASE_URL_DIRECT` is preferred for migrations; the migration helper derives
the direct Neon endpoint from the pooled URL when it is absent.

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
pnpm --filter web db:migrate
pnpm --filter web build
pnpm --filter web start
```

CI applies migrations to a pgvector test database before running the web suite.
on `master`, the `migrate-prod` job applies pending migrations before the new
source build becomes the intended runtime. migrations in this repository are
forward-only and additive unless their own SQL says otherwise.

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

the health contract requires database `up`, embedding limiter `up`, and
share-slug cache `local`. a green process without that end-to-end response is
not a verified deployment.

## rollback

roll back the DigitalOcean source deployment to the last green commit, then
repeat both verification commands. ADR-010's limiter tables are additive and
may remain. a rollback to code that expected KV fails embedding generation
closed; forward recovery is preferred.

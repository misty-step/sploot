# adr-010: keep runtime controls in Postgres on DigitalOcean

status: accepted (2026-07-10)

## context

the web service now runs as one long-lived DigitalOcean App Platform component.
Vercel KV remained in three active paths even though production had no KV or
Upstash configuration:

- per-user and global embedding concurrency limits;
- per-minute and per-day embedding spend limits;
- share-slug cache warming.

the health route treated the missing KV service as `up`, so the response could
claim a dependency was healthy when no dependency existed. embedding controls
cannot become process-local: a restart or second process must not reset the
daily Replicate spend ceiling or permit more concurrent paid work.

## decision

1. store embedding rate buckets and in-flight leases in the existing Postgres
   database. one transaction-scoped advisory lock serializes the small critical
   section that checks limits and records a lease. leases expire after three
   minutes, so a crashed worker cannot consume capacity forever.
2. keep the daily budget in the same expiring bucket table. the limiter fails
   closed when Postgres or its schema is unavailable. admission lives inside
   the private Replicate service, after its durable cache lookup: every paid
   text or image cache miss must acquire the same user/global rate and
   concurrency lease plus one daily-budget slot. one admission maps to exactly
   one provider prediction attempt: Replicate runs in polling mode, a timeout
   aborts and cancels that prediction, and the lease remains held until the
   provider call settles. any caller-level retry must acquire a new admission.
   the public factory requires the authenticated owner id, and no route can
   instantiate the provider directly. asynchronous retryable failures return
   their processing row to `pending`; cron rediscovers pending and stale
   processing rows, while terminal `failed` rows stay excluded from automatic
   paid retries.
3. resolve share slugs through the process-local LRU and then the authoritative
   `assets.share_slug` database index. on a single long-running service, another
   remote cache adds failure modes without changing correctness; a cold restart
   only causes one ordinary indexed lookup per hot slug.
4. report the real health shape: database connectivity, limiter-schema
   availability, and a local share-slug cache. no unconfigured dependency is
   reported as `up`.
5. remove Vercel compute configuration, analytics, speed-insights, functions,
   and KV packages. all browser producers share one typed first-party telemetry
   client; the route owns validation/sanitization and the client rejects
   non-success responses. accepted events flow to the structured logger. Vercel
   Blob remains the one intentional Vercel data-plane dependency until the
   separate storage migration is complete.

## migration and rollback

the migration is additive: it creates `embedding_rate_buckets` and
`embedding_rate_leases` plus expiry indexes, without rewriting existing rows.
DigitalOcean applies Prisma migrations in the singleton
`web-pre-deploy-migrate` `PRE_DEPLOY` job before replacing the web service. The
service run command is start-only (`pnpm --filter web start`), so restarts and
replicas cannot rerun migrations. GitHub CI migrates only its pgvector test
database and never receives the production Neon connection string.

rolling the application back leaves both tables inert and preserves all user
data. the previous build fails embedding generation closed when its absent KV
backend is reached; it does not permit unbounded spend. share-slug resolution
still falls through to Postgres. forward recovery is therefore preferred, while
a long rollback would require restoring the previous KV service configuration.

## proof

- a DB-backed integration suite exercises concurrent acquisitions, lease
  release, expired-lease recovery, window limits, UTC daily rollover, and the
  fail-closed schema contract;
- provider-boundary tests prove paid text and image cache misses acquire and
  release admission, budget/limiter failures never call Replicate, and cache
  hits spend no capacity. timeout coverage proves one prediction is aborted in
  polling mode before its lease is released, with no hidden in-call retry;
- scheduler and cron tests prove retryable work returns to `pending`, crashed
  processing rows recover, and terminal failures are not automatically retried;
- client-to-route contract tests exercise live performance and usage producer
  envelopes, including rejection of non-success transport responses;
- the health route probes both Postgres connectivity and the two limiter tables;
- the provider-retirement guard rejects active non-Blob Vercel imports,
  manifests, environment names, endpoints, and CLI commands while allowing
  explicit Blob integration and historical evidence.

## consequences

- no separate Redis-compatible service, credential, bill, or health fiction;
- limiter correctness survives process restarts and remains safe if the service
  later gains a second process;
- limiter availability now shares the database failure domain, which is already
  required for upload, search, and slug resolution;
- Vercel Blob is deliberately still present and visible rather than hidden
  behind a misleading claim of total Vercel independence.

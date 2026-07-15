# ADR-011: Durable embedding storm resilience

## Decision

Global/provider admission backoff is stored in the single
`embedding_provider_circuits` row keyed by `replicate-image`. Global-rate,
daily-budget, and limiter-unavailable decisions open that circuit: those
denials stay true for their entire window no matter how much in-flight work
completes. Global-concurrency denial does **not** open the circuit — it means
the fixed pool of in-flight leases is saturated with healthy work, and those
leases self-release within seconds (bounded by the 180-second in-flight TTL
for a crashed worker). Opening a durable interval for it would convert
ordinary throughput saturation into a repeated multi-minute global outage. A
global-concurrency denial still defers the denied asset and still stops the
current cron batch (the batch-stop scope is deliberately broader than the
circuit-opening scope), but the next caller is admitted as soon as a lease
frees. Actual provider 429, timeout, and 5xx outcomes are typed provider
failures: each requires the exact admitted generation/probe/token lease and
opens the same circuit only when that lease still owns the row; stale late
failures are no-ops. They are also counted against the asset attempt budget.
Per-user rate and
per-user concurrency decisions
only defer that user's asset and never halt unrelated users. Cron reads the
global row before discovery, fails closed if the state store is unavailable, and
stops the current batch after the first global admission denial. A successful
provider attempt clears the open interval only through a generation- and
unique-probe-lease-token-matched lease; a stale success cannot close a newer
circuit. Cache hits do not acquire a lease and never count as provider success.
Admission/provider failure recurrence emits one structured Canary error per
open interval; limiter and route layers do not emit independent Canary
failures.

`apps/web/lib/embeddings.ts` is the provider boundary: it performs the durable
cache lookup, provider-circuit admission, user/global rate and concurrency
leases, daily-budget admission, exactly one Replicate prediction, timeout
abort, cache write, and generation-safe success recording. Uploads use
`EmbeddingSchedulerService`, so an async upload cannot bypass that boundary or
swallow retry state. Cron, manual asset retry, search, semantic piles, and the
embedding API routes all use the same service.

Image/provider attempts are counted in `asset_embeddings.attempt_count`.
Each acquired worker generation also receives a unique
`processing_claim_token`. Success, deferral, and failure transitions compare
that token and clear it atomically; the timestamp remains a TTL clock only.
This prevents a reclaimed worker from settling a newer claim even when the
legacy `updatedAt` trigger assigns both claims the same millisecond.
Failures return to `pending` with `next_attempt_at` until three attempts have
been used; the third failure sets `terminal_at` while retaining the user-visible
`failed` status. Terminal rows are excluded by both cron discovery and the
database claim predicate. Their single recovery path is owner-authorized: a
manual `POST /api/assets/{id}/generate-embedding` by the asset owner revives a
terminal row once `terminal_at` is at least fifteen minutes old
(`EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS`), atomically resetting the
attempt budget and re-entering the ordinary circuit/lease/admission boundary;
inside the quarantine the route returns `429` with
`status: "terminal_quarantine"` and a truthful `Retry-After`. Each asset may
receive at most one revival over its lifetime. Three further failures re-poison
the row; after its new quarantine expires, owner requests return `422` with
`reason: "revival_exhausted"`. The `revive_count` column, bounded check, and
transition trigger enforce that policy even if an older runtime is rolled back,
so a permanently bad asset cannot enter an unbounded paid retry loop. Cron never
revives; every revive emits a structured `embedding.terminal-revived` log with
the prior attempt count, revival count, and terminal timestamp. All retry,
terminal, circuit-open, and recovery
timestamps are computed from the caller-supplied clock; retry delays are
exponential (60s, 120s, then terminal). Admission denials do not consume an
asset attempt; provider 429s and retryable provider timeouts do.

The two build-time fixture scripts are the only direct Replicate callers
outside this runtime boundary. They are enforceably restricted to an explicit
`SPLOOT_EMBEDDING_MAINTENANCE_MODE=offline` invocation and refuse
`NODE_ENV=production`; production routes, cron, uploads, manual retries,
search, and semantic piles cannot use this exception.

## Deploy and readback

The migration is additive and is applied by the existing `prisma migrate deploy`
startup/build path and the CI production migration job. After deploy, read back:

```sql
SELECT key, failure_count, generation, open_until, probe_until,
       probe_generation, probe_lease_token, last_reason, last_failure_at,
       last_alerted_at
FROM embedding_provider_circuits;

SELECT status, attempt_count, next_attempt_at, terminal_at
FROM asset_embeddings
WHERE status = 'failed' OR terminal_at IS NOT NULL
ORDER BY updatedAt DESC;
```

The first cron invocation should return `stats.successCount`,
`stats.failureCount`, and `stats.skippedCount` honestly. During an open circuit it
returns HTTP 503 with `outcome: "backoff"`, zero work, and `Retry-After`; it does
not call the provider. A local admission deferral returns HTTP 207 with
`outcome: "partial"`, a machine-readable `deferredCount`, and per-item
`taxonomy`, `statusCode`, and `retryAfterSec` fields.

Daily-budget backoff honors the limiter's retry time through the next UTC reset;
it is not capped at the ordinary one-hour provider retry ceiling.

Every embedding `429` carries a finite `Retry-After`. Missing or malformed
provider metadata uses a 30-second default; a valid provider value is preserved
as a lower bound rather than shortened by local circuit policy, while budget
denials point to their UTC reset. Typed embedding responses carry
`X-Sploot-Embedding-Outcome`, allowing
`withObservability` to record the classification without emitting a second
generic 5xx Canary event.

## Rollback

Rollback application code first, then leave the additive columns/table in place;
the previous application ignores them and existing ready vectors remain valid.
The follow-up generation/probe migration is also additive and uses
`IF NOT EXISTS`, so a partially applied deploy can be retried safely. Do not
delete terminal rows or vectors as part of rollback.

# observability operations

the canonical instrumentation contract is [`../OBSERVABILITY.md`](../OBSERVABILITY.md).

for an incident:

1. read `/api/health` and `/api/health/services`;
2. query Canary for service `sploot-web` and the affected window;
3. correlate `traceId`, route context, and timestamp with DigitalOcean runtime
   logs;
4. replay the affected route through the deployed-smoke or authenticated QA
   harness;
5. record the request/response pair and Canary group in `docs/qa/evidence/`.

telemetry failure must never block upload, search, authentication, or health
responses. a missing limiter schema is different: it returns health 503 and
embedding generation fails closed because that path controls paid work.

the complete browser/server producer classification and executable source and
bundle falsifiers live in [telemetry-inventory.md](./telemetry-inventory.md).

## telemetry volume and retention

browser telemetry volume is bounded at both ends. observer-driven performance
metrics (FCP, LCP, image-grid CLS) emit at most once per metric per page load
(`PERFORMANCE_TELEMETRY_SAMPLING` in `lib/performance-metrics.ts`); event
metrics are bounded by their product call sites. the `/api/telemetry` route
enforces a 16 KiB request body cap (413) and a per-user fixed window of 60
requests per minute (429), failing closed when its bounded window table is
saturated.

accepted telemetry is forwarded to DigitalOcean App Platform structured logs
and, for error signals, to Canary. retention and deletion for both sinks are
provider-managed (DigitalOcean log retention; Canary retention classes): the
app holds no deletion authority over forwarded telemetry and does not claim
one. the payload contract (numbers, booleans, bounded enums, and pattern-bound
identifiers only — no free text, URLs, or user identifiers) keeps what those
providers retain bounded by construction.

clerk SDK telemetry is disabled at every surface that exposes the typed
option (`telemetry={{ disabled: true }}` on both ClerkProviders); the
extension background client has no typed option and Clerk's collector no-ops
for production publishable keys. the source and compiled-bundle falsifiers in
`scripts/check-telemetry-inventory.mjs` keep both facts checked.

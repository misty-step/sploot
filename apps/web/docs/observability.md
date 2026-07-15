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

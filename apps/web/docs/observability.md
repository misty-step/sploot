# observability operations

The canonical instrumentation contract is [`../OBSERVABILITY.md`](../OBSERVABILITY.md).

For an incident:

1. read `/api/health` and `/api/health/services`;
2. open the Sentry issue in project `misty-step/sploot`;
3. correlate release, environment, `sploot.context`, `sploot.trace_id`, and
   timestamp with DigitalOcean runtime logs;
4. replay the affected route through deployed-smoke or authenticated QA;
5. record the request/response pair and Sentry issue URL.

Telemetry failure must never block upload, search, authentication, or health
responses. A missing limiter schema is different: it returns health 503 and
embedding generation fails closed because that path controls paid work.

The complete browser/server producer classification and executable source and
bundle falsifiers live in [telemetry-inventory.md](./telemetry-inventory.md).

## telemetry volume and retention

Browser telemetry volume is bounded at both ends. Observer-driven performance
metrics (FCP, LCP, image-grid CLS) emit at most once per metric per page load.
The `/api/telemetry` route enforces a 16 KiB body cap and a per-user fixed
window of 60 requests per minute, failing closed when its bounded window table
is saturated.

Accepted first-party telemetry lands in DigitalOcean structured logs. Error
boundaries and handled server errors also land in Sentry. Both providers own
their retention and deletion. The application sends no user identity,
cookies, headers, bodies, query strings, source context, or browser replay to
Sentry. The first-party route accepts no free text, URLs, or user identifiers.

Clerk SDK telemetry is disabled at every surface that exposes the typed option
(`telemetry={{ disabled: true }}` on both ClerkProviders). The extension
background client has no typed option and Clerk's collector no-ops for
production publishable keys. `scripts/check-telemetry-inventory.mjs` keeps both
facts checked.

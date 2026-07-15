# telemetry inventory

the web app has one browser telemetry interface: `lib/telemetry-client.ts`.
its default sink is the authenticated same-origin `/api/telemetry` route. a
deployment may set `NEXT_PUBLIC_TELEMETRY_ENDPOINT` to another same-origin
path and may disable the sink with `NEXT_PUBLIC_TELEMETRY_ENABLED=false`.
cross-origin endpoints are rejected. transport failures are bounded, silent,
and never part of the product control flow.

## classifications

| producer | class | destination / decision |
| --- | --- | --- |
| upload queue, asset interactions, search interactions | browser product events | portable first-party telemetry; counts, durations, positions, scores, and booleans only |
| error boundaries | browser error signal | portable first-party telemetry; boundary/name and stack-presence booleans only |
| image failures and web vitals | browser health/performance | portable first-party telemetry; metric enum plus bounded metric tags |
| `/api/telemetry` | server telemetry sink | structured application logger; logger/Canary configuration remains the server observability authority |
| `/api/search` and `/api/search/advanced` `logSearch` | product search observability | intentional Postgres `searchLog` persistence; not a browser telemetry sink and not removed |
| `/api/analytics/usage` | authenticated usage reporting | intentional Postgres aggregate query; not a browser telemetry sink and not removed |
| retired browser Analytics/Speed Insights adapters and `/_vercel/*` | provider-only adapters | deliberate removal; no package, source, or production bundle may contain them |
| asset IDs, filenames, storage keys, URLs, pathnames, raw error text, arbitrary metadata | unsafe telemetry fields | deliberate removal from the browser contract and server sink |

the executable inventory is `scripts/check-telemetry-inventory.mjs`. it checks
the classified source markers, package/source provider residue, and (when
passed `--bundle-dir`) production JavaScript. the paired node test keeps the
provider and bundle falsifiers live:

```bash
pnpm telemetry:test
pnpm telemetry:check
pnpm telemetry:check -- --bundle-dir apps/web/.next
```

the browser QA path must capture console and network traffic from a production
build. expected telemetry, when authenticated and enabled, is only a
same-origin `/api/telemetry` request. disabled or unreachable sink behavior is
also expected to be console-clean and nonblocking. deployed network and bundle
readback remain external proof; local build output cannot claim them.

qa authentication remains the signed `qa-local` contract. `x-forwarded-for` is
not an authority and is not accepted as a fallback.

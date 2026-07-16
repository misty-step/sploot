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
| web `ClerkProvider` (`lib/auth/client.tsx`) | third-party SDK telemetry | disabled via the typed `telemetry={{ disabled: true }}` option; source and compiled markers enforced |
| extension popup `ClerkProvider` (`entrypoints/popup/App.tsx`) | third-party SDK telemetry | disabled via the typed `telemetry={{ disabled: true }}` option; source and compiled markers enforced |
| extension background Clerk client (`entrypoints/background/auth-manager.ts`) | third-party SDK telemetry | no typed option exists on `CreateClerkClientOptions`; Clerk's collector no-ops for production publishable keys (instanceType gate); rationale comment enforced by the source gate |

the executable inventory is `scripts/check-telemetry-inventory.mjs`. it checks
the classified source markers, package/source provider residue, and (when
passed `--bundle-dir`) production JavaScript. the paired node test keeps the
provider and bundle falsifiers live:

```bash
pnpm telemetry:test
pnpm telemetry:check
# web build: sink config + Clerk-disabled falsifiers over client chunks
pnpm telemetry:check -- --bundle-dir apps/web/.next/static --expect-endpoint /ci-telemetry-sink --expect-enabled false --expect-clerk-disabled
# server output and public assets: provider-residue scan
pnpm telemetry:check -- --bundle-dir apps/web/.next/server --bundle-dir apps/web/public
# extension dist: provider residue + Clerk-disabled falsifier
pnpm telemetry:check -- --bundle-dir apps/extension/dist/chrome-mv3 --expect-clerk-disabled
```

the browser QA path must capture console and network traffic from a production
build. expected telemetry, when authenticated and enabled, is only a
same-origin `/api/telemetry` request. disabled or unreachable sink behavior is
also expected to be console-clean and nonblocking. deployed network and bundle
readback remain external proof; local build output cannot claim them.

qa authentication remains the signed `qa-local` contract. `x-forwarded-for` is
not an authority and is not accepted as a fallback.

## volume and retention

server acceptance is bounded: 16 KiB body cap and a per-user 60/min fixed
window at `/api/telemetry`; observer-driven browser metrics emit at most once
per metric per page load. forwarded telemetry lands in DigitalOcean structured
logs and Canary, whose retention/TTL are provider-managed — the app has no
deletion authority over forwarded telemetry and the docs do not claim one.

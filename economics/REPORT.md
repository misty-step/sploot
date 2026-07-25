# Sploot economic safety envelope

Generated deterministically from the versioned inputs in this directory. Rates were refreshed on 2026-07-15 and CI expires them after 30 days. This is a release gate, not a forecast: paid-tier margins are modeled at on-demand rates so shared included pools cannot make an unprofitable plan look safe.

## Recommendation

- **Cardless Free:** 0.5 GB user-visible source-plus-trash allowance (rendition overhead is reserved separately), 100 new indexes and 100 novel text embeddings per month, 1 GB delivery, and at most 75 project-wide full-allowance equivalents before waitlist/paid admission. High-case variable cost is $0.19 per full account and $13.96 for the pool, below the $25.00 subsidy ceiling.
- **Collector:** $13/month, 10 GB, 600 new indexes, 900 novel text embeddings, and 10 GB delivery. Modeled direct-variable COGS is $2.74; the fully loaded margin is unavailable until shared provider costs and a paid-customer mix are declared and read back.
- **Archive:** $49/month, 100 GB, 2,000 new indexes, 2,000 novel text embeddings, and 40 GB delivery. Modeled direct-variable COGS is $12.22; the fully loaded margin is unavailable until shared provider costs and a paid-customer mix are declared and read back.
- Existing content remains readable, exportable, and deletable after a cost boundary closes. No plan permits silent overage.

These are target candidates for entitlement and billing cards, not live promises. Enrollment is CLOSED. The runtime currently enforces attempt counters, provider-rate ceilings, and claim/lease safety, not durable provider-dollar admission, storage-ledger attribution, or reconciliation. International/FX Stripe charges, provider-plan readbacks, shared DigitalOcean/Vercel allocation, and hard-cap receipts are unmet GA prerequisites; GA remains fail-closed.

## Fully loaded margin status

The direct-variable table deliberately excludes shared DigitalOcean hosting and Vercel platform charges (compute, analytics, and observability). No paid-customer mix is declared, so those shared costs cannot be allocated without inventing attribution. The 70% direct-variable calculations are not fully loaded gross-margin evidence and do not establish release readiness.

## Workload and sensitivity results

Low/base/high vary physical rendition overhead (1.05×/1.10×/1.20×), Blob origin-miss share (5%/15%/30%), potentially billed inference attempts (1.00×/1.05×/1.20×), database compute (0.75×/1.00×/1.50×), Stripe variable surcharge (0%/1.5%/2.5%). Storage includes retained trash.

| Workload | Revenue | Low COGS | Base COGS | High COGS | High gross margin |
|---|---:|---:|---:|---:|---:|
| Cardless Free — full allowance | $0.00 | $0.16 | $0.17 | $0.19 | n/a |
| Collector — 10 GB | $13.00 | $2.12 | $2.42 | $2.74 | 79.0% |
| Archive — 100 GB | $49.00 | $9.48 | $10.75 | $12.22 | 75.1% |
| Abusive novel-query and upload storm | $0.00 | $19.64 | $20.57 | $23.10 | n/a |
| Viral public share / crawler month | $0.00 | $156.81 | $163.34 | $173.40 | n/a |

The abusive and viral rows deliberately exceed their account/global budgets; they prove quotas must cover novel inference, bytes, and request delivery rather than storage alone.

## Modeled dollar ceilings translated to attempt caps

| Plan | Monthly infrastructure ceiling | Daily inference ceiling | Monthly inference ceiling |
|---|---:|---:|---:|
| free | $0.40 | $0.01 (39 attempts) | $0.18 (796 attempts) |
| collector | $3.00 | $0.07 (298 attempts) | $1.31 (5972 attempts) |
| archive | $13.00 | $0.22 (995 attempts) | $3.50 (15927 attempts) |

monthlyInfrastructureUsd is a target direct-variable ceiling in unrounded USD for each scenario's high-sensitivity full allowance; it is not a currently enforced provider-dollar cap. Plan inference ceilings include the high-sensitivity 20% retry/cancel reserve. The pre-GA modeled target is capped at $0.75/day and $25.00/month; runtime enforcement is by attempt counters and provider-rate safety, not dollar admission or reconciliation. Replicate's modeled target is $0.50/day (2272 attempts) and $15.00/month (68181 attempts); live billed dollars remain unknown. After a future cost-admission/storage-ledger implementation, the target monthly ceiling is `25 + 2.75 * collectorSubscriptions + 12.50 * archiveSubscriptions`; it is not a current runtime guarantee.

## Provider control targets and evidence status

- **Application admission:** target $25.00 per calendar month; action: deny new provider work before Blob, Replicate, or public delivery; enforcement: attempt_only; evidence: unverified (Modeled dollar reservation and reconciliation are a later implementation; enrollment is CLOSED.).
- **Replicate:** target $15.00 per calendar month; action: deny the target paid-attempt budget before provider work; enforcement: attempt_only; evidence: unverified (Runtime has attempt counters only; provider billed-dollar readback is unavailable.).
- **Vercel Blob/CDN:** target amount unknown per current billing cycle; action: operator spend action plus application byte/request admission; enforcement: unverified; evidence: unverified (Blob billing is account-wide and unattributed at store level.).
- **Neon:** target amount unknown per current billing cycle; action: provider plan controls plus application query/work admission; enforcement: unverified; evidence: unverified (Production plan, history, compute, and transfer readbacks are unavailable.).
- **DigitalOcean:** target amount unknown per current billing cycle; action: fixed component sizing, bounded jobs, and team billing alert; enforcement: unverified; evidence: unverified (Account-wide readback cannot allocate Sploot-only accrued charges.).
- **Clerk:** target amount unknown per monthly retained-user period; action: closed enrollment until plan and MRU authority are verified; enforcement: unverified; evidence: unverified (Dashboard plan and MRU readback are unavailable.).
- **Stripe:** target amount unknown per billing period; action: allowlisted price, idempotent webhook, and fail-closed entitlement; enforcement: unverified; evidence: unverified (Provider receipts and paid-admission ledger are not part of this card.).

## Live reconciliation (redacted)

- Vercel Blob: 6,568 objects / 536.7 MB versus 501.5 MB live plus 0.019 MB deleted source bytes in Postgres (501.5 MB total). The derived gap is 35,141,022 bytes (7.01% of live-plus-deleted source bytes). Blob object/byte counts refreshed 2026-07-25 via Vercel Blob list API. Postgres source-byte and asset counts are retained from the prior readback (production DATABASE_URL is not available through mint on this workstation). Vercel Blob billing remains account-wide and unattributed at store level.
- Neon/Postgres: 42.2 MB database, 10 users, 3,136 ready embeddings.
- Replicate: latest 100 predictions were 52 failed, 0 canceled, and 48 succeeded. This is operational usage, not a bill. Public-model failed predictions are documented as unbilled, while canceled/time-based work may bill; exact Replicate dollars are unavailable to the API authority.
- DigitalOcean: invoice preview $109.22 versus account month-to-date usage $113.62, a named $4.40 variance. The 2026-07-25 redacted account readback is $113.62 month-to-date versus a $109.22 invoice preview, a named $4.40 cadence/account-wide variance. Preview and balance endpoints update on different cadences and cover the entire account, which hosts multiple apps. DigitalOcean exposes no per-app accrued-transfer or invoice-preview allocation, so Sploot's exact July line item is not inferable from this authority.
  - Fixed baseline: the Sploot web service is $25.00/month. The current sleep-heavy embedding schedule is estimated at $3.33/month before other short jobs; Canary is a $5.00/month service shared across projects. These fixed costs are visible but excluded from the Vision's $25.00 variable free-subsidy ratchet and per-account margin.
- Vercel project (2026-07-01..2026-07-25): effective usage $1.6836573508, including build CPU $0.778009, analytics $0.459150, observability $0.222658, provisioned memory $0.067224, active CPU $0.064374, origin transfer $0.044212, invocations $0.039175, plus a $0.0088553508 aggregate remainder where each remaining category is below $0.01. Sploot web runtime is on DigitalOcean App Platform; residual Vercel project effective-usage dollars below are retained from the last attributed project readback (usage API unavailable this cycle). Blob object counts were refreshed separately via the Blob list API. The provider previously described usage as almost entirely absorbed by allowance. Vercel Blob remains account-wide and unattributed at store level.
- Modeled known-cost reconciliation: current web, embedding-job schedule, Blob bytes at the on-demand rate, and database bytes at the Launch storage rate produce a $28.36 monthly baseline. It deliberately excludes unknown history/WAL, operations, and transfer rather than treating them as zero. The $80.86 difference to the account-wide invoice preview is deliberately not attributed to Sploot: it contains unrelated apps, Canary allocation, other jobs, transfer/operations, and endpoint timing.
- Canary: 14,683 Sploot errors in 30 days. Canary timeline API is available via mint but rate-limited before a full 30d walk; errors30d retained from the prior authoritative SQLite readback (2026-07-17). Canary is a self-hosted shared DigitalOcean component; this is event usage, not a separate vendor bill.
- GitHub: public repository, 1 active caches / 0.41 GiB. 0.41 GiB is below the separate 10 GiB per-repository cache allowance; standard public-repository runners are free.

### Unresolved provider readbacks

- **Vercel Blob billed operations and transfer attribution for the current cycle:** unknown, not zero. Blob object bytes are exact, but Vercel Blob billing is account-wide and unattributed at store level; invoice reconciliation cannot distinguish Sploot reads, writes, edge requests, and origin misses.
- **Neon production plan, CU-hours, history bytes, and transfer:** unknown, not zero. Database bytes are exact; the model prices GA on Launch rates and varies CU-hours rather than assuming the Free allowance.
- **Replicate billed dollars:** unknown, not zero. Prediction status and runtime are readable, but the API does not expose invoice charges. Model-page typical cost and retry sensitivity are used.
- **Clerk dashboard plan and MRU:** unknown, not zero. Postgres has 10 users, which is not the same billing measure as MRU. Hobby is the explicit current assumption.
- **Sploot-only DigitalOcean invoice allocation:** unknown, not zero. The account-level invoice preview includes unrelated apps; the app spec still proves Sploot's $25 service and prorated jobs.
- **Postgres live asset/embedding counters this capture cycle:** unknown, not zero. Retained prior database.* and storage.databaseSourceBytes* figures; Blob growth is small (+11 objects) so the retained counters remain directionally consistent but are not a same-day SQL readback.
- **Canary full 30d error count this capture cycle:** unknown, not zero. Mint timeline walk hit 429 after 150 events; errors30d retained from prior SQLite authority.
- **Vercel project effective usage dollars this capture cycle:** unknown, not zero. Vercel usage API endpoints returned 404; retained last project-attributed category breakdown while refreshing Blob object counts independently.

## Rate registry

| Provider | Capabilities | Rate | Included allowance | Authority | Retrieved |
|---|---|---:|---|---|---|
| Vercel Blob | storage, retained-trash, renditions | $0.023 / GB-month | Hobby: first 1 GB-month | [official source](https://vercel.com/docs/vercel-blob/usage-and-pricing) | 2026-07-15 |
| Vercel Blob | blob-operations | $0.400 / million simple operations | Hobby: first 10,000 simple operations | [official source](https://vercel.com/docs/vercel-blob/usage-and-pricing) | 2026-07-15 |
| Vercel Blob | blob-operations, renditions | $5.00 / million advanced operations | Hobby: first 2,000 advanced operations | [official source](https://vercel.com/docs/vercel-blob/usage-and-pricing) | 2026-07-15 |
| Vercel Blob | blob-egress | $0.050 / GB transferred | Hobby: first 10 GB | [official source](https://vercel.com/docs/vercel-blob/usage-and-pricing) | 2026-07-15 |
| Vercel CDN | blob-egress | $2.00 / million edge requests | Hobby: first 1,000,000; Pro: first 10,000,000 | [official source](https://vercel.com/docs/manage-cdn-usage) | 2026-07-15 |
| Vercel CDN | blob-egress | $0.060 / GB origin transfer | Hobby: first 10 GB; Pro: N/A | [official source](https://vercel.com/docs/manage-cdn-usage) | 2026-07-15 |
| Replicate | image-inference, text-inference | $0.000220 / typical prediction | none | [official source](https://replicate.com/krthr/clip-embeddings) | 2026-07-15 |
| Neon | database-compute, vector-storage | $0.106 / CU-hour | Free: 100 CU-hours per project | [official source](https://neon.com/pricing) | 2026-07-15 |
| Neon | vector-storage | $0.350 / GB-month | Free: 0.5 GB per project | [official source](https://neon.com/pricing) | 2026-07-15 |
| Neon | vector-storage | $0.200 / GB-month of history/WAL | Plan-specific restore window | [official source](https://neon.com/pricing) | 2026-07-15 |
| Neon | database-compute | $0.100 / GB public transfer | Free: 5 GB then suspend; Launch/Scale docs: 100 GB then overage | [official source](https://neon.com/docs/introduction/network-transfer) | 2026-07-15 |
| DigitalOcean App Platform | app-compute, logs | $25.00 / month for apps-s-1vcpu-2gb | 200 GiB outbound transfer | [official source](https://www.digitalocean.com/pricing/app-platform) | 2026-07-15 |
| DigitalOcean App Platform | jobs, app-compute, logs | $5.00 / full month for apps-s-1vcpu-0.5gb, prorated per second with one-minute minimum | 50 GiB outbound transfer | [official source](https://docs.digitalocean.com/products/app-platform/details/pricing/) | 2026-07-15 |
| DigitalOcean App Platform | app-bandwidth | $0.020 / GiB beyond pooled allowance | Team-level allowance pooled across apps | [official source](https://docs.digitalocean.com/products/app-platform/details/pricing/) | 2026-07-15 |
| Clerk | auth | $0.000000 / MRU through 50,000 per app | 50,000 monthly retained users per app | [official source](https://clerk.com/pricing) | 2026-07-15 |
| Clerk | auth | $0.020 / MRU-month from 50,001 through 100,000 | First 50,000 MRU; Pro base is $25 monthly | [official source](https://clerk.com/pricing) | 2026-07-15 |
| Canary on DigitalOcean | telemetry-canary, logs | $5.00 / month for shared apps-s-1vcpu-0.5gb service | Compute, runtime logs, and platform storage within the component plan | [official source](https://www.digitalocean.com/pricing/app-platform) | 2026-07-15 |
| GitHub Actions | jobs, logs | $0.000000 / standard hosted-runner minute for public repositories | Public standard runners free; 10 GB cache per repository | [official source](https://docs.github.com/en/billing/concepts/product-billing/github-actions) | 2026-07-15 |
| GitHub Actions | jobs | $0.070 / GB-month above cache allowance | 10 GB cache per repository | [official source](https://docs.github.com/en/billing/concepts/product-billing/github-actions) | 2026-07-15 |
| Stripe | payment-fees | $0.029 + $0.30 fixed / successful domestic online card charge plus fixed fee | none | [official source](https://stripe.com/pricing) | 2026-07-15 |

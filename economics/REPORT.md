# Sploot economic safety envelope

Generated deterministically from the versioned inputs in this directory. Rates were refreshed on 2026-07-15. This is a release gate, not a forecast: paid-tier margins charge on-demand rates so shared included pools cannot make an unprofitable plan look safe.

## Recommendation

- **Cardless Free:** 0.5 GB user-visible source-plus-trash allowance (rendition overhead is reserved separately), 100 new indexes and 100 novel text embeddings per month, 1 GB delivery, and at most 80 project-wide full-allowance equivalents before waitlist/paid admission. High-case variable cost is $0.26 per full account and $21.03 for the pool, below the $25 subsidy ceiling.
- **Collector:** $12/month, 10 GB, 600 new indexes, 900 novel text embeddings, and 10 GB delivery. High-case COGS is $3.26 and gross margin is 72.8%. The computed 70%-margin price floor is $10.61.
- **Archive:** $49/month, 100 GB, 2,500 new indexes, 2,500 novel text embeddings, and 40 GB delivery. High-case COGS is $14.41 and gross margin is 70.6%. The computed 70%-margin price floor is $47.81.
- Existing content remains readable, exportable, and deletable after a cost boundary closes. No plan permits silent overage.

These are candidates for entitlement and billing cards, not live promises. International/FX Stripe charges, provider-plan readbacks, and hard-cap receipts must be locked before GA.

## Workload and sensitivity results

Low/base/high vary physical rendition overhead (1.05×/1.10×/1.20×), Blob origin-miss share (5%/15%/30%), potentially billed inference attempts (1.00×/1.05×/1.20×), database compute (0.75×/1.00×/1.50×), and Stripe's variable surcharge (domestic / international / international plus FX). Storage includes retained trash.

| Workload | Revenue | Low COGS | Base COGS | High COGS | High gross margin |
|---|---:|---:|---:|---:|---:|
| Cardless Free — full allowance | $0.00 | $0.22 | $0.24 | $0.26 | n/a |
| Collector — 10 GB | $12.00 | $2.57 | $2.88 | $3.26 | 72.8% |
| Archive — 100 GB | $49.00 | $11.30 | $12.66 | $14.41 | 70.6% |
| Abusive novel-query and upload storm | $0.00 | $36.79 | $38.69 | $44.09 | n/a |
| Viral public share / crawler month | $0.00 | $156.81 | $163.34 | $173.40 | n/a |

The abusive and viral rows deliberately exceed their account/global budgets; they prove quotas must cover novel inference, bytes, and request delivery rather than storage alone.

## Dollar-derived budgets

| Plan | Monthly infrastructure ceiling | Daily inference ceiling | Monthly inference ceiling |
|---|---:|---:|---:|
| free | $0.28 | $0.01 (10 attempts) | $0.11 (200 attempts) |
| collector | $2.75 | $0.04 (75 attempts) | $0.81 (1500 attempts) |
| archive | $12.50 | $0.14 (250 attempts) | $2.70 (5000 attempts) |

Pre-GA global variable spend is capped at $0.75/day and $25.00/month. Replicate is a sub-budget of $0.50/day (925 attempts) and $15.00/month. After paid admission, the monthly ceiling is `25 + 2.75 * collectorSubscriptions + 12.50 * archiveSubscriptions`; daily is `paidMonthlyBudget / 30`. Counters reserve worst-case dollars transactionally before work and reconcile provider usage afterward.

## Provider hard-cap map

- **Application admission:** Postgres transactional per-plan counters plus global dollar ledger; deny before Blob, Replicate, or public-delivery work.
- **Replicate:** Repository daily/monthly dollar-derived attempt counters and embeddings kill switch; no provider cap is relied upon.
- **Vercel Blob/CDN:** Vercel Spend Management action plus application byte/request egress leases; verify provider action before GA.
- **Neon:** Autosuspend, CU ceiling, transfer alert, and application query/work admission; exact plan controls need provider authority.
- **DigitalOcean:** One fixed web instance, fixed component sizes/counts, scheduled-job runtime budgets, and team billing alerts.
- **Clerk:** Hobby 50,000-MRU allowance and application enrollment cap; SMS and paid add-ons remain disabled without a ledger rate.
- **Stripe:** One subscription charge per period, plan-price allowlist, webhook idempotency, and fail-closed entitlements.

## Live reconciliation (redacted)

- Vercel Blob: 6,461 objects / 532.4 MB versus 499.3 MB of live source bytes in Postgres. Blob is 33,110,277 bytes above source bytes recorded in Postgres. The named 6.63% gap contains thumbnails plus any unreferenced objects; physical attribution remains the storage-ledger card's job.
- Neon/Postgres: 42.0 MB database, 10 users, 3,088 ready embeddings.
- Replicate: latest 100 predictions were 95 failed, 1 canceled, and 4 succeeded. This is operational usage, not a bill. Public-model failed predictions are documented as unbilled, while canceled/time-based work may bill; exact Replicate dollars are unavailable to the API authority.
- DigitalOcean: invoice preview $41.69 versus account month-to-date usage $43.76, a named $2.07 variance. Preview and balance endpoints update on different cadences and cover the entire account, which hosts multiple apps. DigitalOcean exposes no per-app accrued-transfer or invoice-preview allocation, so Sploot's exact July line item is not inferable from this authority.
- Fixed baseline: the Sploot web service is $25.00/month. The current sleep-heavy embedding schedule is estimated at $3.33/month before other short jobs; Canary is a $5.00/month service shared across projects. These fixed costs are visible but excluded from the Vision's $25 variable free-subsidy ratchet and per-account margin.
- Known-cost reconciliation: current web, embedding-job schedule, Blob bytes, and database bytes produce a $28.37 monthly floor. The $13.32 difference to the account-wide invoice preview is deliberately not attributed to Sploot: it contains unrelated apps, Canary allocation, other jobs, transfer/operations, and endpoint timing.
- Canary: 5,917 Sploot errors in 30 days. Canary is a self-hosted shared DigitalOcean component. This is event usage, not a separate vendor bill; the model allocates fixed component cost instead of inventing a per-event price.
- GitHub: public repository, 16 active caches / 6.37 GiB. 6.37 GiB is below the separate 10 GiB per-repository cache allowance; standard public-repository runners are free.

### Unresolved provider readbacks

- **Vercel billed operations and transfer for the current cycle:** unknown, not zero. Object bytes are exact, but invoice reconciliation cannot distinguish reads, writes, edge requests, and origin misses without Vercel usage authority.
- **Neon production plan, CU-hours, history bytes, and transfer:** unknown, not zero. Database bytes are exact; the model prices GA on Launch rates and varies CU-hours rather than assuming the Free allowance.
- **Replicate billed dollars:** unknown, not zero. Prediction status and runtime are readable, but the API does not expose invoice charges. Model-page typical cost and retry sensitivity are used.
- **Clerk dashboard plan and MRU:** unknown, not zero. Postgres has 10 users, which is not the same billing measure as MRU. Hobby is the explicit current assumption.
- **Sploot-only DigitalOcean invoice allocation:** unknown, not zero. The account-level invoice preview includes unrelated apps; the app spec still proves Sploot's $25 service and prorated jobs.

## Rate registry

| Provider | Capabilities | Rate | Included allowance | Authority | Retrieved |
|---|---|---:|---|---|---|
| Vercel Blob | storage, retained-trash, renditions | $0.023 / GB-month | Hobby: first 1 GB-month | [official source](https://vercel.com/docs/vercel-blob/usage-and-pricing) | 2026-07-15 |
| Vercel Blob | blob-operations | $0.400 / million simple operations | Hobby: first 10,000 simple operations | [official source](https://vercel.com/docs/vercel-blob/usage-and-pricing) | 2026-07-15 |
| Vercel Blob | blob-operations, renditions | $5.00 / million advanced operations | Hobby: first 2,000 advanced operations | [official source](https://vercel.com/docs/vercel-blob/usage-and-pricing) | 2026-07-15 |
| Vercel Blob | blob-egress | $0.050 / GB transferred | Hobby: first 10 GB | [official source](https://vercel.com/docs/vercel-blob/usage-and-pricing) | 2026-07-15 |
| Vercel CDN | blob-egress | $2.00 / million edge requests | Hobby: first 1,000,000; Pro: first 10,000,000 | [official source](https://vercel.com/docs/manage-cdn-usage) | 2026-07-15 |
| Vercel CDN | blob-egress | $0.060 / GB origin transfer | Hobby: first 10 GB | [official source](https://vercel.com/docs/manage-cdn-usage) | 2026-07-15 |
| Replicate | image-inference, text-inference | $0.000540 / typical prediction | none | [official source](https://replicate.com/krthr/clip-embeddings) | 2026-07-15 |
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

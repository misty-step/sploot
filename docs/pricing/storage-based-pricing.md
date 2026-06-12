# Storage-based pricing

Last updated: 2026-06-11

## Decision

Sploot charges for storage, not search count or basic organization.

| Plan | Price | Storage limit | Intended user |
|---|---:|---:|---|
| Free | $0/mo | 1 GB | Try Sploot and keep a useful private library. |
| Plus | $5/mo | 20 GB | Serious meme collection, still well below heavy storage cost risk. |
| Max | $12/mo | 100 GB | Heavy hoarders who keep large originals and animated media. |

Read, search, delete, and export behavior must keep working after a cap is hit.
The cap only blocks new writes until the user deletes assets or upgrades.

## Cost basis

Primary marginal cost is Vercel Blob. Official Blob pricing lists storage at
$0.023/GB-month, simple operations at $0.40 per 1M after the included tier,
advanced operations at $5.00 per 1M after the included tier, and blob transfer
at $0.050/GB after the included tier. The same page shows a 50 GB / 350 GB
transfer example costing $15.73/mo, where transfer dominates storage.

Neon database storage is a secondary cost. Neon Launch lists database storage
at $0.35/GB-month, with compute billed separately at $0.106/CU-hour. Sploot's
database stores metadata, tags, cache rows, and vectors; user originals stay in
Blob, so database bytes should be materially smaller than Blob bytes.

Replicate CLIP embedding cost is mostly one-time per upload. The current
`krthr/clip-embeddings` model page lists approximately $0.00022/run and 768d
embeddings. At that rate, embedding 10,000 uploaded assets costs about $2.20
before retries.

## Unit economics

| Scenario | Blob storage/mo | Embedding one-time | Notes |
|---|---:|---:|---|
| 1 GB Free | $0.023 | about $0.22 per 1,000 assets | Mostly covered by included Vercel/Neon usage. |
| 20 GB Plus | $0.46 | about $2.20 per 10,000 assets | $5/mo leaves room for transfer and operations. |
| 100 GB Max | $2.30 | about $11.00 per 50,000 assets | $12/mo leaves storage margin but transfer must be watched. |

Transfer can dominate when users repeatedly view or share large originals, so
pricing should be revisited once production Blob transfer exceeds storage cost
for two consecutive billing cycles.

## Implementation contract

- `User.plan` is the local authorization cache: `free`, `plus`, or `max`.
- `user_storage_quotas.limit_bytes` is synchronized to the current plan limit
  inside quota reads and Stripe webhook handling.
- Stripe Checkout creates subscriptions for paid plans; Stripe Billing Portal
  owns cancellation, payment-method updates, and plan changes.
- Stripe webhooks update local plan state. Stripe remains the billing source of
  truth; local state only gates product behavior.
- Missing Stripe env returns typed `503` responses; it must not make uploads,
  settings, or free users fail.

## Sources

- Vercel Blob pricing: https://vercel.com/docs/vercel-blob/usage-and-pricing
- Neon pricing: https://neon.com/pricing
- Replicate CLIP embeddings: https://replicate.com/krthr/clip-embeddings

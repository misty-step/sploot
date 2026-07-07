# Retrieval-quality eval

The verification system for sploot's product premise: *"I describe a meme in
plain words and it's the first result, instantly."* Every change to
embeddings, similarity thresholds, or query SQL runs through this loop —
baseline → change → paired delta → merge with evidence. (Origin: sploot-073.)

## One command

```sh
# needs a local pgvector Postgres (pnpm dev:local boots one) and DATABASE_URL
pnpm --filter web eval:search
```

Seeds the fixture library into pgvector under the `eval-golden-user`, runs
every golden query through `lib/db.ts vectorSearch` — the exact function
`/api/search` calls — and reports **top-1 / top-5 hit rate, MRR, and p50/p95
latency**, compared against `eval/baseline.json`. Exit code 1 on regression.
CI runs this in the `test` job on every PR (pgvector service, no external
tokens), so the gate is externally enforced, not self-attested.

## The fixtures (committed, deterministic)

- `fixtures/assets.json` — 100 real memes: the imgflip top-100 templates
  (public `https://api.imgflip.com/get_memes` API) embedded with the
  production CLIP model (`lib/embeddings.ts CLIP_MODEL`, 768-d). Only derived
  embeddings + metadata are committed; the images stay at their imgflip
  source URLs (provenance inline in the file).
- `fixtures/queries.json` — 88 golden queries: hand-written plain-words
  descriptions the way a person actually remembers a meme ("woman yelling at
  a confused cat sitting at a dinner table"), each mapped to the template
  id(s) that count as correct. Source of truth for the text + expectations:
  `golden-queries.source.json`.

Because both sides' embeddings are committed, the quality metrics are pure
deterministic math — **their noise floor is zero** and any drop at all fails.
Latency is machine-dependent, so it gates against the absolute
`latencyBudgetMs` in the baseline (3× observed p95 at baseline time, min
250ms) — that multiplier is the explicit noise floor for runner variance.
The measured path is the embedding-cache-hit search (pgvector query +
threshold + ranking); HTTP/Next overhead is covered by `smoke:deployed`.

## Derived thresholds (no uncited magic numbers)

`lib/search-config.ts` is the single source for every similarity number in
the search path. Values come from the score distributions this eval measures
(run of 2026-07-07: correct hits min 0.144 / p25 0.248 / p50 0.267 / max
0.444; irrelevant p50 0.184 / p95 0.220):

| Constant | Rule | Value |
|---|---|---|
| `SEARCH_SIMILARITY_FLOOR` | 90% of min correct-hit similarity, floored to 2dp | 0.12 |
| `SIMILARITY_NEAR_BOUNDARY` | p25 of correct-hit similarities | 0.25 |
| `SIMILARITY_MATCH_BOUNDARY` | p50 of correct-hit similarities | 0.27 |

History: the legacy floor of 0.2 sat *inside* the correct-hit distribution
(cut 3 known-good matches), and the legacy UI boundaries (0.85 / 0.7) were
unreachable — CLIP text→image cosine similarity tops out around 0.45.
Calibrating to the derived values moved the golden set top-1 90.9%→92.0%,
top-5 95.5%→97.7%, MRR 0.9318→0.9472 (paired, deterministic).

## Updating things

- **Changed search code and the eval fails?** That is the gate working.
  Fix the regression or justify the trade in the PR with the paired delta.
- **Genuinely improved quality?** Re-ratchet: `pnpm --filter web eval:search
  --update-baseline` and commit `baseline.json` with the evidence. Never
  lower a stored metric by hand.
- **Edited golden queries** (`golden-queries.source.json`): re-embed with
  `pnpm --filter web eval:fixtures --queries-only` (needs
  `REPLICATE_API_TOKEN`), then re-baseline — query changes redefine the
  measurement, and the PR must say so.
- **Changed the embedding model**: rebuild everything with
  `pnpm --filter web eval:fixtures`, re-derive `lib/search-config.ts` from
  the new distributions, re-baseline. The eval hard-fails on a model
  mismatch between fixtures and `CLIP_MODEL` so this cannot drift silently.
- **Cleanup**: `pnpm --filter web eval:search --teardown` removes the seeded
  eval user + assets.

# Make degraded search and stats honest

Priority: P1 · Status: done · Estimate: M

## Goal

Backend degradation (embeddings down, missing `users` row) surfaces as explicit
degraded states instead of fake empty search results or 500s.

## Oracle

- [ ] `/api/search` returns 503 with an `error` body when the embedding service
      cannot initialize — no more HTTP 200 with `results: []` plus an `error`
      field the client never reads. Existing `EmbeddingError` runtime paths
      keep their status codes.
- [ ] The library UI renders a "search unavailable" state visually and
      semantically distinct from the "no matches in the pile" empty state when
      the search API returns 5xx.
- [ ] `/api/stats` returns 200 for an authenticated principal whose `users`
      row is missing (row provisioned on demand, or quota degrades gracefully),
      with a regression test covering the FK path.

## Notes

Evidence (verified 2026-06-10):

- `apps/web/app/api/search/route.ts:89-105` — embedding-service init failure
  returns HTTP 200 + `results: []` + `error` string.
- `apps/web/hooks/use-assets.ts:489-504` — client only inspects `data.error`
  when `!response.ok`, so on the 200 path the degraded search renders as an
  honest-looking "no matches" empty state.
- `apps/web/lib/auth/server.ts:98-107` — `syncUser` failures intentionally do
  not block auth, so an authenticated request can reach
  `apps/web/lib/quota/storage-quota-policy.ts:61` whose
  `userStorageQuota.upsert` then throws `user_storage_quotas_user_id_fkey`
  and `/api/stats` 500s. Observed live during the 2026-06-10 design QA pass.

Fix at the API layer first (status codes are the contract); client banner
second. Do not weaken the auth-boundary grace — make downstream consumers
survive it.

## What Was Built

PR #208 (`7c2587a`). /api/search returns 503 on embedding-init failure;
search bar state ternary ranks error above no-results; quota snapshot
degrades to defaults on the users-row FK violation (P2003). Regression
tests for both paths.

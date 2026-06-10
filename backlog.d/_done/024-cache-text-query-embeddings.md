# Cache text-query embeddings

Priority: P2 · Status: done · Estimate: M

## Goal

Repeat searches skip the Replicate round-trip so search latency approaches the
documented <500ms objective instead of paying an embedding API call per query.

## Oracle

- [ ] Searching the same query twice: the second `/api/search` call does not
      hit Replicate (observable via logs/metrics) and responds in <500ms
      against local pgvector.
- [ ] Cache is keyed by (normalized query, embedding model), bounded
      (TTL and/or max entries), and covered by hit/miss tests.

## Notes

`apps/web/lib/embeddings.ts` `embedText` has no caching; every search pays a
Replicate call (~6s observed cold during the 2026-06-10 QA pass; warm calls
are still a network round-trip). `apps/web/CLAUDE.md` claims "edge caching for
embeddings" and "client-side caching of recent searches" — both aspirational.

Serverless instances are ephemeral, so an in-process LRU only helps warm
instances. A small Postgres table keyed by `hash(model, normalized_query)`
(or Vercel KV) gives cross-instance reuse and survives deploys. Normalize the
query (trim/lowercase/collapse whitespace) before hashing. Invalidate by model
name so an embedding-model upgrade naturally misses.

## What Was Built

PR #210 (`4358100`). text_embedding_cache table as persistent L2 inside
CacheService (fail-soft, 30-day TTL, opportunistic pruning), keyed by
(model, normalized query). clear/invalidate propagate to L2. Live p50
against Replicate unverified (no token locally); mechanism proven by tests.

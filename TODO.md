# TODO: neon cost clampdown

- [x] Add a lightweight `/api/stats` GET endpoint that returns `{ assetCount, storageBytes, lastUploadAt }` via a single Prisma aggregate and requires auth; Success criteria: one aggregate query only, payload <1KB, no tag/embedding joins.
- [x] Refactor `hooks/use-status-stats.ts` to consume `/api/stats` instead of `/api/assets?limit=1000`, and slow polling to ~30s idle / 5s when queue active; Success criteria: status bar still renders counts, no `/api/assets?limit=1000` calls during polling, network payload per poll stays sub‑1KB.
- [ ] Add a cron-protected `/api/cron/purge-search-logs` route that deletes `search_logs` older than 30 days using timing-safe auth; Success criteria: route reports deleted row count, uses `crypto.timingSafeEqual`, and completes in a single delete statement.
- [ ] Tighten `/api/assets` list response to a minimal field projection (path, blobUrl, mime, dims, size, favorite, createdAt) and gate tag expansion behind an explicit query flag; Success criteria: default list page response for 50 assets <10KB and tag data still available when requested.

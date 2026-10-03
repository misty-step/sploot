---
name: misty-sploot
description: Save or semantically search the personal Sploot meme library through its MCP server. Use for "save this meme", "save this to sploot", or "find the meme where…".
argument-hint: "[save <url-or-path> | search <description>]"
---

# Sploot MCP

Invoke the `misty-sploot` skill. The `sploot-mcp` server (`apps/mcp`) exposes the published
token-scoped contract in `apps/web/docs/PUBLIC_API.md`:

- `sploot_search({ query })` finds images by plain-language visual description,
  not tags or filenames. Pass `nextCursor` as `cursor` and repeat the same
  query, limit, threshold, favoriteOnly, and tagId to read the next page.
- `sploot_save({ url, tags })` lets Sploot fetch a public image URL server-side
  and store optional tag names. Use `bytesBase64` plus `filename` when only
  local or screenshot bytes exist. Tags apply to both kinds of save.

No other library operation is agent-callable. Keep full-library reads, tags,
deletes, and token management in the session; do not bypass MCP with raw HTTP.

## Results

- An empty `results` array is a real search miss. Report it; do not lower a
  threshold or reformulate the query unless the user asks.
- A duplicate receipt with `isDuplicate: true` means the exact image already
  exists and the save succeeded. Any other conflict, busy response, or
  unreadable body is `isError: true`.
- A `blobUrl` that starts with `/media/` is a private reference. A personal
  access token cannot download it.
- `401` means the token is missing, revoked, or for the wrong environment.
  `503` means the embedding service is unavailable, not that the query is bad.
- Tool failures return `isError: true` with a plain-text explanation. Treat it
  as user-facing and do not paste internal stack traces.

## Setup

Mint a token in Sploot Settings → Upload tokens (or the signed-in
`POST /api/upload-tokens` flow). The plaintext appears once: store it only in
the environment or secret manager that registers MCP, never in chat or a repo
file. Register `SPLOOT_API_TOKEN`; set `SPLOOT_API_BASE_URL` only for a
non-production target. Build once from the repo root with:

```sh
pnpm --filter @sploot/mcp build
```

`apps/web/docs/PUBLIC_API.md` and `apps/mcp/README.md` own the contract and
server configuration. They override this usage guide if they disagree.

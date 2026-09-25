# Find

Stories: US-002
Source: apps/server/internal/embedding/**, apps/server/internal/inference/**, apps/server/internal/library/**, apps/server/internal/httpapi/**, apps/mcp/src/**, apps/server/scripts/local-gauntlet.ts, qa/walk*, .exe/setup.sh

## Sub-features

Pinned local CPU CLIP encodes new originals and text queries; SQLite vector retrieval ranks results within the account. Browser search and token-scoped MCP search use the same owned server boundary.

## How to get to it (user POV)

After uploading a supported image and waiting for indexing, type a plain description in the `/app` search field. Open `/app/search` to inspect the returned cards. Another account's image must never appear.

## Driving it

`qa/walk --stories "US-002"` runs the isolated Go browser acceptance against real local CLIP, checks a generated shape ranks above unrelated shapes and a visible result card appears, then checks an account with no owned assets gets no results and cannot fetch the other account's private media.

## Gotchas

A green readiness endpoint or precomputed vector does not demonstrate a new text projection. Search can be unavailable while model preparation fails without losing saved originals. The legacy Next.js provider search is not the current Go product.

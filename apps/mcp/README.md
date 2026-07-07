# @sploot/mcp

MCP server exposing Sploot's two agent-facing verbs — **save** and
**search** — as tools, over the published, token-scoped external contract in
[`apps/web/docs/PUBLIC_API.md`](../web/docs/PUBLIC_API.md). It is a thin HTTP
client: no business logic (dedupe, quota, embeddings, similarity ranking)
lives here, all of it lives server-side in `apps/web`.

The companion agent skill (`.agents/skills/misty-sploot/SKILL.md`) teaches
the verbs; this package is the runtime that implements them.

## Tools

| Tool | Purpose |
|---|---|
| `sploot_search` | Semantic text→image search. `{ query, limit?, threshold? }` |
| `sploot_save` | Save an image by `url` or `bytesBase64` (+ optional `filename`, `mimeType`, `tags`) |

Both return the underlying API's JSON response as text content on success,
and `{ isError: true, content: [...] }` with a human-readable message on
failure (bad/missing token, quota exceeded, embedding service unavailable,
etc.) — see `PUBLIC_API.md` for the exact response shapes and error codes.

## Setup

1. **Mint a personal API token** — sploot.app → Settings → Upload tokens (or
   `POST /api/upload-tokens` with a signed-in session). Shown once; store it
   in your secret manager, not in a config file.
2. **Build the server:**

   ```bash
   pnpm --filter @sploot/mcp build   # emits dist/index.js
   ```

3. **Register it** with your MCP-capable harness (Claude Code, Claude
   Desktop, etc.):

   ```json
   {
     "mcpServers": {
       "sploot": {
         "command": "node",
         "args": ["/absolute/path/to/sploot/apps/mcp/dist/index.js"],
         "env": {
           "SPLOOT_API_TOKEN": "splt_…"
         }
       }
     }
   }
   ```

## Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `SPLOOT_API_TOKEN` | yes | — | Personal API token (`splt_…`) |
| `SPLOOT_API_BASE_URL` | no | `https://www.sploot.app/api` | Point at a local dev instance (e.g. `http://localhost:3001/api`) instead of production |

The server refuses to start without `SPLOOT_API_TOKEN` and prints the mint
instructions to stderr.

## Development

```bash
pnpm --filter @sploot/mcp dev          # run from source with tsx
pnpm --filter @sploot/mcp type-check
pnpm --filter @sploot/mcp test         # vitest, mocks fetch — no live instance needed
pnpm --filter @sploot/mcp build        # tsc -> dist/
```

`src/client.ts` is the HTTP layer (unit-tested against a mocked `fetch`);
`src/tools.ts` is the tool-handler logic (unit-tested against a fake
client); `src/index.ts` wires both into an `McpServer` over stdio. Keep that
separation — it's what makes the tool logic testable without a real MCP
transport or a live Sploot instance.

## Manual smoke test against a local instance

```bash
# 1. Boot a local Sploot with qa-local auth + seeded data (repo root):
pnpm dev:local

# 2. Mint a token for the seeded qa-design-user (see apps/web/docs/AUTH.md
#    for qa-local auth), then:
SPLOOT_API_TOKEN=splt_… SPLOOT_API_BASE_URL=http://localhost:3001/api \
  node apps/mcp/dist/index.js
# 3. Point an MCP client (or the Inspector) at that process over stdio.
```

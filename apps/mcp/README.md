# @sploot/mcp

MCP server exposing Sploot's two agent-facing verbs — **save** and
**search** — as tools, over the published, token-scoped external contract in
[`apps/web/docs/PUBLIC_API.md`](../web/docs/PUBLIC_API.md). It is a thin HTTP
client: no business logic (dedupe, quota, embeddings, similarity ranking)
lives here; the native Go server in `apps/server` owns it.

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

1. **Mint a personal API token** — sign in through the browser at
   [sploot.mistystep.io](https://sploot.mistystep.io/sign-in) with your native
   account, then open **Settings → Personal access tokens**. Token management
   (`POST /api/upload-tokens`) requires that instance's signed-in browser
   session; a personal or paired-device token cannot mint another token.
   The plaintext is shown once; store it in your secret manager, not a
   checked-in config file.
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
| `SPLOOT_API_BASE_URL` | no | `https://sploot.mistystep.io/api` | Override for another instance (e.g. `http://127.0.0.1:3001/api`); use a token minted on that instance |

The server refuses to start without `SPLOOT_API_TOKEN` and prints the mint
instructions to stderr.

Leave `SPLOOT_API_BASE_URL` unset for native production. The legacy
`sploot.app` API is not a fallback: after legacy routing is enabled, API
requests return `410 Gone` instead of redirecting credentials. Other local
or self-hosted libraries require an explicit base URL and their own token.

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

1. From the repository root, run `pnpm dev` to start the persistent native Go
   library at `http://127.0.0.1:3001`. See
   [startup and recovery](../web/docs/DEPLOYMENT.md#self-contained-go-runtime)
   for prerequisites. There is no QA login or seeded account.
2. Sign in in that instance's browser UI (or register if registration is open),
   then mint a token in **Settings → Personal access tokens**. Load it into
   `SPLOOT_API_TOKEN` privately; a production token does not authenticate locally.
3. Build and configure an MCP client (or Inspector) to launch the server over
   stdio with that token and the explicit local override:

   ```bash
   pnpm --filter @sploot/mcp build
   SPLOOT_API_BASE_URL=http://127.0.0.1:3001/api node apps/mcp/dist/index.js
   ```

4. Call `sploot_save` with a disposable image, then `sploot_search` after native
   indexing is ready. A real empty search is valid; seeded retrieval is not a
   smoke-test substitute. Stop the process normally without deleting the library.

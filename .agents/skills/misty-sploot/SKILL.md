---
name: misty-sploot
description: |
  Save and search a personal Sploot meme library from any agent session via
  the sploot MCP server. Sploot is a text→image semantic search library:
  save a meme once (bytes or URL), later find it by describing what's in it
  — no tags, no folders, no remembering filenames. Use when: "save this to
  sploot", "save this meme", "find the meme where...", "search sploot for...".
  Trigger: /sploot.
argument-hint: "[save <url-or-path> | search <description>]"
---

# misty-sploot

Sploot's agent-facing surface is two verbs, exposed as MCP tools by the
`sploot-mcp` server (`apps/mcp` in the sploot repo) over the published,
token-scoped contract in `apps/web/docs/PUBLIC_API.md`:

- **`sploot_search`** — semantic text→image search. Describe what's in the
  image in plain words; this is not a tag or filename lookup.
- **`sploot_save`** — save an image by URL (Sploot fetches it server-side) or
  by base64-encoded bytes (when there's no fetchable URL, e.g. a local file
  or a screenshot you just took).

No other Sploot verb is agent-callable today — reads of the full library,
tag management, deletes, and token management stay session-only. Don't
route around the MCP server with raw HTTP calls to routes it doesn't cover;
if a task needs a verb the server doesn't expose, that's a gap to card, not
to route around.

## Using the tools

**Search first** when the goal is "find a meme" — send the plain-words
description as-is, don't pre-tokenize or add filters the user didn't ask for:

```
sploot_search({ query: "distracted boyfriend reaction" })
```

Real misses come back as an empty `results` array (never low-similarity
padding) — report a miss as a miss, don't retry with `threshold: 0` to force
matches.

**Save** when the goal is "keep this image" — prefer `url` when the image
already has a public URL (a page you're browsing, a link the human shared);
use `bytesBase64` only when you're holding raw bytes with no URL (e.g. a
screenshot or a locally generated image):

```
sploot_save({ url: "https://example.com/meme.png" })
sploot_save({ bytesBase64: "<base64>", filename: "meme.png", tags: ["reaction"] })
```

A `409`/`isDuplicate: true` response means Sploot already has this exact
image — that's success, not a retry signal.

## Setup (once per environment)

The MCP server needs a personal API token:

1. Mint one at **sploot.app → Settings → Upload tokens** (or
   `POST /api/upload-tokens` with a signed-in session). The plaintext is
   shown once — store it in the environment/secret manager registering this
   MCP server, not in a chat transcript or repo file.
2. Register the server with `SPLOOT_API_TOKEN` set (and `SPLOOT_API_BASE_URL`
   only if not targeting production `https://www.sploot.app/api`):

```json
{
  "mcpServers": {
    "sploot": {
      "command": "node",
      "args": ["/path/to/sploot/apps/mcp/dist/index.js"],
      "env": { "SPLOOT_API_TOKEN": "splt_…" }
    }
  }
}
```

Build the server once with `pnpm --filter @sploot/mcp build` (repo root)
before pointing a harness at `dist/index.js`.

## Failure modes

- **`401`** — token missing, revoked, or wrong environment (a token minted
  against localhost won't authenticate against production and vice versa).
  Re-mint or re-check `SPLOOT_API_BASE_URL`.
- **`503` on search** — the embedding service is unavailable (Replicate not
  configured, or paused). Not a query problem — don't retry with a
  reformulated query.
- Both tools return `isError: true` with a plain-text explanation on any
  API-level failure; treat that text as user-facing, not a stack trace to
  paste back verbatim.

## Ground truth

`apps/web/docs/PUBLIC_API.md` (the published contract) and `apps/mcp/README.md`
(server implementation/config) are authoritative over this skill if they
disagree — this skill teaches usage, it doesn't own the contract.

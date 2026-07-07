# Five Faces — Sploot

Status ledger for the Misty Step application-floor "five faces" doctrine
(one core, every face: **API + CLI + MCP server + shipped skill + UI**, SDK
where external consumers exist; a face counts only if it covers the core
verbs — **save** and **search** — not partial credit). Updated with each
face-completing change; treat a stale entry here as a bug.

| Face | Status | Evidence |
|---|---|---|
| **UI** | ✅ Shipped | `apps/web` (Next.js app: `/app` grid, search, upload) + `apps/extension` (Chrome right-click save) + PWA share target. Pre-existing, strongest face. |
| **API** | ✅ Shipped, published 2026-07-07 | `apps/web/docs/API.md` (full session-authenticated surface) + **`apps/web/docs/PUBLIC_API.md`** (the published, token-scoped external contract: save bytes, save by URL, search — sploot-071). Previously existed only as an internal dev doc with no token-scoped external surface named. |
| **MCP** | ✅ Shipped 2026-07-07 | `apps/mcp` (`@sploot/mcp`, bin `sploot-mcp`): `sploot_search` + `sploot_save` tools over `PUBLIC_API.md`. Covers both core verbs — capture (save) and retrieval (search) — not a read-only partial. Live-instance evidence: sploot-071 completion proof. |
| **Skill** | ✅ Shipped 2026-07-07 | `.agents/skills/misty-sploot/SKILL.md` — teaches the two verbs, setup, and failure modes; rides with the MCP server. |
| **CLI** | **Waived** (see below) | No standalone `sploot` CLI binary. |

## CLI waiver

**Waived, not shipped**, as of 2026-07-07 (sploot-071). Rationale:

- The floor's CLI intent is a scriptable, agent/operator-reachable
  programmatic surface over the core verbs. For Sploot specifically, the
  **MCP server already is that surface** for the audience that actually
  exists today (the operator's agent fleet) — it is stdio-invokable,
  scriptable, and requires no interactive terminal UX a human CLI would
  additionally need to earn (arg parsing, `--help`, output formatting,
  config file discovery).
- The **documented `curl` recipes in `PUBLIC_API.md`** cover the
  script-from-a-terminal case a human would reach a CLI for (mint a token,
  `curl -F file=@meme.png`, `curl -d '{"query":"…"}'`) — a bespoke CLI binary
  would be a thin wrapper around the same three HTTP calls the MCP server
  already wraps, with no distinct consumer.
- No named consumer wants a `sploot` binary specifically (vs. the MCP tool
  or a curl one-liner) today. If one shows up — e.g. a shell-scripting
  workflow that wants `sploot search "…"` / `sploot save file.png` without an
  MCP-capable harness in the loop — that is grounds to revisit this waiver
  with a real ticket, not a silent gap.

**Revisit trigger:** a concrete user/workflow that needs Sploot from a shell
without an MCP-capable agent harness present.

## Changelog

- **2026-07-07 (sploot-071):** API published as a real external contract;
  MCP + skill shipped; CLI waiver recorded. Closes the "no implicit gaps"
  requirement — every face above has an explicit status, not silence.

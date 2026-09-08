# Five Faces — Sploot

Status ledger for the Misty Step application-floor "five faces" doctrine
(one core, every face: **API + CLI + MCP server + shipped skill + UI**, SDK
where external consumers exist; a face counts only if it covers the core
verbs — **save** and **search**, not partial credit). Historical shipping
evidence and replacement acceptance are distinct; source code, local proof, a
hosted deployment, and a device/store release are not interchangeable.

| Face | Status | Evidence |
|---|---|---|
| **UI** | Deployed predecessor; replacement candidate | `apps/web` retains the deployed Next.js library. `apps/server` is the Go HTML/HTMX personal replacement, runnable locally but not cut over. `apps/extension` is a TypeScript/WXT Chrome capture candidate with no current Web Store submission/publication claim. The [iPhone Shortcut](../apps/web/docs/shortcuts/save-to-sploot.md) is unsigned source, not an installable release. |
| **API** | Published save/search contract; candidate implementation | [`PUBLIC_API.md`](../apps/web/docs/PUBLIC_API.md) owns token-scoped save bytes, save by URL, and search (published 2026-07-07, sploot-071). [`API.md`](../apps/web/docs/API.md) distinguishes current candidate routes from the deployed session-authenticated predecessor surface; not every legacy route is retained. |
| **MCP** | Shipped record, 2026-07-07 | `apps/mcp` (`@sploot/mcp`, bin `sploot-mcp`) exposes `sploot_search` and `sploot_save` over the published API. The sploot-071 completion record is historical live-instance evidence, not a new Go/production acceptance receipt. |
| **Skill** | Shipped record, 2026-07-07 | `.agents/skills/misty-sploot/SKILL.md` teaches save/search, setup, and failure modes with the MCP server. The runtime replacement does not imply a new skill release. |
| **CLI** | **Waived** (see below) | No standalone consumer `sploot` CLI. The new operator `library-backup` recovery utility is not a substitute save/search face. |

## Replacement acceptance boundary

The candidate retains existing Postgres/pgvector, Clerk identities, Blob media,
Replicate CLIP revision, quotas/attempt ceilings, Sentry, and public share slugs.
Personal tokens permit **save and search**, not library listing, export,
deletion, or token management. The candidate owner ZIP download intentionally
replaces the predecessor UI's multipart export workflow.

`pnpm dev:local` and `pnpm --filter server smoke` own the disposable
provider-free Go loop. Cached fixture retrieval is not live indexing proof.
Current production authority/current-library access is unavailable, so no
current real-library backup or Go production cutover is claimed. Isolated
fixture restoration cannot establish those facts. Keep `apps/web`, named
Prisma migrations, and the rollback artifact until real acceptance.

The [deployment/recovery procedure](../apps/web/docs/DEPLOYMENT.md) owns the
operating commands rather than duplicating them here. The
[Shortcut source and release script](../apps/web/docs/shortcuts/save-to-sploot.md)
still require Apple signing and real iPhone saved/duplicate/failure verification.
There is no verified iCloud install link or completed packaged-device claim.

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

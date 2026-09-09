# Five Faces — Sploot

Status ledger for the Misty Step application-floor "five faces" doctrine
(one core, every face: **API + CLI + MCP server + shipped skill + UI**, SDK
where external consumers exist; a face counts only if it covers the core
verbs — **save** and **search**, not partial credit). Historical shipping
evidence and replacement acceptance are distinct; source code, local proof, a
hosted deployment, and a device/store release are not interchangeable.

| Face | Status | Evidence |
|---|---|---|
| **UI** | Persistent local product; deployed predecessor separate | `apps/server` is the runnable Go HTML/HTMX library with local accounts and real CPU inference. Desktop/mobile-browser and real-backend Chromium extension paths have local proof; `apps/web` remains the unchanged production app. The device-paired WXT extension is not a Web Store publication. The [iPhone Shortcut](../apps/web/docs/shortcuts/save-to-sploot.md) is unsigned source, not an accepted installable release. |
| **API** | Published save/search contract; local and deployed implementations | [`PUBLIC_API.md`](../apps/web/docs/PUBLIC_API.md) owns token-scoped save bytes, save by URL, and search (published 2026-07-07, sploot-071). [`API.md`](../apps/web/docs/API.md) separates Go account/device/private-media authority from the predecessor's Clerk-backed API; not every legacy route is retained. |
| **MCP** | Shipped client; instance-scoped save/search | `apps/mcp` (`@sploot/mcp`, bin `sploot-mcp`) exposes `sploot_search` and `sploot_save` over the published API. Select the intended origin and that instance's personal token. The sploot-071 completion record is historical shipping evidence, not a new production migration receipt. |
| **Skill** | Shipped record, 2026-07-07 | `.agents/skills/misty-sploot/SKILL.md` teaches save/search, setup, and failure modes with the MCP server. A local runtime change does not imply a new skill release. |
| **CLI** | **Waived** (see below) | `sploot serve/doctor/backup/resume/verify/restore` and `library-backup` are operator commands, not a standalone consumer save/search face. |

## Local product and release boundaries

The local product owns persistent SQLite/sqlite-vec state, password accounts,
private filesystem originals/posters, and a separately cached SHA-pinned
quantized CLIP/ONNX CPU bundle. `pnpm dev` / `dev:local` opens a real library,
not a disposable seeded QA environment; ordinary shutdown never deletes it.
New uploads and genuinely new queries use local inference.

Browser sessions, paired `spld_` device credentials, and personal `splt_` tokens
have different authority. Personal tokens permit **save and search**, not
listing, private media download, export, deletion, or account/token management.
Private media references in receipts/results are not public download grants.
The Go owner ZIP route differs from the predecessor's multipart export lifecycle.

The [runtime/deployment/recovery procedure](../apps/web/docs/DEPLOYMENT.md) owns
operating commands. Its SQLite backup/restore format preserves local accounts
and media but removes portable session/device/PAT credentials. It is not an
importer or backup of the unchanged production Postgres/Blob library.
Existing Next.js source, migrations, gates, deployment, and old real library
are unchanged; local acceptance is not a production cutover.

Mobile-viewport browsing, upload, playback, and download are browser proof,
not physical iPhone or native share-sheet acceptance. The
[Shortcut procedure](../apps/web/docs/shortcuts/save-to-sploot.md) still requires
Apple signing and real-device saved/duplicate/failure verification; no verified
iCloud install link is claimed. Real-backend Chromium device pairing/capture
is likewise separate from fixture-only tests and Chrome Web Store publication.

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

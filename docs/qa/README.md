# QA Evidence

QA packets are per-run output: `packet.md` (scope, checks, verdict, residual
risk), authenticated screenshots, and full command transcripts. They are not
fixtures and are **not committed by default**.


The historical `docs/qa/evidence/` collection remains in place. A selected
screenshot consumed by README or a shipped demo is a public product asset,
not permission to commit every future run bundle.

## Local Go acceptance

The persistent local application is not a disposable fixture. `pnpm dev` keeps
accounts and media in `.sploot-local/library`; shutdown never deletes them.
Use `pnpm --filter server smoke --keep --binary build/sploot` after building
the server to exercise a fresh private temporary library with real accounts,
media and pinned local inference. The command prints per-story results and
the retained desktop/mobile screenshot directory. Without `--keep`, a successful
run removes only its own newly allocated directory; failed runs retain diagnostics.
See [the acceptance gates](../DEPLOYMENT.md#acceptance-gates) for prerequisites and
real unpacked-extension acceptance.

Retained Go runs contain test databases, account hashes and media as well as
screenshots. Share selected sanitized evidence, not the entire private directory.
They do not establish production or physical-device acceptance.

## Foundation story walk

[SPEC.md](../../SPEC.md) is the only behavior authority. `qa/walk.mjs` reads it
directly. `USER_STORIES.md` is only a relative symlink to that same file for the
unchanged, SHA-pinned foundation checker (including its shell story validator).
It contains no separate stories or synchronized copy. All feature maps include
`SPEC.md` as a source: a spec-only change selects every story, so the legacy
checker's path-specific diff logic cannot miss canonical changes. Do not replace
the symlink with a regular file or remove the canonical source from the maps.
No foundation catalog, baseline, review identity or workflow pin is changed.

On an Ubuntu 24.04 GitHub runner or the existing owned workspace (not the
workstation), `.exe/setup.sh` installs the credential-free Go/Node/pnpm toolchain,
real Chromium and pinned inference and builds the Go app plus unpacked
extension. `qa/walk --stories "US-001 US-002"` walks the named affected stories;
`qa/walk --all` is the nightly full walk. Each numbered criterion is tied to
observed steps of the existing isolated `server smoke` gauntlet, including the
real MV3 Chromium journey for US-001. An empty PR selection emits no story
passes. From outside the checkout run `foundation-check receipt target/walk/walk-receipt.json --base SHA --repo /path/to/sploot`
for a PR (replace `--base SHA` with `--all` nightly); CI keeps receipt,
candidate HEAD/tree and artifact hashes together in one job. The files under
ignored `target/walk/` are CI artifacts, not production proof. The sanitized
nightly receipt and eight criterion markers for MIS-150 are retained under
`docs/qa/evidence/2026-09-25-mis-150-foundation-walk/` beyond Actions artifact
expiry; their head/tree identify the historical master candidate, not a later
checkout. The gauntlet removes only its own disposable library on success.

### Supporting behavior and evidence

The eight criterion receipts are not a claim that each supporting behavior has
its own numbered receipt. The same real gauntlet also exercises the additional
documented library behavior; unit/integration and client checks cover the rest.
Keep the actual scope and any unexercised surfaces explicit in the run packet.

| Specification section | Existing exercise |
| --- | --- |
| US-001 library capture | `apps/server/scripts/local-gauntlet.ts`: original hashes for all six MIME families, duplicate/replay, invalid/oversize/private-network refusal, mobile upload; Go ingest integration tests cover admission and share-target bounds |
| US-001 browser extension | Real `server smoke --extension`: native Chromium context-menu capture, screenshot, pairing across worker restart, duplicate, search, revoke and owner isolation; extension unit/fixture suites cover bounded retained work and failures |
| US-001 MCP | `pnpm --filter @sploot/mcp test` covers tool/client errors and responses with controlled fetches; it is not proof of a published package or a real MCP transport journey |
| US-002 retrieval and browsing | Real `server smoke`: CPU CLIP ranking, owner-empty search, shuffle/cursor traversal, favorite/tag reload and filtered search, byte-exact desktop/mobile downloads, playback and restart; Go embedding/library tests cover unavailable search and tag operations |
| US-003 accounts and authority | Real `server smoke`: registration/login failures and origin rejection, browser-approved devices, personal-token scope/revocation, password change/logout; Go auth/HTTP integration tests cover invitation claims and credential invalidation |
| US-003 sharing, removal and recovery | Real `server smoke`: explicit public share/revoke, trash/restore, owner ZIP/hash checks, backup/verify/restore and populated-target refusal; Go library/recovery integration tests cover permanent purge and portable-credential removal |

## Reading a packet

- **Verdict: PASS** with no warnings — checks green, no page/console errors.
- **Verdict: PASS** with a console-error warning — read the browser evidence
  before trusting it; pre-existing noise should be named in residual risk.
- **Verdict: FAIL** — the packet names the failing check (last transcript
  lines inline) or the page errors.

## Ownership and safe handling

- **Repository inputs and product assets:** the QA harness, curated fixtures,
  portable procedures, and selected sanitized public/demo/PWA screenshots with
  their required publishing manifests. Historical predecessor packets retain
  their original scope; they do not claim current Go verification.
- **Linear:** the current work's intent, a concise result and residual risk,
  source revision, exercised environment/surface, and a link to retained
  evidence. A packet's PASS is not proof of deployment or unexercised devices.
- **Approved retained artifact storage:** full packets, screenshots, traces,
  and transcripts, with access and retention appropriate to their contents.
  Existing CI artifact consumers keep their own output paths; the Go story walk
  owns `target/walk/`, not a committed packet directory.

Isolated accounts are a useful safety boundary, not a sanitization guarantee.
Existing authenticated libraries may expose private data. Inspect/redact output
before sharing; never publish credentials, private memes, request headers, or
unrestricted raw transcripts to a public PR or Linear item. Use a sanitized
conclusion and permission-appropriate link instead.

Do not relocate or delete historical packets as part of a new run. Preserve
README/demo consumers and their provenance; promoting a new selected asset
requires deliberate content/privacy review, not wholesale packet commitment.
Current credential scopes are documented in [API.md](../API.md#authentication).

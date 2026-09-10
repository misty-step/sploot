# Isolated local Go acceptance

Use this for `apps/server` runtime changes or establishing a fresh verification
capability. The existing `smoke` command exercises the real product, not a mock
backend. For a small UI change, exercise its journey in an isolated library;
do not claim every journey was tested. The [deployment manual](../../../apps/web/docs/DEPLOYMENT.md#acceptance-gates)
owns prerequisites and shipping gates; `apps/server/scripts/local-gauntlet.ts`
owns executable stories. Do not replace these with another wrapper.

## Discover and identify the target

Read `AGENTS.md`, then invoke `/skill:sploot-qa` in OMP. Resolve this checkout's
`.agents/skills/sploot-qa/SKILL.md`, not a global copy. `.claude` and
`.codex/skills` expose the same repository skills. Explicit-resource runners
must include the exact skill through their approved resource mechanism; do not
broaden ambient/global authority.

For no-model OMP discovery, start
`omp --cwd "$PWD" --no-session --tools read --no-extensions --no-lsp` without an
initial prompt, type `/skill:sploot` without submitting, and inspect completion
for `skill:sploot-qa` and its repository description. Clear the input and exit
without inference. Standalone `omp read skill://sploot-qa` has no session skill
registry and is not a discovery check. Other clients should use their supported
loaded-skill UI or loader, not merely list files.

Record source and artifact identity before execution:

```sh
git rev-parse HEAD
git status --short
pnpm --version
go version
```

Record dirty candidate scope alongside HEAD; a different worktree's binary is
not evidence for this candidate. Record the built binary's checksum below.

## Setup and real-target exercise

Use Node 22+, pinned pnpm 10.22.0, Go as required by `apps/server/go.mod`, CGO/C
compiler, SQLite headers, FFmpeg/ffprobe and supported glibc Linux or macOS.
No hosted library, provider credentials, public origin or Docker service is
needed. Install missing host packages only through approved operator setup.
From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter server build
pnpm --filter server models:prepare
pnpm --filter server exec playwright install chromium
sha256sum apps/server/build/sploot
pnpm --filter server smoke --keep --binary build/sploot
```

Preparation downloads/verifies pinned public artifacts on first use. Reuse the
OS model cache, or set `SPLOOT_MODEL_DIR` to a new absolute run-owned directory
and pass that same path to `models:prepare -directory "$SPLOOT_MODEL_DIR"`.
Never disable inference or inject vectors to obtain a pass. Bound installation
and preparation to 30 minutes and smoke to 20 minutes; on timeout send SIGTERM,
allow the harness's 30-second child shutdown, then escalate if needed. A timeout
is UNVERIFIED/FAIL, not success.

The gauntlet creates `sploot-acceptance-*` under the OS temporary directory,
chooses loopback ports, creates separate real Alice/Bob accounts and browser
contexts, generates PNG/GIF/video with FFmpeg and starts the supplied binary.
Readiness requires actual SQLite and local inference, not shallow liveness.
Uploads, sharing/revocation, password changes and restore use these disposable
libraries only. Never target an operator's existing library. The harness owns
Chromium/server children; it does not leave a reusable live preview.

## Read the proof, not only the exit code

Inspect printed per-story assertions, final JSON, retained
`desktop-library.png`, `mobile-library.png` and `server-*.log`. Final JSON is
printed before teardown, so `status: PASS` without successful process exit is
not a clean run. Keep screenshots and private SQLite/media/account hashes out
of Git and shared transcripts. Retain evidence in approved durable storage
before removing a disposable worktree or temporary host storage.

The existing stories defend these observable outcomes:

- Real browser registration/save produce five assets with matching downloaded
  original checksums; every asset reaches embedding `ready`.
- Fresh text queries rank the matching generated shape and rendered search has
  a visible media card. Bob cannot retrieve Alice's assets; public media access
  is unauthorized. This is local CLIP proof, not hosted search.
- Favorites/tags survive reload; accounts, sessions, originals and search
  survive process restart. Backup/restore preserves bytes and invalidates old
  sessions.
- Duplicate replay stays owner-scoped. Bad passwords return 401, cross-origin
  login returns 403, malformed/oversized media is rejected, and private-network
  URL upload fails without increasing the asset count. These are plausible
  failure exercises, not merely screenshots.
- Mobile viewport playback/download and desktop grid screenshots cover those
  surfaces, not a physical iPhone or Chrome Web Store release.

For extension changes use `apps/extension/README.md`: build with
`pnpm --filter extension build:e2e`, then run
`xvfb-run -a pnpm --filter server smoke --extension --binary build/sploot`.
Xvfb/xdotool are required. This exercises actual pairing/capture, not only API
fixtures. MCP changes use the existing `misty-sploot` skill and MCP contract;
the Go HTTP token story alone does not prove MCP transport.

## Failure and owned cleanup

Failure retains the exact run directory/logs. Repair the prerequisite/product
failure, then retry with a new library. Stale packets are not readiness proof;
a missing model/native library/browser is not permission for a fake fallback.

On ordinary exit or SIGINT/SIGTERM, the harness closes its browser and stops
children. Without `--keep`, successful runs remove only their own temporary
library; failures retain it. With `--keep`, inspect/sanitize evidence and retain
what is needed, then remove only the exact printed directory after confirming
it belongs to this run and no owned process remains. Never glob-delete temporary
libraries, `.sploot-local`, shared caches or other worktrees. Remove a separately
allocated private model cache only after its run stops. Ordinary caches remain;
worktree dependencies remain until its owner removes the worktree. No global
cleanup, container pruning or production writes.

Report exact revision/binary hash, commands, story verdicts, inspected evidence,
teardown and unexercised surfaces. Full existing acceptance gates run when owed;
this targeted local proof does not replace hosted `merge-gate`.

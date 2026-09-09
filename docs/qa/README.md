# QA Evidence

QA packets are per-run output: `packet.md` (scope, checks, verdict, residual
risk), authenticated screenshots, and full command transcripts. They are not
fixtures and are **not committed by default**.

`qa:evidence` writes a fresh directory under the gitignored
`.sploot-local/qa-evidence/<date>-<slug>-<unique>/`. `--out-dir <path>` chooses an
exact new packet directory instead; relative paths resolve from `apps/web`.
An existing output directory is an error, even if its prior run was incomplete.
Packet filenames and relative links are unchanged.

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
See [the acceptance gates](../../apps/web/docs/DEPLOYMENT.md#acceptance-gates) for prerequisites and
real unpacked-extension acceptance.

Retained Go runs contain test databases, account hashes and media as well as
screenshots. Share selected sanitized evidence, not the entire private directory.
They do not establish production or physical-device acceptance.

## Producing a predecessor packet

From `apps/web`, with the local pgvector container running
(`sploot-test-postgres` on 5432; `DATABASE_URL` defaults to
`postgresql://test:test@localhost:5432/sploot_test`):

```bash
pnpm qa:evidence \
  --slug share-target \
  --intent "share-target POST saves an image into the library" \
  --routes /app \
  --tests __tests__/api/share-target.test.ts \
  --risk "real-device share sheet not exercised"
```

The runner seeds deterministic fixtures (`qa:seed`), boots a dev server with
the qa-local auth harness enabled, mints a signed token for `qa-design-user`,
walks each route at each viewport with agent-browser (waiting for visible
images to decode), captures console/page errors, runs any named test paths,
and writes the packet. Exit code is non-zero when the verdict is FAIL (a
check failed or a page error was captured). Console errors never silently
pass: they are listed per walk and flagged next to the verdict.

Useful flags: `--gates` adds lint + type-check as checks; `--base-url` reuses
a running server; `--no-seed` skips seeding; `--seed-count 60` seeds above a
feature threshold; `--expect-piles --piles-min-assets 50` records and validates
the authenticated `/api/piles` response; `--exercise-pile-filter` opens `/app`,
clicks a pile filter, verifies selected/all states plus a non-empty gallery, and
captures `pile-filter-selected-1440x900.png`; `--expect-taste` records and
validates that taste-ranked assets differ from seeded shuffle and that
`/api/taste/profile` is ready; `--viewports 1440x900,390x844` is the default.

Use `--out-dir` when an approved retained artifact location is available:

```bash
pnpm qa:evidence \
  --slug share-target \
  --intent "share-target POST saves an image into the library" \
  --out-dir /approved-artifacts/new-share-target-run \
  --routes /app \
  --risk "real-device share sheet not exercised"
```

Replace that illustrative path with an authorized, new directory. The runner
only writes local files: it does not upload, redact, set access controls, or
guarantee retention. Keep new raw output outside tracked source directories.
Local ignored output is not durable evidence until retained appropriately.
The retired `dev:local:down` command is not a cleanup procedure. Never delete
`.sploot-local/` to remove a packet: it now also contains the persistent local
library. Retain needed evidence, then remove only the exact run-owned directory.

## Reading a packet

- **Verdict: PASS** with no warnings — checks green, no page/console errors.
- **Verdict: PASS** with a console-error warning — read the browser evidence
  before trusting it; pre-existing noise should be named in residual risk.
- **Verdict: FAIL** — the packet names the failing check (last transcript
  lines inline) or the page errors.

## Ownership and safe handling

- **Repository inputs and product assets:** the QA harness, deterministic seed
  data, curated evaluation fixtures (including intentionally precomputed
  embeddings), portable procedures, and selected sanitized public/demo/PWA
  screenshots with their required publishing manifests.
- **Linear:** the current work's intent, a concise result and residual risk,
  source revision, exercised environment/surface, and a link to retained
  evidence. A packet's PASS is not proof of deployment or unexercised devices.
- **Approved retained artifact storage:** full packets, screenshots, traces,
  and transcripts, with access and retention appropriate to their contents.
  Existing CI artifact consumers keep their own output paths; the gallery
  workflow uses `apps/web/test-results/` and its `.next` provenance, not this
  packet directory.

Default seeding is a useful safety boundary, not a sanitization guarantee.
`--no-seed` and `--base-url` may expose existing authenticated library data.
Inspect/redact output before sharing; never publish credentials, private memes,
request headers, or unrestricted raw transcripts to a public PR or Linear item.
Use a sanitized conclusion and permission-appropriate link instead.

Do not relocate or delete historical packets as part of a new run. Preserve
README/demo consumers and their provenance; promoting a new selected asset
requires deliberate content/privacy review, not wholesale packet commitment.
Auth/seeding internals are documented in `apps/web/docs/AUTH.md`.

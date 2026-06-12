# QA Evidence

`docs/qa/evidence/<date>-<slug>/` holds evidence packets: the verification
receipts for changes to the web app. Each packet is produced by one command
and contains `packet.md` (scope, checks, verdict, residual risk), screenshots
of authenticated browser walks, and full command transcripts.

## Producing a packet

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

## Reading a packet

- **Verdict: PASS** with no warnings — checks green, no page/console errors.
- **Verdict: PASS** with a console-error warning — read the browser evidence
  before trusting it; pre-existing noise should be named in residual risk.
- **Verdict: FAIL** — the packet names the failing check (last transcript
  lines inline) or the page errors.

Packets are committed with the change they verify; they are the "live
evidence" half of a completion claim. Auth/seeding internals are documented
in `apps/web/docs/AUTH.md`.

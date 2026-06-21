# Get Sploot into the iPhone share sheet via a Shortcut

Priority: P2 · Status: blocked · Estimate: M

## Goal

An iPhone user can share an image from any app (Photos, Reddit, etc.) into
Sploot — despite iOS never supporting PWA share targets — via an official
"Save to Sploot" Shortcut backed by a personal upload token.

## Oracle

- [ ] A user can mint (and revoke) a personal upload token from settings;
      tokens authenticate upload-only API calls (scoped: no read/delete),
      stored hashed.
- [ ] A documented Apple Shortcut accepts images from the share sheet and
      POSTs them to the upload API with the token; a shared .shortcut file
      or step-by-step recipe lives in docs and is linked from settings on
      iOS.
- [ ] Sharing a photo from the iOS share sheet through the Shortcut lands
      the asset in the library (dedupe applies); verified on a real device.
- [ ] Token misuse paths return the stable 401 contract; evidence packet
      with the live token mint → POST → revoke → 401 cycle.

## Notes

Platform reality (2026-06-11, confirmed on the user's iPhone): WebKit does
not implement the Web Share Target API, so the Android share_target
(PR #216) can never appear on iOS. Apple Shortcuts are the sanctioned
escape hatch: they sit in the share sheet, accept images, and can make
authenticated HTTP calls. The missing piece is auth — Clerk session
cookies aren't available to Shortcuts, hence the upload-token feature
(which also unlocks future CLI/automation ingestion). Until this ships,
the iOS path is copy → paste into the upload zone (documented in
settings).

Status (2026-06-20): the feature code merged to master (PR #231, squash
`73238ff`, `Closes-backlog: 033`). **Blocked, not done** — the user-facing
oracle (lands on a real device; live mint→POST→revoke→401 cycle) is not yet
green because the `upload_tokens` table is not applied to prod. Vercel does
not run migrations on deploy and the prod `DATABASE_URL` is sequestered, so
applying it is a manual step → owned by epic 036 (make schema-to-prod fully
agent-deployable). Until the table exists, the settings card degrades
gracefully ("tokens aren't available") and any `splt_` token returns the
throw-safe 401. Archive to `_done/` once the migration is applied and the
device test passes.

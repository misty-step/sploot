# Get Sploot into the iPhone share sheet via a Shortcut

Priority: P2 · Status: blocked · Estimate: M

## Goal

An iPhone user can share an image from any app (Photos, Reddit, etc.) into
Sploot — despite iOS never supporting PWA share targets — via an official
"Save to Sploot" Shortcut backed by a personal upload token.

## Oracle

- [x] A user can mint (and revoke) a personal upload token from settings;
      tokens authenticate upload-only API calls (scoped: no read/delete),
      stored hashed.
- [x] A documented Apple Shortcut accepts images from the share sheet and
      POSTs them to the upload API with the token; a shared .shortcut file
      or step-by-step recipe lives in docs and is linked from settings on
      iOS.
- [ ] Sharing a photo from the iOS share sheet through the Shortcut lands
      the asset in the library (dedupe applies); verified on a real device.
- [x] Token misuse paths return the stable 401 contract; evidence packet
      with the live token mint → POST → revoke → 401 cycle.

## Progress

Implemented the repo-side Shortcut foundation on
`deliver-033-ios-shortcut-upload`: hashed personal upload tokens, upload-only
auth for `POST /api/upload`, token list/create/revoke APIs, settings controls,
Shortcut setup docs, and a rendered setup page.

Evidence packet:
`docs/qa/evidence/2026-06-11-ios-shortcut-upload-token/packet.md`.

Blocked on the remaining real-device oracle: a physical iPhone must run the
Save to Sploot Shortcut from the native share sheet and prove the shared image
lands in the library with dedupe plus revoke → 401 behavior.

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

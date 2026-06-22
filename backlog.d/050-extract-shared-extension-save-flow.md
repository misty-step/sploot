# Extract a shared extension save-flow helper

Priority: P3 · Status: ready · Estimate: S

## Goal

The right-click and screenshot save paths share one `saveToSploot` helper, so the
auth-prompt and error→notification handling live in exactly one place.

## Context

Delivering 045 (screenshot capture) duplicated the save pattern that
`background/context-menu.ts` already had: auth check → prompt sign-in → produce
the image → `uploadImage` → success/error notification (with the `actionHref`
remediation branch). `background/screenshot.ts` repeats it with
`captureVisibleTab` instead of `fetchImage`. The duplication is ~12 lines; the
clean shape is a shared `saveToSploot(produce, retryHint)` that both call with
their own image-producer.

It was deferred from 045 because extracting it refactors the **untested** primary
right-click path — that should land with a `context-menu` test, not smuggled into
a feature change.

## Oracle

- [ ] One helper (e.g. `background/save-flow.ts` `saveToSploot`) owns auth +
      upload + notification + the `actionHref` error branch.
- [ ] `context-menu.ts` and `screenshot.ts` both call it with their own
      blob-producer; neither repeats the auth/error handling.
- [ ] A `context-menu` test covers the right-click flow so the refactor of the
      shipped primary path is verified, not just compiled.

## Notes

From the 045 delivery (2026-06-22). Keep the per-path specifics (context-menu's
no-image-URL guard + `extractFilename` with the tab-title fallback; screenshot's
host-derived filename) outside the shared helper.

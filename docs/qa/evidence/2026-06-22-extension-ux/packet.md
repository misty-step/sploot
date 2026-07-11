# Evidence Packet: Extension UX — auth, screenshot, feedback (045)

- Date: 2026-06-22
- Branch: `deliver-045-extension-ux`
- Ticket: Powder card `sploot-045`

## What changed

**Child 1 — auth seam (verify-led, no code).** The in-popup login form is
already gone: `SignedOutPanel` (`popup/App.tsx`) opens the web sign-in in a new
tab, and the popup re-reflects signed-in state on reopen via Clerk's
`__experimental_syncHostListener` + re-mount. Verified by inspection; the live
reopen check is in the operator checklist below.

**Child 2 — screenshot the visible tab → save.** New `background/screenshot.ts`
(`captureAndSaveVisibleTab`): auth → `chrome.tabs.captureVisibleTab` → Blob →
`uploadImage` → feedback, mirroring the right-click flow. Triggered by a new
"Screenshot this tab" button in the popup (`CAPTURE_VISIBLE_TAB` message →
background, which runs the capture since the popup closes on blur). No new
permissions — the manifest already has `*://*/*` + `tabs`.

**Child 3 — unmissable feedback + leak fix.** `showSuccess/ErrorNotification`
now also flash an action badge (`background/badge.ts`, ✓/!, auto-clear) so an
outcome shows even when notifications are suppressed. The per-notification
`onClicked.addListener` (which leaked a listener on every auto-dismissed
notification) is replaced by **one** handler registered at startup
(`setupNotificationFeedback`) reading a `notificationId → url` map — also the
MV3-correct pattern.

## Checks — automated (run)

- **PASS — extension tests** (`pnpm --filter extension test`): 7 files, **28
  tests**. Includes: the leak guard (one `addListener` regardless of N
  notifications), the success/error badge flashes, and the screenshot flow
  (capture+upload+filename, restricted-page error, unauth abort).
- **PASS — type-check** (`tsc --noEmit`).
- **PASS — build** (`pnpm --filter extension build`): bundles clean (the gate CI
  runs). Background + popup compile with all three children.

## Checks — operator (manual; no Chrome runtime here)

Load `dist/chrome-mv3/` unpacked (`chrome://extensions` → Developer mode → Load
unpacked) and:

1. **Auth seam**: signed out → popup shows "Sign In" (not a form) → opens web
   sign-in tab. Sign in, **reopen the popup** → it shows signed-in. (Child 1.)
2. **Screenshot**: on a normal page, popup → "Screenshot this tab" → a badge ✓
   flashes, a "Saved to Sploot" notification appears, and the screenshot is in
   the library. On a `chrome://` page → a "Save Failed" badge `!` + notification.
3. **Feedback**: right-click-save and screenshot both show the badge + the
   notification; clicking the success notification opens the library.

## Refactor (thermo-nuclear pass)

The right-click and screenshot flows shared the auth-prompt + upload + error
pattern. Extracted **`background/save-flow.ts` `saveToSploot(produce, retryLabel)`**;
both `context-menu.ts` and `screenshot.ts` now delegate to it (only the
"produce the image" step differs). Added `save-flow.test.ts` (4 cases) and a
`context-menu.test.ts` (2 cases) that exercises the shipped right-click path
end-to-end through the real shared pipeline — so the primary path is verified,
not just compiled. (This folds in what was ticket 050.)

## Residual

- Live extension behavior is operator-verified (no headless Chrome here); the
  34 unit tests + build cover compilation and the pure flows.
- A keyboard shortcut (`chrome.commands`) for screenshot is a natural fast
  follow to the popup button.

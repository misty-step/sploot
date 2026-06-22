# Extension UX: reachable auth, screenshot capture, unmissable feedback

Priority: P2 · Status: ready · Estimate: M

## Goal

The Chrome extension is pleasant to use: signing in never traps you in a
dismissable popup, you can screenshot-to-save, and every save visibly succeeds or
fails.

## Context

A 2026-06-22 investigation mapped the operator's three asks against live code
(`apps/extension`). Notably, the auth complaint is mostly already fixed in code —
verify the installed build.

## Children

1. **Verify / finish the auth seam (S).** The in-popup login form is already
   GONE: `SignedOutPanel` (`entrypoints/popup/App.tsx:57-73`) renders a "Sign In"
   button → `chrome.tabs.create(getSplootSignInUrl())`; the background polls Clerk
   WebSSO (`auth-manager.ts:97-153`). Ticket 017's web-sign-in flow is LIVE — the
   "password-manager extension dismisses the sploot popup" problem is already
   solved in code. Remaining gap: the popup is passive (doesn't auto-reflect
   sign-in until reopened). Verify `__experimental_syncHostListener`
   (`App.tsx:28`) flips state without a manual reopen; if not, add a
   focus/visibility re-check. **If the operator still sees an in-popup form,
   they're on a stale build — verify the installed/built version first.**
2. **Screenshot the visible tab → save (M).** No capture code exists today (grep
   clean; CLAUDE.md: "screenshot crop tool: not started"). `chrome.tabs.
   captureVisibleTab()` (no new permissions) → Blob → reuse `uploadImage()`
   verbatim, triggered from a popup button or a `chrome.commands` shortcut, run in
   the background worker (popups close mid-flow). v1 = full viewport; a
   region-crop overlay (content script + OffscreenCanvas) is a fast-follow.
   Handle `chrome://`/store/PDF failures via the existing error path.
3. **Unmissable save feedback + fix the listener leak (S).** The context-menu
   path already notifies (`context-menu.ts:103,117` via `chrome.notifications`),
   but OS notifications get missed/suppressed and the popup has no save action
   yet. Add an action badge (`chrome.action.setBadgeText` ✓/!, auto-clear ~3s).
   Fix a real bug: `notifications.ts:50,110` calls `onClicked.addListener` on
   every invocation — listeners accumulate in the worker; register once at module
   load.

## Oracle

- [ ] Unauthenticated use opens web sign-in in a tab (no dismissable in-popup
      form) and the popup reflects signed-in state without a manual reopen.
- [ ] A button/shortcut captures the visible tab and the image lands in the
      library via `/api/upload`.
- [ ] Every save shows success/failure (badge + notification); the
      `notifications.ts` `onClicked` listener leak is fixed.

## Notes

Investigation 2026-06-22 "extension". File map: popup `App.tsx` ·
`background/auth-manager.ts` · `background/context-menu.ts` ·
`background/notifications.ts` · `shared/api-client.ts`. MV3 limits:
`captureVisibleTab` fails on `chrome://`, the store, and PDF; `desktopCapture` /
region-crop deferred. Sequence 1 → 2 → 3 (2 gives the popup a real save action
that 3's feedback then serves). Keep as child tickets for independent
verification, not one mega-ticket.

# 060 — /app/upload redirect crashes the library page (hooks-order violation)

Status: done
Created: 2026-07-10
Closed: 2026-07-11

## Goal

Visiting `/app/upload` while authed (server redirect → `/app?upload=1`,
i.e. library page mounting with the upload panel open) threw React's
"Rendered more hooks than during the previous render" and the page
recovered into the empty state instead of the user's pile. Reproduced
identically on master (clean worktree rig, 2026-07-10) — pre-existing.

## What Was Built

Root cause (two stacked bugs, neither in app components):

1. **Hydration failure on every /app page under mobile UAs**:
   `CaptureSurfaces` in `components/library/empty-state.tsx` branched on
   `navigator.userAgent` during render (server said "chrome extension",
   iPhone client said "iphone shortcut") — guaranteed hydration mismatch
   → full client tree regeneration. Fixed with `useSyncExternalStore`
   (server snapshot `'desktop'`, client snapshot detects post-hydration).
   A second wall-clock seed in `components/chrome/status-line.tsx`
   (`useState(new Date())`) mismatched server/client relative-time text —
   fixed by making the clock tick-only (interval-driven, null until the
   first tick).
2. **The hooks crash itself lives in next@16.2.10's own `Router`
   component** (`next/dist/client/components/app-router.js:116`,
   `useMemo` in the deep stack with `Error.stackTraceLimit` raised) and
   fires when hydrating an RSC `redirect()` arrival. Sidestepped by
   deleting the legacy RSC redirect pages (`app/app/upload/page.tsx`,
   `app/app/search/page.tsx`) and moving both aliases to config-level
   HTTP redirects in `next.config.ts` (`async redirects()`).

Proof: authed Playwright walks (iPhone 13 emulation, both themes) —
`/app/upload`, `/app/search`, `/app` all zero pageerrors; upload panel
confirmed opening through the new redirect; qa-mobile-audit 16-walk
sweep clean. Shipped via `Closes-backlog: backlog.d/060` commit on the
mobile-friendliness branch.

## Notes

- If a future Next upgrade fixes the Router hooks bug, the config
  redirects remain the better shape anyway (no RSC round-trip).
- `scripts/qa-mobile-audit.ts` (committed) reproduces the whole class:
  device-emulated, authed, per-route pageerror + hscroll + touch-target
  assertions.

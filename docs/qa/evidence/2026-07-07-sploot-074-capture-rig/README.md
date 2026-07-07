# QA evidence — sploot-074 first-run capture rig (2026-07-07)

**Intent:** prove a 0-asset first-run user is presented capture-surface
activation without visiting settings, with a one-tap path per surface, and can
reach a first captured meme. Design decision:
`docs/design/lab-074-capture-activation.html` (option 01, two-lane capture rig).

**Runtime:** `pnpm dev:local` (docker pgvector + qa:seed + qa-local auth,
http://localhost:3001), walked with `agent-browser`. Each first-run user is a
fresh 0-asset qa-local principal via the new
`/api/qa-auth/login?user=qa-first-run*` override.

## Desktop (1440x900, default UA) — `desktop-first-run.gif`

1. `01-desktop-first-run.png` — login lands on `/app`: capture rig renders
   (demo pile with locked match + "chrome extension" row + lit paste/drag row).
   Extension link verified in-DOM:
   `https://chromewebstore.google.com/detail/sploot/fbhkflbcnllfogefckablkafjknmcfnd`,
   `target=_blank` (live listing, curl 200).
2. `02-desktop-upload-panel.png` — rig's "upload chaos" opens the upload panel.
3. `03-desktop-first-meme-captured.png` — file upload: "1 file uploaded",
   first-meme.png complete.
4. `04-desktop-grid-first-meme.png` — grid shows the first captured meme
   (embedding pending; deterministic-seed harness has no live Replicate).

## Mobile (emulated) — `mobile-first-run.gif`

5. `05-mobile-ios-first-run.png` — iPhone 16 emulation: rig leads with
   "iphone shortcut" + "set up the shortcut"; no extension pitch; home-screen
   row; command dock intact.
6. `06-mobile-ios-shortcut-setup.png` — one tap lands on
   `/app/settings#upload-tokens` (mint token + full shortcut recipe in view).
7. `07-mobile-android-first-run.png` — Pixel 9 emulation: "share sheet" row
   leads. Headless Chromium never fires `beforeinstallprompt`, so the manual
   add-to-home-screen fallback copy shows — on real Android Chrome the row
   carries the "wire the share sheet" one-tap install button
   (`usePwaInstallPrompt`), covered by unit test
   `__tests__/components/library/empty-state.test.tsx`.

## Console

Errors observed during the walk: `[SSE] Error` reconnect loop on
`/api/sse/embedding-updates` — pre-existing dev:local harness behavior
(no embedding worker), not introduced by this diff. No other errors; upload +
asset list network calls returned 2xx (`use-assets.api-response assetCount:1`).

## Not covered

- Real extension install + right-click save (needs a headed Chrome profile;
  extension internals are sploot-045's surface).
- Real iOS/Android hardware; device behavior emulated via UA/viewport.
- Deployed smoke (`pnpm --filter web smoke:deployed`) owed after merge/deploy.

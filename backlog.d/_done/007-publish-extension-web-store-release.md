---
id: 007-publish-extension-web-store-release
title: Publish Extension Web Store Release
status: done
lifecycle_stage: Intent
owner: local
acceptance:
  - Production extension zip is built from the monorepo and attached as release evidence.
  - Chrome Web Store listing text, privacy disclosures, permissions, and screenshots are final.
  - Production-like unpacked Chrome QA proves sign-in, right-click save, duplicate handling, and library visibility.
  - Store submission checklist records review status and rollback plan.
evidence_required:
  - pnpm --filter extension build:prod and zip:prod output
  - Chrome Web Store listing/screenshot artifact links
  - real Chrome extension QA notes
  - production API health evidence
refs:
  - apps/extension/CHROME_WEB_STORE_LISTING.md
  - apps/extension/STORE_LISTING.md
  - apps/extension/wxt.config.ts
  - apps/extension/shared/api-client.ts
---

# Publish Extension Web Store Release

Priority: high
Status: done
Estimate: M

## Latest Pass - 2026-05-26

- Used Computer Use in the real Chrome profile `Phaedrus (Phaedrus @ Home)`.
- Pulled Vercel production env locally, inspected production schema, resolved
  the first three migrations as the baseline for the existing non-empty
  production database, then applied the pending blob URL validation,
  shuffle-key, and storage-quota migrations. This fixed the production
  `/api/stats` failure caused by missing `public.user_storage_quotas`.
- Rebuilt the production unpacked extension and zip with the live Clerk
  publishable key sanitized from the Vercel production env file.
- Verified the active unpacked QA extension ID is
  `hikefmnilgapfckjmillbhcocihjffhn` and source is this worktree's
  `apps/extension/dist/chrome-mv3`.
- Saved a unique generated image through Chrome's real image context menu. The
  production library showed `Last upload: 2026-05-26T14:14:59Z`, queue `0`,
  `MEMES: 3,021`, `SIZE: 12.6 MB`, and first asset
  `user_35AWEm3dlfbKS0eWeQTRHAMlUA0/1779804899669-tp2wukz.png`.
- Fixed duplicate right-click saves so the extension treats Sploot's successful
  `409` duplicate upload response as a success instead of throwing. Duplicate
  notifications now say `Already in Sploot`.
- Repeated `Save to Sploot` on the same image. The production library stayed at
  `MEMES: 3,021`, queue `0`, and the same first asset, proving no duplicate
  asset was created.
- Uploaded corrected zip SHA256
  `a73c2996fd8fd102a0802da221832ebd1fddefe4e76c579183ae8a03ded0191f` to
  Chrome Web Store draft item `fbhkflbcnllfogefckablkafjknmcfnd` and saved the
  draft.
- Evidence:
  `.spellbook/evidence/cws-updated-package-submit-enabled-20260526.png`.
  Private local QA screenshots were captured but are intentionally not committed
  because this repository is public and the screenshots show the signed-in
  production library.

- Submitted Chrome Web Store draft item
  `fbhkflbcnllfogefckablkafjknmcfnd` for review after explicit action-time
  confirmation. Google reports `Pending review` and automatic publication after
  approval is enabled.
- Submission evidence:
  `.spellbook/evidence/cws-submitted-pending-review-20260526.png` and
  `.spellbook/evidence/cws-submitted-status-20260526.png`.

## What Was Built

- Production extension duplicate uploads now use Sploot's successful duplicate
  response as a successful result instead of surfacing an error.
- Duplicate right-click saves now show explicit `Already in Sploot`
  notification copy.
- Production database migration state was baseline-resolved and pending
  storage/shuffle/blob URL migrations were applied, unblocking production upload
  and stats paths.
- Chrome Web Store item `fbhkflbcnllfogefckablkafjknmcfnd` was packaged,
  listed, privacy-disclosed, QAed in real Chrome, and submitted for review.

## Evidence

- `pnpm --filter extension test -- --run shared/upload-response.test.ts entrypoints/background/notifications.test.ts`
- `pnpm lint`
- `pnpm type-check`
- `DATABASE_URL='postgresql://test:test@localhost:5432/sploot_test?sslmode=disable' pnpm --filter web db:migrate`
- `DATABASE_URL='postgresql://test:test@localhost:5432/sploot_test?sslmode=disable' CI=true pnpm --filter web test`
- `pnpm --filter extension build`
- `pnpm --filter extension release:check`
- Chrome Web Store receipts:
  `.spellbook/evidence/cws-updated-package-submit-enabled-20260526.png`,
  `.spellbook/evidence/cws-submitted-pending-review-20260526.png`,
  `.spellbook/evidence/cws-submitted-status-20260526.png`

## Latest Pass - 2026-05-22

- Used Computer Use against Chrome's real extension manager to load the current
  worktree production-like unpacked build from
  `/Users/phaedrus/.codex/worktrees/5075/sploot/apps/extension/dist/chrome-mv3`.
- Verified Chrome profile `Phaedrus (Phaedrus @ Home)` now records Sploot source
  as `/Users/phaedrus/.codex/worktrees/5075/sploot/apps/extension/dist/chrome-mv3`.
- Chrome's extension detail page shows Sploot version `1.0.0`, size `4.9 MB`,
  enabled state `On`, site access `On all sites`, and `Allow access to file
  URLs` enabled.
- The freshly loaded current-worktree extension popup shows the signed-out Clerk
  screen. `https://sploot.app/app` also redirects to sign-in, so authenticated
  upload and duplicate QA require a fresh login before release proof can be
  captured.
- Updated `apps/extension/STORE_LISTING.md` so `pnpm --filter extension
  release:check` no longer treats the stale extension source as current.

Remaining blockers before this can move to `_done`:

- Authenticate the current worktree extension in Chrome, then prove right-click
  upload and duplicate behavior against production.
- Chrome Web Store dashboard upload/review receipt is not captured.

## Latest Pass - 2026-05-24

- Used Computer Use in the real Chrome profile `Phaedrus (Phaedrus @ Home)`.
- Restored production Sploot authentication via the saved Proton Pass login.
- Verified `https://sploot.app/app` renders the signed-in production library
  with `MEMES: 3,020` and `SIZE: 11.4 MB`.
- Reauthenticated to the Chrome Web Store Developer Dashboard for publisher
  `phaedrus` using the saved Google passkey.
- Verified the current dashboard item list contains four existing extensions:
  `Trump Goggles`, `Bitcoin Price Tag`, `Time Is Money`, and `Quack`; no
  existing Sploot item is present.
- Opened the `Add new item` dialog and verified the dashboard is ready to accept
  a ZIP/CRX upload.

Remaining blockers before this can move to `_done`:

- Selecting `Save to Sploot` from a public image context menu uploads that image
  into the signed-in Sploot account, so explicit action-time confirmation is
  required before capturing right-click upload and duplicate proof.
- Uploading `apps/extension/dist/extension-1.0.0-chrome.zip` to the Chrome Web
  Store sends the package to Google, so explicit action-time confirmation is
  required before creating the new Web Store item.
- Chrome Web Store review submission receipt is not captured.

## Latest Pass - 2026-05-25

- Used Computer Use in the real Chrome profile `Phaedrus (Phaedrus @ Home)`.
- Rebuilt `apps/extension/dist/extension-1.0.0-chrome.zip` with the existing
  public live Clerk publishable key; SHA256 is
  `dfbf3b4e2ada82629cae3387462c6e5d4305f82aa363400624adc7d977e12435`.
- Uploaded the zip to the Chrome Web Store Developer Dashboard and created
  draft item `fbhkflbcnllfogefckablkafjknmcfnd`.
- Saved package, listing fields, store icon, screenshot, small promo tile,
  homepage URL, support URL, category, language, mature-content setting,
  privacy disclosures, permission justifications, data usage categories,
  certifications, and privacy policy URL.
- Captured dashboard evidence at
  `.spellbook/evidence/cws-privacy-submit-enabled-20260525.png`; the dashboard
  now enables `Submit for review`.
- Re-uploaded the current `dfbf3b4e...` zip after restoring the local unpacked
  production bundle; the draft remains item `fbhkflbcnllfogefckablkafjknmcfnd`.
- Captured the current saved draft state at
  `.spellbook/evidence/cws-current-package-submit-enabled-20260525.png`.
- Added `chrome-extension://fbhkflbcnllfogefckablkafjknmcfnd` to the web API's
  default Clerk authorized parties so the submitted Web Store extension origin
  is accepted by `verifyBearerOrThrow`.
- Added the currently enabled unpacked QA extension origin
  `chrome-extension://hikefmnilgapfckjmillbhcocihjffhn` to the same default
  authorized-party list after confirming that is the local Chrome extension ID
  currently used for real QA.
- Deployed the auth-origin change to production as
  `dpl_Dc6S9wEDe6xtnDyBMU2sJfg5fxFe`
  (`https://sploot-om9xryqr7-misty-step.vercel.app`) and confirmed
  `https://www.sploot.app` aliases to that ready deployment.
- Re-ran deployed smoke after the production deploy; `apps/web/docs/deployed-smoke-report.json`
  records `status: pass` for health, service health, signed-out route/API
  protection, and the production extension zip artifact.
- Verified the targeted auth contract with
  `pnpm --dir apps/web exec vitest run __tests__/lib/auth/verify-bearer.test.ts`.

Remaining blockers before this can move to `_done`:

- Prove right-click upload and duplicate behavior against production.
- Computer Use is currently blocked by the macOS lock screen
  (`cgWindowNotFound` for Google Chrome); unlock the Mac before capturing
  screenshot, right-click upload, duplicate, or final submit evidence.
- Click final Chrome Web Store `Submit for review` only after explicit
  action-time confirmation.

## Previous Pass - 2026-05-18

- Tightened deployed smoke to validate the canonical Chrome Web Store zip
  artifact by default instead of the mutable unpacked `dist/chrome-mv3`
  directory.
- Re-ran `pnpm --filter web smoke:deployed`; it passes against
  `https://www.sploot.app` and validates
  `apps/extension/dist/extension-1.0.0-chrome.zip`.
- Rebuilt the production extension from this worktree with the existing public
  `pk_live_*` Clerk publishable key embedded in the release artifact. The
  regenerated zip has production Sploot and Clerk host permissions, version
  `1.0.0`, and SHA256
  `0daf17d25bc9da654a9497749800ae0d34667bb5babcd4859dbc9edfdc21a99c`.
- Checked Chrome with an authenticated profile: the Sploot popup is signed in,
  `View My Library` opens `https://sploot.app/app`, and the library renders.
- Right-clicking `https://www.sploot.app/apple-icon.png` exposes
  `Save to Sploot`, but selecting it did not create observable success feedback
  or increase the library count from `3,020`; upload and duplicate behavior
  remain unproven.
- Follow-up inspection found the authenticated Chrome profile is signed in but
  the installed extension source is stale:
  `/Users/phaedrus/Development/sploot/apps/extension/dist/chrome-mv3-dev`.
  Service worker logs show auth/session, token retrieval, and image fetch
  succeeded before `POST /api/upload` failed. This is useful failure evidence,
  but it does not prove the current worktree release build.

## Release Readiness Gate - 2026-05-18

Added `pnpm --filter extension release:check` as the local release-readiness
gate for this item. In the current state it verifies the existing production
zip, listing status, screenshot dimensions, and promo tile dimensions, then
fails with the remaining external blockers: stale loaded Chrome extension
source, unproven authenticated right-click upload/duplicate behavior, and
missing Chrome Web Store dashboard receipt.

Generated the non-sensitive small promo tile at
`apps/extension/store-assets/promo/small-promo-440x280.png`; it validates at
Chrome's required `440x280` dimensions.

Captured a non-sensitive context-menu screenshot at
`apps/extension/store-assets/screenshots/01-context-menu-save-to-sploot-1280x800.png`.
The crop excludes personal Chrome tabs, profile details, and private library
content; it validates at Chrome's accepted `1280x800` dimensions.

## Goal

Sploot's Chrome extension is packaged, QAed, and submitted to the Chrome Web
Store with accurate listing and privacy disclosures.

## Non-Goals

- Rebuilding extension auth from scratch
- Adding Firefox release support
- Launching paid plans as part of the store submission

## Oracle

- [ ] `pnpm --filter extension build:prod` and `pnpm --filter extension zip:prod`
      produce a production artifact pointed at `https://www.sploot.app` and
      `https://clerk.sploot.app`.
- [ ] Store listing copy, screenshots, permission justifications, support URL,
      and privacy URL are final and internally consistent.
- [ ] Manual Chrome QA proves signed-out prompt, sign-in, right-click save,
      duplicate save, and "view library" behavior against production.
- [ ] Submission notes record Chrome Web Store status, version, artifact path,
      and rollback/disable plan.

## Scope

- `apps/extension`
- Chrome Web Store listing artifacts
- `apps/web` only for support/privacy copy needed by store review

## Why Now

The extension is Sploot's main save-from-web entrypoint, and `vision.md` names
save/search/shuffle as the current product focus. The 2026-05-18 groom verified
production extension build succeeds, but the store listing files conflict on
category/copy and screenshot readiness, and no submitted artifact is recorded.

## Links

- `apps/extension/CHROME_WEB_STORE_LISTING.md`
- `apps/extension/STORE_LISTING.md`
- `apps/extension/wxt.config.ts`
- `apps/extension/shared/api-client.ts`

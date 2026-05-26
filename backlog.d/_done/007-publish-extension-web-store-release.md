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

## What Was Built

- Fixed duplicate right-click saves so the extension treats Sploot's successful
  `409` duplicate upload response as a successful result instead of surfacing
  an error.
- Updated duplicate save notification copy to `Already in Sploot`.
- Baseline-resolved production Prisma migration state and applied the pending
  blob URL validation, shuffle-key, and storage-quota migrations, unblocking
  production upload and stats paths.
- Packaged, listed, privacy-disclosed, QAed, and submitted Chrome Web Store
  item `fbhkflbcnllfogefckablkafjknmcfnd` for review.

## Release State

- Chrome Web Store status: `Pending review`.
- Automatic publication after approval: enabled.
- Release ZIP:
  `apps/extension/dist/extension-1.0.0-chrome.zip`.
- Release ZIP SHA256:
  `a73c2996fd8fd102a0802da221832ebd1fddefe4e76c579183ae8a03ded0191f`.
- Submitted receipts:
  `.spellbook/evidence/cws-updated-package-submit-enabled-20260526.png`,
  `.spellbook/evidence/cws-submitted-pending-review-20260526.png`,
  `.spellbook/evidence/cws-submitted-status-20260526.png`.
- Private production-library QA screenshots were captured but intentionally not
  committed because this repository is public.

## Production QA

- Used Computer Use in the real Chrome profile `Phaedrus (Phaedrus @ Home)`.
- Verified the active unpacked QA extension ID
  `hikefmnilgapfckjmillbhcocihjffhn` loaded from this worktree's
  `apps/extension/dist/chrome-mv3`.
- Saved a unique generated image through Chrome's real image context menu.
- Production library showed `Last upload: 2026-05-26T14:14:59Z`, queue `0`,
  `MEMES: 3,021`, `SIZE: 12.6 MB`, and first asset
  `user_35AWEm3dlfbKS0eWeQTRHAMlUA0/1779804899669-tp2wukz.png`.
- Repeated `Save to Sploot` on the same image. The production library stayed at
  `MEMES: 3,021`, queue `0`, and the same first asset, proving no duplicate
  asset was created.

## Verification

- `pnpm --filter extension test -- --run shared/upload-response.test.ts entrypoints/background/notifications.test.ts`
- `pnpm lint`
- `pnpm type-check`
- `DATABASE_URL='postgresql://test:test@localhost:5432/sploot_test?sslmode=disable' pnpm --filter web db:migrate`
- `DATABASE_URL='postgresql://test:test@localhost:5432/sploot_test?sslmode=disable' CI=true pnpm --filter web test`
- `pnpm --filter extension build`
- `pnpm --filter extension release:check`
- PR #181 CI and Vercel checks passed before squash merge.
- Follow-up PR #182 fixed the post-merge Release workflow pnpm setup conflict;
  master CI and Release then passed and published `v1.1.0`.

## Follow-Up

- When Chrome Web Store approves the item, install the Web Store build and
  repeat sign-in, right-click save, duplicate save, and library visibility QA
  against the store extension ID.
- Watch Vercel and Sentry for upload, stats, Clerk authorized-party, and
  duplicate-save errors for the first 24 hours after approval.

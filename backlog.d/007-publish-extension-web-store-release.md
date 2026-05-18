---
id: 007-publish-extension-web-store-release
title: Publish Extension Web Store Release
status: ready
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
Status: ready
Estimate: M

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

---
id: 013-align-product-privacy-claims-with-runtime
title: Align Product Privacy Claims With Runtime
status: done
lifecycle_stage: Feedback
owner: local
acceptance:
  - Landing, privacy, support, and store listing claims match actual analytics and search logging behavior.
  - Any retained telemetry/search logging has clear retention and purpose copy.
  - Contradictory "no tracking" and "no query logging" statements are removed or made true.
  - Tests or static checks cover the most important public copy invariants.
evidence_required:
  - copy diff across public pages/listing docs
  - code review notes against analytics/search logging routes
  - legal/privacy review note or explicit owner signoff
refs:
  - apps/web/app/page.tsx
  - apps/web/app/privacy/page.tsx
  - apps/web/app/api/search/route.ts
  - apps/web/lib/analytics.ts
  - apps/extension/CHROME_WEB_STORE_LISTING.md
  - apps/extension/STORE_LISTING.md
---

# Align Product Privacy Claims With Runtime

Priority: high
Status: done
Estimate: S

## Goal

Sploot's public privacy and tracking claims are true against the code users are
running.

## Non-Goals

- Removing all observability by default
- Rewriting the full privacy policy
- Launching a telemetry preferences center unless needed to make claims true

## Oracle

- [x] Public copy no longer says or implies stronger privacy guarantees than
      the runtime provides.
- [x] Search logging and analytics behavior are described accurately, including
      purpose and retention if retained.
- [x] Chrome Web Store listing privacy disclosures match web policy and
      extension permissions.
- [x] Owner signoff records whether Sploot wants to change code to match the
      stronger claim or change copy to match current code.

## Scope

- `apps/web/app/page.tsx`
- `apps/web/app/privacy/page.tsx`
- `apps/web/app/support/page.tsx`
- `apps/extension/CHROME_WEB_STORE_LISTING.md`
- `apps/extension/STORE_LISTING.md`
- optional `apps/web/docs/API.md` privacy notes

## Why Now

The landing and listing copy claim no tracking/no query logging while runtime
has analytics code and search logging. This is a trust and store-review risk,
especially before publishing the extension.

## Links

- `apps/web/lib/analytics.ts`
- `apps/web/app/api/search/route.ts`
- `apps/web/app/privacy/page.tsx`

## What Was Built

- Replaced public "no tracking" / "zero tracking" claims with narrower claims that match runtime behavior: private library by default, no ads, and public sharing only when chosen.
- Updated privacy policy copy to disclose account-linked search logs, global popular search suggestions, 30-day retention, Replicate embedding processing, Vercel Analytics/Speed Insights, and Sentry diagnostics.
- Updated Chrome Web Store listing drafts so extension privacy claims match the web policy and selected-image upload behavior.
- Wired `/api/cron/purge-search-logs` into Vercel cron so the 30-day retention promise is scheduled in production.
- Added a static privacy-copy contract test covering forbidden stronger claims, required runtime disclosures, and the retention cron.

Owner signoff, 2026-05-18: chose copy-to-runtime alignment while preserving current runtime observability and search behavior. Runtime keeps Vercel Analytics/Speed Insights, Sentry, Replicate embedding processing, and account-linked search logs purged after 30 days. No telemetry opt-out or search-runtime behavior changed in this ticket.

Evidence:
- `pnpm --filter web exec vitest run __tests__/unit/privacy-copy-contract.test.ts __tests__/components/landing/benefit-grid.test.tsx`
- `DATABASE_URL='postgresql://test:test@localhost:5432/sploot_test?sslmode=disable' CI=true pnpm --filter web test`
- `pnpm type-check`
- `pnpm lint`
- `pnpm --filter extension build`
- `git diff --check`
- `gradient validate`

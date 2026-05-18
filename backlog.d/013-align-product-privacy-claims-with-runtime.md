---
id: 013-align-product-privacy-claims-with-runtime
title: Align Product Privacy Claims With Runtime
status: ready
lifecycle_stage: Intent
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
Status: ready
Estimate: S

## Goal

Sploot's public privacy and tracking claims are true against the code users are
running.

## Non-Goals

- Removing all observability by default
- Rewriting the full privacy policy
- Launching a telemetry preferences center unless needed to make claims true

## Oracle

- [ ] Public copy no longer says or implies stronger privacy guarantees than
      the runtime provides.
- [ ] Search logging and analytics behavior are described accurately, including
      purpose and retention if retained.
- [ ] Chrome Web Store listing privacy disclosures match web policy and
      extension permissions.
- [ ] Owner signoff records whether Sploot wants to change code to match the
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

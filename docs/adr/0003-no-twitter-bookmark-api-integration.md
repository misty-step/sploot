# ADR 0003: No Twitter/X bookmark API integration; ingest exports instead

- Status: Accepted
- Date: 2026-06-10

## Context

The 026 ingestion epic (child 6) asked for a feasibility verdict on
importing a user's Twitter/X bookmarks, since the vision names "memes
scattered across Twitter bookmarks" as a core acquisition source.

Findings (researched 2026-06-10):

- The official X API v2 `GET /2/users/{id}/bookmarks` endpoint requires a
  paid developer tier. Basic is $200/month ($2,100/year); usage-priced
  reads are ~$0.005 per post. A personal meme app cannot carry that cost,
  and OAuth onboarding (user authorizes a Sploot X app) adds heavy surface
  for one import.
- The official API caps bookmark access at the most recent ~800 bookmarks.
- X's own account data archive **excludes bookmarks**, so there is no
  official no-code export either.
- The working ecosystem answer is browser-side export: userscripts and
  extensions (twitter-web-exporter, XSaved, Xporter, cookie-based CLIs)
  that capture the user's own GraphQL traffic on x.com/i/bookmarks and emit
  JSON/CSV with tweet URLs and media URLs. These are ToS-gray, brittle, and
  third-party — fine for users to run themselves, wrong for Sploot to ship
  or depend on server-side.

## Decision

Do not build an X API/OAuth bookmark integration, and do not ship scraping.

Instead, meet the export files where they land:

1. Bulk import (026 child 4) accepts, alongside zips of images, a
   JSON/CSV bookmarks export from the common exporter tools; Sploot
   extracts media URLs and ingests each through the existing
   SSRF-guarded URL-import pipeline (`lib/upload/url-import.ts`) with
   checksum dedupe.
2. The Chrome extension's right-click save already works on x.com images
   today for one-at-a-time saves.

## Consequences

- Zero recurring API cost; no OAuth app review; no scraping liability.
- Users need a one-time third-party export step, which we document rather
  than automate.
- Revisit only if X ships an affordable bookmarks read tier or includes
  bookmarks in the account archive.

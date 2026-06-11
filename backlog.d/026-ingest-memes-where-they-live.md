# Ingest memes where they live

Priority: P1 · Status: in-progress · Estimate: XL

## Goal

A user whose memes are scattered across their phone, Twitter bookmarks, and
random URLs can get them into Sploot from where they already are — ingestion
stops being "drag a file onto a desktop browser tab."

## Oracle

- [ ] On Android (and iOS where supported), sharing an image from another
      app's native share sheet to the installed Sploot PWA saves it to the
      library (manifest `share_target` + receiving route, verified on a real
      device or emulator).
- [ ] The web upload surface accepts a pasted image URL and ingests the
      remote image server-side (with existing checksum dedupe applied).
- [ ] A bulk import path exists for at least one "scattered collection"
      source (zip/folder of images at minimum; Twitter/X bookmarks if API
      access proves viable) with progress UI and dedupe.
- [ ] The extension's registered Cmd+Shift+S screenshot shortcut either has a
      working capture UI or the dead manifest registration is removed.
- [ ] Offline/failed uploads survive a page refresh (queue persisted to
      IndexedDB, not memory).
- [ ] Full web suite + extension build green; live evidence per shipped child.

All six children shipped (PRs #216–#219 + evidence packets under
`docs/qa/evidence/`). The single open oracle item is real-device
share-sheet verification (item 1) — simulated multipart navigation POSTs
only so far. Close the epic after a phone/emulator share test.

## Notes

Vision targets "people with meme collections scattered across Twitter
bookmarks, Google Photos, camera rolls" — but the 2026-06-10 ingestion audit
found only desktop drag-drop/paste/picker and the Chrome right-click menu.
No share_target in `apps/web/public/manifest.json`, no URL import, no bulk
import, in-memory-only upload queue, and a screenshot shortcut registered in
`wxt.config.ts` with no UI behind it. Checksum dedupe
(`lib/upload/deduplication-service.ts`) already exists and de-risks every
bulk path. Ingestion is upstream of every other differentiator: piles,
search, and taste all need library mass.

## Children

1. ~~PWA share-target: manifest entry + POST receiver route + device QA.~~
   DONE — PR #216, evidence `docs/qa/evidence/2026-06-10-share-target/`.
   Real-device share-sheet QA remains residual (simulated multipart
   navigation POSTs only).
2. ~~URL import: paste-a-URL field in the upload zone + server-side fetch
   with size/MIME validation and dedupe.~~
   DONE — PR #217, evidence `docs/qa/evidence/2026-06-10-url-import/`.
3. ~~Persist the upload queue to IndexedDB; retry on reconnect/refresh.~~
   DONE — PR #219 (queue already existed; recovery never fired due to an
   effect-churn bug, now fixed + dequeue-on-recovery; /api/upload migrated
   to authenticateRequest). Evidence
   `docs/qa/evidence/2026-06-10-persistent-upload-queue/`.
4. ~~Bulk import v1: zip + bookmarks-export JSON/CSV with dedupe.~~
   DONE — zips unpack client-side into the normal pipeline; text bundles
   route extracted image URLs through /api/upload/url. Evidence
   `docs/qa/evidence/2026-06-10-bulk-import/`. Folder drag-drop traversal
   deferred.
5. ~~Decide screenshot capture: build the crop UI or delete the shortcut.~~
   DONE — dead `capture-screenshot` registration removed from
   `wxt.config.ts`; crop tool stays future scope.
6. ~~Investigate Twitter/X bookmark import feasibility; emit or kill with a
   written verdict.~~
   DONE — `docs/adr/0003-no-twitter-bookmark-api-integration.md`: no API
   integration ($200/mo tier, ~800-bookmark cap, account archive excludes
   bookmarks); ingest exporter JSON/CSV via child 4 instead.

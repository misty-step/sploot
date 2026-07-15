# PWA install and image-share contract

The static/deployed contract is executable without credentials:

```bash
pnpm --filter web validate:pwa -- --base-url=https://www.sploot.app
```

That command verifies the manifest, every icon and screenshot response, the
PNG MIME/dimensions/content, maskable safe-zone bounds, and unauthenticated
`GET`/`POST` reachability of `/share-target`. It never sends an authenticated
upload.

The authenticated local multipart seam is executable without credentials:

```bash
pnpm --filter web exec vitest run __tests__/app/share-target.test.ts --pool=forks --maxWorkers=1
```

It posts a valid 1x1 PNG through the route with local test auth, verifies the
parsed `File` reaches `ingestImage`, and preserves created/duplicate counts.

Regenerate the manifest screenshots from the built production-composed app
with the local QA harness. The capture rig owns its whole lifecycle: it runs a
fresh `next build --webpack`, seeds 24 deterministic PNG records, starts
`next start` on loopback, and captures through Playwright. It supplies the
capture-only QA switches and Clerk's public keyless placeholder key pair
itself; the only required input is a local pgvector `DATABASE_URL`:

```bash
DATABASE_URL='postgresql://test:test@localhost:5432/sploot_test?sslmode=disable' \
  pnpm --filter web capture:pwa-screenshots
```

This removes and reseeds 24 deterministic assets, opens the actual `/app`
through Playwright at the exact manifest viewports using the repository's
signed local QA principal, and waits for the real grid animation and seeded
image elements to settle. The capture uses only `next start` against the
production bundle. It rejects auth walls, loading/placeholder UI, hidden tiles,
HMR/dev portals, 4xx/5xx responses, browser errors, request failures, and
horizontal overflow; it never injects replacement DOM artwork. It then writes
`public/screenshots/capture-manifest.json`. `validate:pwa` verifies its hashes,
seed, route, dimensions, nonblank tile bounds, and rendered-state proof,
including the commit/tree/worktree provenance and exact capture URL/viewports.
The QA-only client/middleware bypass requires both `SPLOOT_QA_AUTH_MODE=enabled`
and `SPLOOT_PWA_CAPTURE_MODE=enabled`; ordinary production deployments do not
enable it.

For native proof on a Play-capable Android device or emulator:

1. Open the same base URL in Chrome and install Sploot from the browser menu.
2. Confirm the install prompt and launcher show `Sploot`, a colored overlapping
   circles icon, and a nonblank app shell.
3. From Photos or Chrome, share a PNG or JPEG and select Sploot.
4. Confirm the installed app opens on `/app` and reports one created image.
5. Share the same file again and confirm it reports a duplicate, not a second
   library item.

The native steps require a Play-capable Android surface and an authenticated
Sploot account; this repository contract does not claim that device proof.

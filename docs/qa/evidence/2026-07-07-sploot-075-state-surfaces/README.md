# sploot-075 state-surface inventory

Run date: 2026-07-07

Before server: `origin/master` at `6471bf96c1ed272081c45a80ea4abfd7d30ff916`, temporary worktree, `http://localhost:3002`

After server: `codex/sploot-075-state-surfaces`, local checkout, `http://localhost:3001`

Runtime: `pnpm dev:local --no-doctor` with local pgvector Postgres, Prisma migrations, `qa:seed`, and qa-local auth.

Browser evidence: `browser-walks.json`

## Routable Surface Checklist

| Surface | Before screenshot | After screenshot | Result |
|---|---|---|---|
| Public bad meme URL, `/m/00000000-0000-0000-0000-000000000000` | `before/m-bad-id-1440x900.png` | `after/m-bad-id-1440x900.png` | Raw `Meme not found` page replaced with designed `share url 404` state, CTA, status readout, and non-duplicating metadata. |
| Public bad share slug, `/s/nonexistent-slug-xyz` | `before/s-bad-slug-1440x900.png` | `after/s-bad-slug-1440x900.png` | Plain text 404 route handler replaced with designed `share slug 404` page; valid slugs still redirect through `buildShareRedirectPath`. |
| Root 404, `/this-route-does-not-exist` | `before/root-404-1440x900.png` | `after/root-404-1440x900.png` | Glitch/raw asset-not-found treatment replaced with the shared state surface. Route still correctly returns HTTP 404. |
| Settings copy, `/app/settings` | `before/settings-1440x900.png` | `after/settings-1440x900.png` | Removed false `Coming soon` promise for theme switching, notification spam, and squad-sharing. Replaced with shipped-truth settings scope. |
| Authenticated bad meme detail, `/app/meme/00000000-0000-0000-0000-000000000000` | `before/app-meme-bad-id-1440x900.png` | `after/app-meme-bad-id-1440x900.png` | Raw in-app `Meme not found` replaced with designed `detail 404`; similar-assets fetch no longer fires before the asset exists. |

## Component-Only Sweep

These surfaces do not have stable direct URLs, so the screenshot proxy is the shared state-surface rendering above plus source/test coverage:

| Surface | Disposition | Verification |
|---|---|---|
| `apps/web/app/error.tsx` | Uses `StateSurface`; removes raw rounded fallback and social/team-ish promise copy. | `pnpm --filter web exec vitest run __tests__/components/sploot/state-surface.test.tsx __tests__/app/state-surface-copy.test.ts` |
| `apps/web/app/global-error.tsx` | Uses `StateSurface`; reports logged crash and retry/front-door recovery. | Same targeted tests plus `pnpm --filter web type-check`. |
| `apps/web/app/app/error.tsx` | Uses `StateSurface`; database/auth/runtime states use shipped-truth descriptions. | Same targeted tests plus `pnpm --filter web type-check`. |
| `apps/web/components/share/share-page-error-boundary.tsx` | Uses `StateSurface` for share image load failures. | Type-check and shared state-surface rendering. |
| `apps/web/components/error-boundary.tsx` | Default fallback uses `StateSurface` in panel mode. | Type-check and shared state-surface rendering. |
| `apps/web/components/library/image-grid-error-boundary.tsx` | Uses `StateSurface` in panel mode with retry/refresh recovery. | Type-check and shared state-surface rendering. |
| Loading states in `app/app/layout.tsx`, `app/app/page.tsx`, `app/app/meme/[id]/page.tsx`, `components/settings/cache-status.tsx` | Generic `Loading...` copy removed or reframed to pile/cache-specific copy. | Grep proof below. |
| Empty/offline/upload error states | Existing copy was feature-true; no false roadmap/social promise found in the sweep. | Grep proof below. |

## Grep Proof

Command:

```sh
rg -n "Coming soon|roadmap|squad-sharing|notification spam|squad already got pinged|pinged the crew|Meme not found|Loading\\.\\.\\." apps/web/app apps/web/components -g '*.{ts,tsx}'
```

Result: no matches.

## Curl Proof

Commands:

```sh
curl -sS -o /tmp/sploot-075-m.html -w '%{http_code} %{content_type}\n' http://localhost:3001/m/00000000-0000-0000-0000-000000000000
curl -sS -o /tmp/sploot-075-s.html -w '%{http_code} %{content_type}\n' http://localhost:3001/s/nonexistent-slug-xyz
node - <<'JS'
const fs=require('fs');
for (const [label,file] of [['m','/tmp/sploot-075-m.html'],['s','/tmp/sploot-075-s.html']]) {
 const text=fs.readFileSync(file,'utf8');
 console.log(label, 'contains raw Meme not found:', text.includes('Meme not found'));
 console.log(label, 'contains state heading:', /this (meme left|share link fell)/.test(text));
}
JS
```

Observed:

```text
200 text/html; charset=utf-8
200 text/html; charset=utf-8
m contains raw Meme not found: false
m contains state heading: true
s contains raw Meme not found: false
s contains state heading: true
```

## Residuals

- Root 404 screenshots record the route's expected HTTP 404 as a browser network failure. The page is designed and the status is correct.
- Authenticated bad meme detail still records one expected `GET /api/assets/<bad-id>` 404 because the client must ask the API before it can render the missing-save state. The previous extra similar-assets 404 is gone.
- Error-boundary-only surfaces are verified through the shared component/test/type-check path rather than a direct browser-triggered crash route.

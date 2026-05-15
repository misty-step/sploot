# chrome extension - add to sploot

## location

the extension lives in this repo at `apps/extension`.

## status

✅ phase 1 mvp complete (2025-11-08)

## quick start

from repo root:

```bash
pnpm install
cp apps/extension/.env.example apps/extension/.env
# set:
# VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
# CLERK_SECRET_KEY=sk_test_...
# VITE_API_BASE_URL=http://localhost:3001

pnpm --filter extension generate:crx-key
pnpm --filter extension setup:clerk
pnpm dev:extension
```

the web app must also trust the same extension origin for Clerk bearer-token
verification:

```env
CLERK_AUTHORIZED_PARTIES=https://sploot.app,https://www.sploot.app,http://localhost:3001,chrome-extension://<extension-id>
```

load unpacked:
1. open `chrome://extensions`
2. enable dev mode
3. click "load unpacked"
4. select `apps/extension/dist/chrome-mv3`

## integration points

- **api**: `POST /api/upload` (multipart form data)
- **shared constants**: `@sploot/common` (upload limits + mime validation)
- **auth**: `@clerk/chrome-extension` with allowed origins for `chrome-extension://<id>`

## architecture notes

- background handles context menu + upload flow
- popup shows auth status + feedback
- `shared/` is the deep module for api + env + auth glue

see `docs/adr/0002-move-extension-into-monorepo.md` for the monorepo decision.

---
name: qa
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /qa

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not active for Sploot work tracking.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: backlog item status moves to `done` with a `What Was Built` note plus Conventional Commit subject/body or an explicit `Backlog: backlog.d/<id>-<slug>.md` trailer.

## How This Skill Works Here

QA is not “tests passed.” For web UI changes, run the web dev server on port 3001 and walk the changed route in Browser, checking console/network errors. For API changes, replay representative HTTP requests and verify status/body/auth behavior. For extension changes, build with `pnpm --filter extension build` or `build:prod`, then inspect `apps/extension/dist/chrome-mv3/` and manually smoke popup/background flows when browser state matters.

For DB/search/upload changes, use a pgvector-capable `DATABASE_URL`; otherwise mark that path unverified. Evidence should name exact commands and surfaces.

## Agentic Chrome Extension QA

Use this path when the changed surface includes `apps/extension`, extension auth, upload, shared upload contracts, or web API behavior consumed by the extension. This workflow is intentionally browser-real: unit tests do not prove Clerk popup auth, Chrome extension permissions, context menus, background workers, or user-visible notifications.

### Delegate First

When extension QA is non-trivial, run it as a small team:

- **Investigator**: read-only subagent maps changed extension/web surfaces, env requirements, and likely failure points.
- **Runner**: lead agent owns the actual browser session and command execution, because credentials/profile state and app windows are local.
- **Critic**: after the first pass, fresh-context reviewer checks whether every changed executable path was directly exercised and whether residual risk is honest.

Do not delegate credential entry. The lead agent either uses an already-authenticated profile/session, asks the user for a test account path, or records auth as blocked.

### Preflight

1. Confirm the worktree and changed surfaces:
   - `git status --short`
   - `git diff --stat`
2. Confirm env files exist without printing secrets:
   - `test -f apps/web/.env.local; echo web_env=$?`
   - `test -f apps/extension/.env; echo extension_env=$?`
3. Prepare extension identity before building when auth/upload will be tested:
   - If using a stable local extension ID: `pnpm --filter extension generate:crx-key`
   - If Clerk origin registration is needed: `pnpm --filter extension setup:clerk`
   - Then build: `pnpm --filter extension build`
4. For local DB-backed upload/search QA, start pgvector or use a real `DATABASE_URL`, then run:
   - `DATABASE_URL=... pnpm --filter web db:migrate`
5. Start the web app on the same origin configured for the extension:
   - `PORT=3001 pnpm --filter web dev`
   - `curl -i http://localhost:3001/api/health`
   - Confirm `CLERK_AUTHORIZED_PARTIES` includes the active web origin and extension origin.
6. Start or build the extension:
   - Preferred dev harness: `VITE_API_BASE_URL=http://localhost:3001 VITE_CLERK_SYNC_HOST=http://localhost:3001 pnpm --filter extension dev`
   - Manual unpacked path: `VITE_API_BASE_URL=http://localhost:3001 VITE_CLERK_SYNC_HOST=http://localhost:3001 pnpm --filter extension build`, then load `apps/extension/dist/chrome-mv3`.
   - Production-like unpacked QA path: source the production extension env without printing secrets, then run `VITE_API_BASE_URL=https://sploot.app VITE_CLERK_SYNC_HOST=https://clerk.sploot.app pnpm --filter extension build:prod:unpacked`. Load or reload `apps/extension/dist/chrome-mv3`.

If any required secret/env is missing, stop before browser login and record the exact blocked path. Do not invent dashboard steps; prefer local scripts such as `setup:clerk`.

### Chrome / Computer Use Path

Use Chrome/Computer Use when auth or extension UI matters. At the start of each assistant turn that interacts with Chrome, call `get_app_state` for Google Chrome. Prefer a dedicated Chrome profile or WXT-launched Chrome window to avoid disturbing the user’s active browsing.

Manual unpacked load, when WXT did not launch Chrome for you:

1. Open a new Chrome tab to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the absolute path:
   - `/Users/phaedrus/.codex/worktrees/7531/sploot/apps/extension/dist/chrome-mv3`
5. Verify the extension card appears as **Sploot** and record its ID.
6. If the ID differs from `apps/web/lib/auth/verify-bearer.ts` authorized parties or Clerk allowed origins, auth/upload is not verified until the origin is registered and the web allowlist is compatible.

Popup/auth smoke:

1. Open the Sploot extension popup from the Chrome toolbar.
2. Verify signed-out state renders the Clerk sign-in UI.
3. Sign in only via an existing authenticated profile or user-provided test account path.
4. Verify signed-in state renders:
   - user email/username,
   - **View My Library**,
   - **Debug Auth** in dev mode,
   - **Sign Out**.
5. Click **Debug Auth** in dev mode when available, then inspect background logs for auth diagnostics.

Context-menu upload smoke:

1. Open a deterministic image page, preferably a local fixture or stable image URL.
2. Right-click the image.
3. Choose **Save to Sploot**.
4. Verify the user-visible notification and inspect background logs for:
   - image fetch started/succeeded,
   - `POST /api/upload`,
   - `[ApiClient] Upload success` with populated `assetId` and `blobUrl`,
   - `[ContextMenu] Image saved successfully:` with the same asset id.
5. Verify the asset appears in the web app library at the configured API/web origin.

### Browser / API Path

Use Browser or Playwright-style automation for web-only checks that do not require Chrome extension APIs:

- Open the local web origin configured in `VITE_API_BASE_URL`.
- Check console and network errors on `/`, `/app`, and the changed route.
- For auth-protected pages, use existing browser session only; otherwise mark login blocked.
- Replay API calls with `curl` only when a valid cookie or bearer token is available. Never fabricate an auth token.

### Evidence To Capture

Every extension QA receipt must include:

- Commands run: build/dev server/test commands, including env vars with secrets redacted.
- Browser mode: WXT-launched Chrome, dedicated profile, or user Chrome profile.
- Extension ID and loaded path.
- Auth state: signed out, signed in, or blocked by missing test credentials/origin.
- Upload evidence: notification, background log summary, `POST /api/upload` status/body shape, and library verification.
- Console/network errors observed.
- DB/pgvector status for local API paths.
- Changed executable paths that were not directly exercised.

### Known Sploot Edge Cases

- `apps/extension` defaults `VITE_API_BASE_URL` to `http://localhost:3001` in scripts, while older web docs may mention `3000`. Align the port explicitly.
- `verifyBearerOrThrow` currently has hardcoded authorized parties. A local unpacked extension ID that is not registered/allowed will fail auth even if Clerk sign-in works.
- WXT dev mode is usually smoother than manual `chrome://extensions` loading because it launches a prepared Chrome instance with the extension loaded.
- Extension popup auth and background upload are distinct paths; both must be checked before claiming extension auth/upload is verified.
- Production Sploot currently stores the Clerk `__client` cookie on `clerk.sploot.app`; production-like extension QA must use `VITE_CLERK_SYNC_HOST=https://clerk.sploot.app`, not `https://www.sploot.app`.
- A proven real-user workflow receipt from 2026-05-15: Chrome profile `Phaedrus @ Home`, extension ID `ipnlamdcakhmbidjlpoinkgimfapejna`, unpacked source `/Users/phaedrus/Development/sploot/apps/extension/dist/chrome-mv3-dev`, production-like artifact built from this worktree and copied there for reload, popup signed in as the existing Sploot user, Rawganique image saved via **Save to Sploot**, library count changed `3,019 -> 3,020`, top asset `1778864505009-4jqsm82.jpg`, `Last upload: 2026-05-15T17:01:45Z`.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.

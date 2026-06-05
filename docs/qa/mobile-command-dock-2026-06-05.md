# Mobile Command Dock QA - 2026-06-05

## Scope

- Branch: `fix/mobile-command-dock`
- Changed surface: mobile library feed chrome, mobile feed padding/image sizing, tile action bar, and sort/shuffle controls.
- Intent: make upload, search, filter, sort, and shuffle fit in one mobile command dock while preserving desktop library controls.

## Commands

- `pnpm --filter web test -- --run apps/web/__tests__/components/library/mobile-feed-layout.test.tsx apps/web/__tests__/components/chrome/mobile-command-dock.test.tsx apps/web/__tests__/components/chrome/sort-dropdown.test.tsx`
- `pnpm --filter web type-check`
- `pnpm --filter web lint`
- `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`

## Browser Evidence

- Local dev server: `PORT=3002 pnpm dev` from `apps/web`
- Route exercised: `http://localhost:3002/app`
- Viewports:
  - `390x844`, screenshot: `docs/qa/mobile-command-dock-signin-390x844-2026-06-05.png`
  - `430x932`, screenshot: `docs/qa/mobile-command-dock-signin-430x932-2026-06-05.png`
- Result: unauthenticated users redirect to Clerk sign-in at both mobile viewport sizes.
- Console: only development-mode React/Vercel/Clerk messages were observed; no app error attributable to the mobile command dock change.

## Behavior Covered By Tests

- Shuffle is no longer a sort menu option.
- Mobile command dock exposes upload, search, filter, sort, and shuffle in a single bar.
- Filter and sort choices are collapsed into menus.
- Mobile image sizing is full-width at the 640px breakpoint.
- Mobile tile delete is a direct action; the one-item "more actions" menu is gone.
- Technical metadata remains hidden below the `sm` breakpoint.

## Residual Risk

Authenticated visual proof of the saved-meme feed remains blocked in headless local QA by Clerk. The feed behavior is covered by focused component tests and unauthenticated route smoke; final production verification should use GitHub/Vercel deployment status plus public health, and authenticated visual feed QA should be repeated with a seeded authenticated browser session when available.

# Open Web Sign-In From Extension

Status: done
Priority: high
Estimate: S

## Problem

When the extension needs authentication, it opens or renders the popup sign-in
flow. That forces Clerk sign-in into the constrained extension popup instead of
using the normal Sploot web sign-in surface.

## Shape

- Surface: `apps/extension` auth prompt, popup signed-out state, and auth
  navigation helpers.
- User-visible behavior: when a save action or popup state requires sign-in,
  open the configured Sploot web sign-in page in a new tab.
- Oracle: extension tests prove unauthenticated background prompt creates a tab
  for the configured `/sign-in` URL and does not call `chrome.action.openPopup`;
  URL helper tests prove `/sign-in` is built from `VITE_API_BASE_URL`.
- Out of scope: changing Clerk web routes, extension release packet, or web API
  auth contracts.

## Acceptance

- Signed-out popup no longer renders Clerk's inline `<SignIn />` form.
- Background sign-in prompt opens the Sploot web sign-in page in a new tab.
- Waiting for sign-in can complete after the web tab signs the user in and the
  extension background Clerk client observes the synced session.
- Extension tests and build pass.

## What Was Built

- Added `getSplootSignInUrl()` so extension sign-in links are built from the
  configured Sploot web origin and target `/sign-in`.
- Changed background `promptUserSignIn()` to open the web sign-in page in a new
  tab and poll a fresh Clerk background client until WebSSO exposes the synced
  session.
- Replaced the popup's inline Clerk `<SignIn />` form with a signed-out panel
  that opens the same web sign-in tab, while keeping the signed-in popup status
  and sign-out controls.
- Removed the stale extension redirect helper and updated extension docs to
  point sign-in/library URLs at `shared/app-url.ts`.
- Added regression coverage for the `/sign-in` URL, tab-opening prompt, and
  background polling completion path.

Evidence:
- `pnpm --filter extension test`
- `pnpm --filter extension type-check`
- `pnpm --filter extension build`
- `pnpm lint`
- `pnpm type-check`
- `pnpm --filter web test`
- Fresh Claude post-diff critic: `BLOCKING: none`

# Authentication Failure – RESOLVED ✅

> **Historical context:** This issue documents the legacy WebSSO + `VITE_CLERK_SYNC_HOST` flow. The extension now uses inline Clerk sign-in, so these steps are kept only for reference.

## Original Symptom
- Background logs showed `"[Auth] isAuthenticated check: {hasSession: false}"` even when user was logged into sploot.app.
- Context menu flow aborted with "Please login to sploot.app first" notification; uploads never fired.
- Chrome reported `Error: Unable to download all specified images` because notification icon tried to display remote URL after auth failed.

## Root Cause (Confirmed)
**Environment configuration mismatch** - The `.env` file contained:
- `pk_test_` Clerk key (development instance: tender-bison-73.clerk.accounts.dev)
- `VITE_CLERK_SYNC_HOST=https://www.sploot.app` (production URL)

**Why this failed:**
1. User logs into sploot.app → Clerk creates cookies for production instance
2. Extension tries to authenticate with `pk_test_` key (dev instance)
3. Clerk detects instance mismatch → refuses session hydration → `hasSession: false`
4. Clerk WebSSO requires exact match: test keys ↔ test instance, live keys ↔ production instance

## Fix Implemented

### 1. Configuration Fixes
- ✅ **Fixed `.env`**: Changed `VITE_CLERK_SYNC_HOST` from `https://www.sploot.app` to `http://localhost:3000`
- ✅ **Added bidirectional validation**: `shared/env.ts` now validates BOTH directions:
  - Catches: production host + dev key (original bug)
  - Catches: dev host + production key (reverse case)
  - Throws clear error at build time with fix instructions

### 2. Build Process
- ✅ **Reinstalled dependencies**: Native modules (`@rollup/rollup-darwin-arm64`) installed successfully
- ✅ **Production build created**: `pnpm build:prod` generated correct `dist/chrome-mv3/`
- ✅ **Verified configuration**:
  - Manifest has `clerk.sploot.app` (production Clerk domain)
  - Manifest has `www.sploot.app` (production sync host)
  - Background.js embeds `pk_live_` key (production instance)

### 3. Validation Added
```typescript
// shared/env.ts now validates both directions
if (hostEnvironment === 'production' && keyEnvironment !== 'production') {
  throw new Error('Clerk configuration mismatch: production host with dev key');
}
if (hostEnvironment === 'development' && keyEnvironment === 'production') {
  throw new Error('Clerk configuration mismatch: dev host with production key');
}
```

### 4. Missing Cookie Domain Permission (Second Issue Discovered)

After fixing environment config, testing revealed Clerk **still couldn't authenticate**. Investigation showed:

**Problem:** Clerk sets cookies on THREE domains:
- `clerk.sploot.app` ✅
- `www.sploot.app` ✅
- `sploot.app` ❌ **Extension lacked permission for root domain**

**Fix:** Added `https://sploot.app/*` to `host_permissions` in `wxt.config.ts`

```typescript
host_permissions: [
  '*://*/*',
  'https://sploot.app/*',        // Root domain (ADDED)
  'https://www.sploot.app/*',    // www subdomain
  'https://clerk.sploot.app/*',  // Clerk API
],
```

Chrome extensions need explicit permission for EACH cookie domain. Even though `sploot.app` and `www.sploot.app` look similar, they're different domains to the browser. Clerk WebSSO needs to read cookies from all three.

## Resolution Status: FIXED ✅ (Two Issues Found and Resolved)

### Testing Instructions
1. Load extension from `dist/chrome-mv3/` in Chrome
2. Login to https://www.sploot.app in a browser tab
3. Open extension background console (chrome://extensions → Inspect views)
4. Run `test-clerk-manually.js` in console
5. Expected: `✅ SUCCESS - Clerk found session!` with `hasSession: true`

### Lessons Learned
1. **Configuration drift prevention**: Bidirectional validation catches mismatches at build time
2. **Cookie domain permissions**: Chrome extensions need EXPLICIT permission for EACH cookie domain
   - `sploot.app` and `www.sploot.app` are different domains
   - Clerk may set cookies on root domain, www, AND custom Clerk subdomain
   - Check DevTools → Application → Cookies to see all domains
   - Add ALL domains to `host_permissions` in manifest
3. **Debugging WebSSO failures**: Two-step process
   - First: Verify environment config (keys match sync host)
   - Second: Verify cookie domain permissions (manifest includes all domains)
4. **Correct build commands**:
   - Development: `pnpm dev` (HMR, live reload)
   - Production: `pnpm build:prod` (uses `.env.production`)
   - DON'T use `pnpm build` for production testing
5. **Environment file strategy**:
   - `.env` - Local development only (localhost, pk_test)
   - `.env.production` - Production builds (sploot.app, pk_live)
   - Dotenv prioritizes `.env.production` when it exists (expected behavior)

### Prevention Measures
- Build-time validation prevents mismatched configurations
- Clear error messages guide developers to correct build command
- Documentation updated to emphasize `pnpm build:prod` for production testing
- Manifest now includes all three cookie domains (sploot.app, www.sploot.app, clerk.sploot.app)
- Future: Document cookie domain checking process in TESTING.md

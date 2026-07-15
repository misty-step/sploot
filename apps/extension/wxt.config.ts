import { defineConfig } from 'wxt';
import { resolve } from 'path';
import { normalizeHttpHostPermission } from './shared/host-permission';

export default defineConfig({
  vite: () => ({
    resolve: {
      alias: {
        '@sploot/common': resolve(__dirname, '../../packages/common/src'),
      },
    },
    server: {
      port: 3303,
      strictPort: true,
    },
  }),
  outDir: 'dist',
  extensionApi: 'chrome',
  manifest: () => {
    // Explicitly detect production via WXT_MODE environment variable
    // Use: `WXT_MODE=production wxt build` for production builds
    // Default to development for safety
    const isProduction = process.env.WXT_MODE === 'production';
    const isManifestCheck = process.env.WXT_MODE === 'manifest-check';
    const isReleaseLike = isProduction || isManifestCheck;
    const includeCrxKey = isProduction && process.env.INCLUDE_CRX_KEY === 'true';
    const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ?? '';

    if (isProduction && !publishableKey.startsWith('pk_live_')) {
      throw new Error('VITE_CLERK_PUBLISHABLE_KEY must be a pk_live_ key for production extension builds');
    }

    if (!isProduction && publishableKey && !publishableKey.startsWith('pk_test_')) {
      throw new Error('VITE_CLERK_PUBLISHABLE_KEY must be a pk_test_ key for development extension builds');
    }

    // Determine Clerk frontend API domain based on environment
    const clerkDomain = isReleaseLike
      ? 'https://clerk.sploot.app/*' // Production: custom Clerk domain
      : 'https://tender-bison-73.clerk.accounts.dev/*'; // Development: standard Clerk domain

    const rawApiHost = process.env.VITE_API_BASE_URL;
    if (!rawApiHost) {
      throw new Error('VITE_API_BASE_URL is required for extension builds (e.g., https://sploot.app or http://localhost:3001)');
    }
    const normalizedApiHost = new URL(rawApiHost).origin;
    if (isReleaseLike && normalizedApiHost !== 'https://www.sploot.app') {
      throw new Error('Production extension builds must use VITE_API_BASE_URL=https://www.sploot.app');
    }
    const apiHostPermission = normalizeHttpHostPermission(rawApiHost, 'VITE_API_BASE_URL');
    const rawSyncHost = process.env.VITE_CLERK_SYNC_HOST;
    if (!rawSyncHost) {
      throw new Error('VITE_CLERK_SYNC_HOST is required for extension builds (e.g., https://clerk.sploot.app or http://localhost:3001)');
    }
    const normalizedSyncHost = new URL(rawSyncHost).origin;
    if (isReleaseLike && normalizedSyncHost !== 'https://clerk.sploot.app') {
      throw new Error('Production extension builds must use VITE_CLERK_SYNC_HOST=https://clerk.sploot.app');
    }
    const syncHostPermission = normalizeHttpHostPermission(rawSyncHost, 'VITE_CLERK_SYNC_HOST');

    console.log(`[WXT Config] Building in ${isProduction ? 'PRODUCTION' : isManifestCheck ? 'MANIFEST CHECK' : 'DEVELOPMENT'} mode`);
    console.log(`[WXT Config] Clerk domain: ${clerkDomain}`);
    console.log(`[WXT Config] API host permission: ${apiHostPermission}`);
    console.log(`[WXT Config] Sync host permission: ${syncHostPermission}`);

    return {
      name: 'Sploot',
      description: 'Save memes from any site with one click. Find them instantly using AI semantic search. Your private meme library.',
      version: '1.0.0',
      icons: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
      permissions: ['storage', 'tabs', 'activeTab', 'contextMenus', 'notifications', 'cookies', 'alarms'],
      host_permissions: Array.from(
        new Set([
          // Keep capture access scoped to web pages. captureVisibleTab accepts
          // the temporary activeTab grant from the popup action, so we do not
          // need the broader <all_urls> host pattern (which also covers file:
          // and ftp: URLs).
          '*://*/*',
          apiHostPermission,
          syncHostPermission,
          'https://sploot.app/*',
          'https://www.sploot.app/*',
          clerkDomain,
        ])
      ),
      content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
      sandbox: "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval'; child-src 'self';",
    },
      // Web Store assigns its own key. Unpacked QA builds opt in so Chrome keeps a stable ID.
      ...(includeCrxKey ? { key: process.env.CRX_PUBLIC_KEY } : {}),
      action: {
        default_popup: 'popup.html',
      },
    };
  },
});

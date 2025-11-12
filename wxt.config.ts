import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist',
  extensionApi: 'chrome',
  manifest: () => {
    // Explicitly detect production via WXT_MODE environment variable
    // Use: `WXT_MODE=production wxt build` for production builds
    // Default to development for safety
    const isProduction = process.env.WXT_MODE === 'production';

    // Determine Clerk frontend API domain based on environment
    const clerkDomain = isProduction
      ? 'https://clerk.sploot.app/*' // Production: custom Clerk domain
      : 'https://tender-bison-73.clerk.accounts.dev/*'; // Development: standard Clerk domain

    const rawApiHost = process.env.VITE_API_BASE_URL || (isProduction ? 'https://sploot.app' : 'http://localhost:3000');
    const normalizedApiHost = rawApiHost.replace(/\/$/, '');
    const apiHostPermission = `${normalizedApiHost}/*`;

    console.log(`[WXT Config] Building in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);
    console.log(`[WXT Config] Clerk domain: ${clerkDomain}`);
    console.log(`[WXT Config] API host permission: ${apiHostPermission}`);

    return {
      name: 'Add to Sploot',
      description: 'Save memes from any website to your Sploot library with one click',
      version: '1.0.0',
      permissions: ['storage', 'tabs', 'contextMenus', 'notifications', 'cookies'],
      host_permissions: Array.from(
        new Set([
          '*://*/*',
          apiHostPermission,
          'https://sploot.app/*',
          'https://www.sploot.app/*',
          clerkDomain,
        ])
      ),
      // @ts-expect-error - key is not in the UserManifest type but is valid for Chrome
      key: process.env.CRX_PUBLIC_KEY,
      action: {
        default_popup: 'popup.html',
      },
      commands: {
        'capture-screenshot': {
          suggested_key: {
            default: 'Ctrl+Shift+S',
            mac: 'Command+Shift+S',
          },
          description: 'Capture screenshot selection',
        },
      },
    };
  },
});

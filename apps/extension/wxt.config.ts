import { defineConfig } from 'wxt';
import { resolve } from 'path';
import { DEFAULT_INSTANCE_URL, normalizeInstanceUrl } from './shared/instance-url';

export default defineConfig({
  vite: ({ mode }) => ({
    // WXT_MODE selects this repository's build flavor without changing the
    // unpacked output path; Vite's DEV flag describes serving, not that flavor.
    define: { 'import.meta.env.WXT_MODE': JSON.stringify(process.env.WXT_MODE ?? mode) },
    resolve: { alias: { '@sploot/common': resolve(__dirname, '../../packages/common/src') } },
    server: { port: 3303, strictPort: true },
  }),
  outDir: 'dist',
  extensionApi: 'chrome',
  manifest: () => {
    normalizeInstanceUrl(process.env.VITE_API_BASE_URL || DEFAULT_INSTANCE_URL);
    const isProduction = process.env.WXT_MODE === 'production';
    const includeCrxKey = isProduction && process.env.INCLUDE_CRX_KEY === 'true';
    return {
      name: 'Sploot',
      description: 'Save images and videos to your own Sploot instance. Find them with local semantic search. Your private meme library.',
      minimum_chrome_version: '123',
      version: '1.0.0',
      icons: { 16: 'icon-16.png', 32: 'icon-32.png', 48: 'icon-48.png', 128: 'icon-128.png' },
      permissions: ['storage', 'tabs', 'activeTab', 'contextMenus', 'notifications', 'alarms'],
      // Existing web-only capture access also permits operator-selected instances.
      // No cookie authority, file/FTP access, remote code, or content-script bridge.
      host_permissions: ['*://*/*'],
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self';",
      },
      ...(includeCrxKey ? { key: process.env.CRX_PUBLIC_KEY } : {}),
      action: { default_popup: 'popup.html' },
      commands: {
        _execute_action: {
          suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' },
        },
      },
    };
  },
});

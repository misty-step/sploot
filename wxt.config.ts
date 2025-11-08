import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  manifest: {
    name: 'Add to Sploot',
    description: 'Save memes from any website to your Sploot library with one click',
    version: '1.0.0',
    permissions: ['storage', 'tabs', 'contextMenus', 'notifications'],
    host_permissions: ['*://*/*'],
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
  },
});

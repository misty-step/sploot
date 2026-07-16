import { setupAuthBridge } from './background/auth-manager';
import { setupContextMenu, ensureContextMenus } from './background/context-menu';
import { setupNotificationFeedback } from './background/notifications';
import { setupScreenshotCapture } from './background/screenshot';
import { checkApiHealth } from '../shared/api-health';
import { IS_DEV_BUILD } from '../shared/build-mode';
import { E2E_AUTH_MODE } from '../shared/env';
import { UPDATE_MESSAGES, setupUpdateStatus, setInstalledVersionForTesting, setUpdateAvailableForTesting } from '../shared/update-status';

export default defineBackground(() => {
  console.log('[Background] ========================================');
  console.log('[Background] Sploot extension background worker starting...');
  console.log('[Background] ========================================');

  // Log environment info
  const manifest = chrome.runtime.getManifest();
  console.log('[Background] Extension info:', {
    name: manifest.name,
    version: manifest.version,
    manifestVersion: manifest.manifest_version,
    extensionId: chrome.runtime.id,
  });

  console.log('[Background] Permissions:', manifest.permissions);
  console.log('[Background] Host permissions:', manifest.host_permissions);

  try {
    // Fire-and-forget health and update checks; neither may block startup.
    setupUpdateStatus();
    if (IS_DEV_BUILD || E2E_AUTH_MODE) {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (typeof message?.version !== 'string') return undefined;
        if (message.type === UPDATE_MESSAGES.TEST_SET_AVAILABLE) {
          void setUpdateAvailableForTesting(message.version).then(ok => sendResponse({ ok }));
          return true;
        }
        if (message.type === UPDATE_MESSAGES.TEST_SET_INSTALLED) {
          void setInstalledVersionForTesting(message.version).then(ok => sendResponse({ ok }));
          return true;
        }
        return undefined;
      });
    }

    checkApiHealth().then(ok => {
      if (!ok) {
        console.warn('[Background] API is unreachable at startup; uploads may fail until API is up.');
      }
    });

    // Initialize authentication manager
    console.log('[Background] Initializing auth bridge...');
    setupAuthBridge();
    console.log('[Background] ✅ Auth bridge initialized');

    // Register the single notifications click handler (once, at startup)
    setupNotificationFeedback();

    // Initialize context menu
    console.log('[Background] Initializing context menu...');
    ensureContextMenus(); // idempotent create
    setupContextMenu();
    console.log('[Background] ✅ Context menu initialized');

    // Screenshot-the-visible-tab → save (triggered from the popup)
    setupScreenshotCapture();
    console.log('[Background] ✅ Screenshot capture initialized');


    console.log('[Background] ========================================');
    console.log('[Background] ✅ Sploot extension initialized successfully');
    console.log('[Background] ========================================');
  } catch (error) {
    console.error('[Background] ========================================');
    console.error('[Background] ❌ FATAL ERROR during initialization:');
    console.error('[Background]', error);
    console.error('[Background] ========================================');
    throw error; // Re-throw to show in chrome://extensions errors page
  }
});

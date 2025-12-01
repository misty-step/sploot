import { setupAuthBridge } from './background/auth-manager';
import { setupContextMenu, ensureContextMenus } from './background/context-menu';
import { checkApiHealth } from '../shared/api-health';

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
    // Fire-and-forget health check; don't block startup (Chrome requires sync main)
    checkApiHealth().then(ok => {
      if (!ok) {
        console.warn('[Background] API is unreachable at startup; uploads may fail until API is up.');
      }
    });

    // Initialize authentication manager
    console.log('[Background] Initializing auth bridge...');
    setupAuthBridge();
    console.log('[Background] ✅ Auth bridge initialized');

    // Initialize context menu
    console.log('[Background] Initializing context menu...');
    ensureContextMenus(); // idempotent create
    setupContextMenu();
    console.log('[Background] ✅ Context menu initialized');


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

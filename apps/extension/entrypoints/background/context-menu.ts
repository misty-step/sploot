/**
 * Context Menu Handler
 *
 * Registers right-click "Save to Sploot" menu item for images.
 * Handles image capture and upload coordination.
 */

import { IS_DEV_BUILD } from '../../shared/build-mode';
import { runAuthDiagnostics } from './auth-manager';
import { enqueueContextMenuSave, recoverPendingContextMenuSaves } from './context-menu-save-queue';
import { showErrorNotification } from './notifications';

const MENU_ID_SAVE = 'save-to-sploot';
const MENU_ID_DIAGNOSTICS = 'sploot-debug-auth';

/**
 * Idempotently create context menus. Safe to call on startup and onInstalled.
 */
export function ensureContextMenus() {
  try {
    chrome.contextMenus.create({
      id: MENU_ID_SAVE,
      title: 'Save to Sploot',
      contexts: ['image'],
    }, () => void chrome.runtime.lastError); // ignore duplicate errors

    if (IS_DEV_BUILD) {
      // Dev-build-only diagnostics; production ships no debug menu items.
      chrome.contextMenus.create({
        id: MENU_ID_DIAGNOSTICS,
        title: 'Sploot Debug: Dump Auth State',
        contexts: ['action'],
      }, () => void chrome.runtime.lastError);
    } else {
      // A previous dev build may have left the item behind in this profile.
      chrome.contextMenus.remove(MENU_ID_DIAGNOSTICS, () => void chrome.runtime.lastError);
    }

    console.log('[ContextMenu] Ensured context menus exist');
  } catch (error) {
    console.error('[ContextMenu] Failed to ensure context menus', error);
  }
}

/**
 * Initialize context menu
 */
export function setupContextMenu() {
  // Recover jobs that were left in-flight when the MV3 worker was terminated.
  void recoverPendingContextMenuSaves().catch(error => {
    console.error('[Background][ContextMenu] Recovery failed', error);
  });

  // Create context menu on extension install/update
  chrome.runtime.onInstalled.addListener(() => {
    ensureContextMenus();
  });

  chrome.runtime.onStartup.addListener(() => {
    return recoverPendingContextMenuSaves().catch(error => {
      console.error('[Background][ContextMenu] Startup recovery failed', error);
    });
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU_ID_SAVE) {
      await handleImageSave(info.srcUrl, tab);
      return;
    }

    if (info.menuItemId === MENU_ID_DIAGNOSTICS && IS_DEV_BUILD) {
      await handleDiagnostics();
    }
  });
}

/**
 * Handle image save flow
 */
async function handleImageSave(
  imageUrl: string | undefined,
  tab: chrome.tabs.Tab | undefined
): Promise<void> {
  if (!imageUrl) {
    showErrorNotification('No image URL found');
    return;
  }

  try {
    await enqueueContextMenuSave(imageUrl, extractFilename(imageUrl, tab?.title));
  } catch (error) {
    console.error('[Background][ContextMenu] Save failed', error);
    showErrorNotification(error instanceof Error ? error.message : 'Could not save to Sploot.');
  }
}

async function handleDiagnostics(): Promise<void> {
  console.log('[ContextMenu] Running manual auth diagnostics');
  try {
    const snapshot = await runAuthDiagnostics();
    console.log('[ContextMenu] Diagnostics snapshot', snapshot);
  } catch (error) {
    console.error('[ContextMenu] Diagnostics failed', error);
    showErrorNotification('Diagnostics failed. Check console.');
  }
}

/**
 * Extract filename from URL or use tab title
 */
function extractFilename(url: string, tabTitle?: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'image.jpg';

    // If filename doesn't have extension, infer from URL or default
    if (!filename.includes('.')) {
      return `${filename}.jpg`;
    }

    return filename;
  } catch {
    // Fallback: Use tab title or generic name
    if (tabTitle) {
      const sanitized = tabTitle
        .replace(/[^a-z0-9]/gi, '-')
        .toLowerCase()
        .substring(0, 50);
      return `${sanitized}.jpg`;
    }

    return `image-${Date.now()}.jpg`;
  }
}

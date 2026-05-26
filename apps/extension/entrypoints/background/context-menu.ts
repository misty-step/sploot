/**
 * Context Menu Handler
 *
 * Registers right-click "Save to Sploot" menu item for images.
 * Handles image capture and upload coordination.
 */

import { isAuthenticated, promptUserSignIn, runAuthDiagnostics } from './auth-manager';
import { fetchImage } from './image-fetcher';
import { uploadImage } from '../../shared/api-client';
import { showSuccessNotification, showErrorNotification } from './notifications';

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

    chrome.contextMenus.create({
      id: MENU_ID_DIAGNOSTICS,
      title: 'Sploot Debug: Dump Auth State',
      contexts: ['action'],
    }, () => void chrome.runtime.lastError);

    console.log('[ContextMenu] Ensured context menus exist');
  } catch (error) {
    console.error('[ContextMenu] Failed to ensure context menus', error);
  }
}

/**
 * Initialize context menu
 */
export function setupContextMenu() {
  // Create context menu on extension install/update
  chrome.runtime.onInstalled.addListener(() => {
    ensureContextMenus();
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU_ID_SAVE) {
      await handleImageSave(info.srcUrl, tab);
      return;
    }

    if (info.menuItemId === MENU_ID_DIAGNOSTICS) {
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
  console.log('[ContextMenu] handleImageSave invoked', {
    imageUrl,
    tabId: tab?.id,
    tabTitle: tab?.title,
  });

  if (!imageUrl) {
    showErrorNotification('No image URL found');
    return;
  }

  try {
    // Check authentication
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      showErrorNotification('Please sign in via the Sploot extension popup');
      const signedIn = await promptUserSignIn();
      if (!signedIn) {
        showErrorNotification('Sign-in was not completed. Try again.');
        return;
      }
    }

    // Fetch image (handles CORS)
    console.log('[ContextMenu] Fetching image:', imageUrl);
    const imageBlob = await fetchImage(imageUrl);

    // Extract filename from URL or tab title
    const filename = extractFilename(imageUrl, tab?.title);

    // Upload to Sploot
    console.log('[ContextMenu] Uploading image:', filename);
    const result = await uploadImage(imageBlob, filename);

    // Show success notification
    showSuccessNotification(filename, result.thumbnailUrl, { isDuplicate: result.isDuplicate });

    console.log('[ContextMenu] Image saved successfully:', result.assetId);
  } catch (error) {
    console.error('[ContextMenu] Failed to save image:', error);

    if (error instanceof Error && 'actionHref' in error && typeof error.actionHref === 'string') {
      showErrorNotification({
        message: error.message,
        actionHref: error.actionHref,
      });
      return;
    }

    showErrorNotification(error instanceof Error ? error.message : 'Failed to save image');
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

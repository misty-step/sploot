/**
 * Context Menu Handler
 *
 * Registers right-click "Save to Sploot" menu item for images.
 * Handles image capture and upload coordination.
 */

import { getAuthToken, isAuthenticated } from './auth-manager';
import { fetchImage } from './image-fetcher';
import { uploadImage } from '../../shared/api-client';
import { showSuccessNotification, showErrorNotification } from './notifications';

/**
 * Initialize context menu
 */
export function setupContextMenu() {
  // Create context menu on extension install/update
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'save-to-sploot',
      title: 'Save to Sploot',
      contexts: ['image'],
    });

    console.log('[ContextMenu] Registered "Save to Sploot" menu item');
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'save-to-sploot') {
      await handleImageSave(info.srcUrl, tab);
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
    // Check authentication
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      showErrorNotification('Please login to sploot.app first');
      // Open sploot.app in new tab
      chrome.tabs.create({ url: 'https://sploot.app' });
      return;
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
    showSuccessNotification(filename, result.thumbnailUrl);

    console.log('[ContextMenu] Image saved successfully:', result.assetId);
  } catch (error) {
    console.error('[ContextMenu] Failed to save image:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to save image';
    showErrorNotification(errorMessage);
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

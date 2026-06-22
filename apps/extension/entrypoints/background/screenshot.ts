/**
 * Screenshot capture → save.
 *
 * Grabs the visible area of the active tab and uploads it to Sploot — the
 * operator's most common capture after right-click-save. Mirrors the
 * context-menu save flow (auth → capture → upload → feedback), swapping the
 * image fetch for `chrome.tabs.captureVisibleTab`. Runs in the background worker
 * because the popup closes the moment it loses focus.
 */

import { isAuthenticated, promptUserSignIn } from './auth-manager';
import { uploadImage } from '../../shared/api-client';
import { showSuccessNotification, showErrorNotification } from './notifications';
import { CAPTURE_MESSAGES } from '../../shared/capture-messages';

/**
 * Register the popup → background trigger for a visible-tab screenshot.
 */
export function setupScreenshotCapture(): void {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === CAPTURE_MESSAGES.VISIBLE_TAB) {
      // Fire-and-forget: feedback is delivered via notification + badge.
      void captureAndSaveVisibleTab();
    }
  });
}

export async function captureAndSaveVisibleTab(): Promise<void> {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      showErrorNotification('Opening Sploot sign-in. Try the screenshot again after signing in.');
      const signedIn = await promptUserSignIn();
      if (!signedIn) {
        showErrorNotification('Sign in on Sploot, then try the screenshot again.');
        return;
      }
    }

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || tab.windowId === undefined) {
      showErrorNotification('No active tab to screenshot.');
      return;
    }

    // Fails on restricted pages (chrome://, the Web Store, the PDF viewer) —
    // the rejection message is surfaced to the user.
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const blob = await (await fetch(dataUrl)).blob();
    const filename = screenshotFilename(tab.url);

    const result = await uploadImage(blob, filename);
    showSuccessNotification(filename, result.thumbnailUrl, { isDuplicate: result.isDuplicate });
  } catch (error) {
    if (error instanceof Error && 'actionHref' in error && typeof error.actionHref === 'string') {
      showErrorNotification({ message: error.message, actionHref: error.actionHref });
      return;
    }
    showErrorNotification(error instanceof Error ? error.message : 'Screenshot failed');
  }
}

/** e.g. "screenshot-twitter.com-1750000000000.png". */
function screenshotFilename(url: string | undefined): string {
  let host = 'screenshot';
  if (url) {
    try {
      host = new URL(url).hostname || host;
    } catch {
      // keep the default
    }
  }
  return `screenshot-${host}-${Date.now()}.png`;
}

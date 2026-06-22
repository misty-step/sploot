/**
 * Screenshot capture → save.
 *
 * Grabs the visible area of the active tab and uploads it to Sploot — the
 * operator's most common capture after right-click-save. Mirrors the
 * context-menu save flow (auth → capture → upload → feedback), swapping the
 * image fetch for `chrome.tabs.captureVisibleTab`. Runs in the background worker
 * because the popup closes the moment it loses focus.
 */

import { saveToSploot } from './save-flow';
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

export function captureAndSaveVisibleTab(): Promise<void> {
  return saveToSploot(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || tab.windowId === undefined) {
      throw new Error('No active tab to screenshot.');
    }

    // Fails on restricted pages (chrome://, the Web Store, the PDF viewer) —
    // the rejection message is surfaced to the user by saveToSploot.
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const blob = await (await fetch(dataUrl)).blob();
    return { blob, filename: screenshotFilename(tab.url) };
  }, 'the screenshot');
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

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
import { UPLOAD, prepareImageForUpload } from '@sploot/common';

const CAPTURE_ERROR = "Chrome doesn't allow capturing this page. Try a normal web page.";

/**
 * Register the popup → background trigger for a visible-tab screenshot.
 */
export function setupScreenshotCapture(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== CAPTURE_MESSAGES.VISIBLE_TAB) {
      return undefined;
    }

    // Returning true keeps the MV3 message event (and therefore the service
    // worker) alive until capture, upload, and durable feedback have finished.
    // The popup-side sendMessage promise is the other end of this lifecycle.
    void captureAndSaveVisibleTab().then(
      () => sendResponse({ completed: true }),
      (error) => {
        console.error('[Background][Screenshot] capture job failed unexpectedly', error);
        sendResponse({ completed: false });
      },
    );
    return true;
  });
}

export function captureAndSaveVisibleTab(): Promise<void> {
  return saveToSploot(
    async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || tab.windowId === undefined) {
        throw new Error('No active tab to screenshot.');
      }

      const tabUrl = ensureHttpTabUrl(tab.url);

      let dataUrl: string;
      try {
        dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      } catch (error) {
        console.warn('[Background][Screenshot] captureVisibleTab failed', error);
        throw new Error(CAPTURE_ERROR);
      }
      const capturedBlob = await (await fetch(dataUrl)).blob();
      const filename = screenshotFilename(tabUrl);
      const prepared = await prepareImageForUpload(new File([capturedBlob], filename, {
        type: capturedBlob.type || 'image/png',
        lastModified: Date.now(),
      }));

      if (prepared.file.size > UPLOAD.multipartSafeSize) {
        const sizeMB = (prepared.file.size / 1024 / 1024).toFixed(2);
        throw new Error(`Image too large after compression: ${sizeMB}MB`);
      }

      return { blob: prepared.file, filename: prepared.file.name };
    },
    'screenshot',
    { prepareBeforeAuth: true },
  );
}

/** e.g. "screenshot-twitter.com-1750000000000.png". */
function screenshotFilename(url: string): string {
  const host = new URL(url).hostname || 'screenshot';
  return `screenshot-${host}-${Date.now()}.png`;
}

export function ensureHttpTabUrl(url: string | undefined): string {
  if (!url) {
    throw new Error(CAPTURE_ERROR);
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(CAPTURE_ERROR);
    }
    return parsed.href;
  } catch (error) {
    if (error instanceof Error && error.message === CAPTURE_ERROR) {
      throw error;
    }
    throw new Error(CAPTURE_ERROR);
  }
}

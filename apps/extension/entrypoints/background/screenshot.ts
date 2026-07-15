/**
 * Screenshot capture → save.
 *
 * Grabs the visible area of the active tab and uploads it to Sploot — the
 * operator's most common capture after right-click-save. Mirrors the
 * context-menu save flow (auth → capture → upload → feedback), swapping the
 * image fetch for `chrome.tabs.captureVisibleTab`. Runs in the background worker
 * because the popup closes the moment it loses focus.
 */

import { CAPTURE_MESSAGES } from '../../shared/capture-messages';
import { UPLOAD, prepareImageForUpload } from '@sploot/common';
import { enqueueCapturedSave } from './context-menu-save-queue';
import { showErrorNotification } from './notifications';

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
      outcome => sendResponse({ completed: outcome.ok }),
      (error) => {
        console.error('[Background][Screenshot] capture job failed unexpectedly', error);
        sendResponse({ completed: false });
      },
    );
    return true;
  });
}

export function captureAndSaveVisibleTab() {
  return (async () => {
    try {
      const prepared = await captureVisibleTabImage();
      await enqueueCapturedSave(prepared.blob, prepared.filename, `captured://${prepared.filename}`);
      return { ok: true, filename: prepared.filename, isDuplicate: false } as const;
    } catch (error) {
      const saveError = error instanceof Error ? error : new Error(CAPTURE_ERROR);
      showCaptureError(saveError);
      return { ok: false, error: saveError } as const;
    }
  })();
}

async function captureVisibleTabImage(): Promise<{ blob: Blob; filename: string }> {
  const [tab] = await withDeadline(chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  if (!tab || tab.windowId === undefined) {
    throw new Error('No active tab to screenshot.');
  }

  const tabUrl = ensureHttpTabUrl(tab.url);
  let dataUrl: string;
  try {
    dataUrl = await withDeadline(chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }));
  } catch (error) {
    console.warn('[Background][Screenshot] captureVisibleTab failed', error);
    throw new Error(CAPTURE_ERROR);
  }

  const capturedBlob = await withDeadline((async () => (await fetch(dataUrl)).blob())());
  const filename = screenshotFilename(tabUrl);
  const preparedImage = await withDeadline(prepareImageForUpload(new File([capturedBlob], filename, {
    type: capturedBlob.type || 'image/png',
    lastModified: Date.now(),
  })));
  if (preparedImage.file.size > UPLOAD.multipartSafeSize) {
    const sizeMB = (preparedImage.file.size / 1024 / 1024).toFixed(2);
    throw new Error(`Image too large after compression: ${sizeMB}MB`);
  }

  return { blob: preparedImage.file, filename: preparedImage.file.name };
}

function withDeadline<T>(promise: Promise<T>, timeoutMs = UPLOAD.timeout): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Screenshot capture timed out. Try again.')), timeoutMs);
    promise.then(value => {
      clearTimeout(timeoutId);
      resolve(value);
    }, error => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

function showCaptureError(error: Error): void {
  showErrorNotification(error.message === CAPTURE_ERROR || error.message.includes('captureVisibleTab')
    ? CAPTURE_ERROR
    : error.message);
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

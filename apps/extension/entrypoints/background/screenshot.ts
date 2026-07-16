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

export type ScreenshotFailureStage =
  | 'tab-query'
  | 'tab-validation'
  | 'capture-visible-tab'
  | 'decode-data-url'
  | 'prepare-image'
  | 'durable-enqueue'
  | 'unexpected';

export type ScreenshotFailureReason =
  | 'tab-query-failed'
  | 'no-active-http-tab'
  | 'capture-permission-denied'
  | 'capture-failed'
  | 'invalid-capture-data'
  | 'image-preparation-failed'
  | 'image-too-large'
  | 'queue-persistence-failed'
  | 'unexpected-failure';

class ScreenshotFailure extends Error {
  constructor(
    message: string,
    readonly stage: ScreenshotFailureStage,
    readonly reason: ScreenshotFailureReason,
  ) {
    super(message);
    this.name = 'ScreenshotFailure';
  }
}

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
      outcome => sendResponse(outcome.ok
        ? { completed: true }
        : { completed: false, stage: outcome.stage, reason: outcome.reason }),
      (error) => {
        console.error('[Background][Screenshot] capture job failed unexpectedly', error);
        sendResponse({ completed: false, stage: 'unexpected', reason: 'unexpected-failure' });
      },
    );
    return true;
  });
}

export function captureAndSaveVisibleTab() {
  return (async () => {
    try {
      const prepared = await captureVisibleTabImage();
      try {
        await enqueueCapturedSave(prepared.blob, prepared.filename, `captured://${prepared.filename}`);
      } catch (error) {
        throw new ScreenshotFailure(
          error instanceof Error ? error.message : 'Screenshot queue persistence failed.',
          'durable-enqueue',
          'queue-persistence-failed',
        );
      }
      return { ok: true, filename: prepared.filename, isDuplicate: false } as const;
    } catch (error) {
      const failure = error instanceof ScreenshotFailure
        ? error
        : new ScreenshotFailure(
          error instanceof Error ? error.message : CAPTURE_ERROR,
          'unexpected',
          'unexpected-failure',
        );
      const saveError = failure;
      showCaptureError(saveError);
      return { ok: false, error: saveError, stage: failure.stage, reason: failure.reason } as const;
    }
  })();
}

async function captureVisibleTabImage(): Promise<{ blob: Blob; filename: string }> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await withDeadline(chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  } catch (error) {
    throw new ScreenshotFailure(
      error instanceof Error ? error.message : 'Active tab query failed.',
      'tab-query',
      'tab-query-failed',
    );
  }
  const [tab] = tabs;
  if (!tab || tab.windowId === undefined) {
    throw new ScreenshotFailure('No active tab to screenshot.', 'tab-validation', 'no-active-http-tab');
  }

  let tabUrl: string;
  try {
    tabUrl = ensureHttpTabUrl(tab.url);
  } catch (error) {
    throw new ScreenshotFailure(
      error instanceof Error ? error.message : CAPTURE_ERROR,
      'tab-validation',
      'no-active-http-tab',
    );
  }
  let dataUrl: string;
  try {
    dataUrl = await withDeadline(chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }));
  } catch (error) {
    console.warn('[Background][Screenshot] captureVisibleTab failed', error);
    const permissionDenied = error instanceof Error && /permission|required|not allowed/i.test(error.message);
    throw new ScreenshotFailure(
      CAPTURE_ERROR,
      'capture-visible-tab',
      permissionDenied ? 'capture-permission-denied' : 'capture-failed',
    );
  }

  let capturedBlob: Blob;
  try {
    // captureVisibleTab returns a data URL. Decode that value in memory instead
    // of refetching it: data: fetches are not a reliable extension-worker seam
    // under MV3 CSP, and a failed refetch would drop the capture before the
    // durable queue can own its bytes.
    capturedBlob = await withDeadline(Promise.resolve().then(() => dataUrlToBlob(dataUrl)));
  } catch (error) {
    throw new ScreenshotFailure(
      error instanceof Error ? error.message : 'Chrome returned invalid screenshot data.',
      'decode-data-url',
      'invalid-capture-data',
    );
  }
  const filename = screenshotFilename(tabUrl);
  let preparedImage: Awaited<ReturnType<typeof prepareImageForUpload>>;
  try {
    preparedImage = await withDeadline(prepareImageForUpload(new File([capturedBlob], filename, {
      type: capturedBlob.type || 'image/png',
      lastModified: Date.now(),
    })));
  } catch (error) {
    throw new ScreenshotFailure(
      error instanceof Error ? error.message : 'Screenshot image preparation failed.',
      'prepare-image',
      'image-preparation-failed',
    );
  }
  if (preparedImage.file.size > UPLOAD.multipartSafeSize) {
    const sizeMB = (preparedImage.file.size / 1024 / 1024).toFixed(2);
    // A too-large capture is a known preparation outcome, not an unexpected
    // failure — report it with its own stage/reason so callers can be truthful.
    throw new ScreenshotFailure(
      `Image too large after compression: ${sizeMB}MB`,
      'prepare-image',
      'image-too-large',
    );
  }

  return { blob: preparedImage.file, filename: preparedImage.file.name };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error('Chrome returned an invalid screenshot. Try again.');
  }

  const mimeType = match[1] || 'application/octet-stream';
  const encoded = match[3];
  const binary = match[2]
    ? atob(encoded.replace(/\s/g, ''))
    : decodeURIComponent(encoded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
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

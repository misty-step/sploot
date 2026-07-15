/**
 * Image Fetcher
 *
 * Background-context image download with explicit deadlines at every async
 * boundary. A remote page must never hold the save worker indefinitely.
 */

import {
  UPLOAD,
  isCompressibleImageType,
  isValidMimeType,
  prepareImageForUpload,
} from '@sploot/common';

export async function fetchImage(url: string, signal?: AbortSignal): Promise<Blob> {
  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    throw new Error('Invalid image URL');
  }

  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new Error('Only HTTP/HTTPS URLs are supported');
  }

  try {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD.timeout);
    let response: Response;
    try {
      response = await withDeadline(fetch(url, {
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      }), 'Image fetch timed out');
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromCaller);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type')?.toLowerCase();
    if (!contentType || !isValidMimeType(contentType)) {
      throw new Error(`Invalid content type: ${contentType || 'unknown'}`);
    }

    signal?.throwIfAborted();
    const blob = await withDeadline(response.blob(), 'Image conversion timed out', signal);
    const typedBlob = isValidMimeType(blob.type)
      ? blob
      : new Blob([blob], { type: contentType || 'image/jpeg' });
    signal?.throwIfAborted();
    return await withDeadline(prepareFetchedImage(typedBlob), 'Image conversion timed out', signal);
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('too large')
      || error.message.includes('timed out')
      || error.name === 'AbortError'
      || error.message.startsWith('Invalid content type')
    )) {
      throw error;
    }

    // The fallback renders through an <img> element, which only exists in DOM
    // contexts. MV3 service workers have no Image constructor — surface the
    // real fetch failure instead of crashing on a ReferenceError.
    if (typeof Image === 'undefined') {
      throw error;
    }

    console.warn('[ImageFetcher] Fetch failed, trying bounded fallback:', error);
    return await fetchViaImageElement(url, signal);
  }
}

function fetchViaImageElement(url: string, signal?: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abort);
      callback();
    };

    const abort = () => finish(() => {
      img.src = '';
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });

    img.onload = () => {
      try {
        const canvas = new OffscreenCanvas(img.width, img.height);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Failed to get canvas context');
        }
        context.drawImage(img, 0, 0);
        canvas.convertToBlob({ type: 'image/webp', quality: UPLOAD.compressionQuality })
          .then(blob => withDeadline(prepareFetchedImage(blob), 'Image conversion timed out', signal))
      .then(blob => finish(() => resolve(blob)), error => finish(() => reject(error)));
      } catch (error) {
        finish(() => reject(error));
      }
    };

    img.onerror = () => finish(() => reject(new Error('Failed to load image')));
    img.src = url;
    timeoutId = setTimeout(() => finish(() => reject(new Error('Image load timeout'))), UPLOAD.timeout);
  });
}

function withDeadline<T>(promise: Promise<T>, message: string, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), UPLOAD.timeout);
    const abort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    promise.then(value => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abort);
      resolve(value);
    }, error => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abort);
      reject(error);
    });
  });
}

async function prepareFetchedImage(blob: Blob): Promise<Blob> {
  let uploadBlob = blob;

  if (blob.size > UPLOAD.compressionTargetSize && isCompressibleImageType(blob.type)) {
    const file = new File([blob], 'image-from-page', {
      type: blob.type,
      lastModified: Date.now(),
    });
    uploadBlob = (await prepareImageForUpload(file)).file;
  }

  if (uploadBlob.size > UPLOAD.multipartSafeSize) {
    const sizeMB = (uploadBlob.size / 1024 / 1024).toFixed(2);
    throw new Error(`Image too large after compression: ${sizeMB}MB`);
  }

  return uploadBlob;
}

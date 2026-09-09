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
  normalizeMimeType,
  prepareImageForUpload,
} from '@sploot/common';

export async function fetchImage(url: string, signal?: AbortSignal): Promise<Blob> {
  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    throw new Error('Invalid media URL');
  }
  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new Error('Only HTTP/HTTPS URLs are supported');
  }

  signal?.throwIfAborted();
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD.timeout);

  try {
    const response = await withDeadline(fetch(url, {
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    }), 'Media fetch timed out', signal);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = normalizeMimeType(response.headers.get('content-type') || '');
    if (!isValidMimeType(contentType)) {
      throw new Error(`Invalid content type: ${contentType || 'unknown'}. Share a direct image, GIF, MP4 or WebM file.`);
    }
    const blob = await withDeadline(response.blob(), 'Media download timed out', signal);
    signal?.throwIfAborted();
    const typedBlob = blob.type === contentType ? blob : blob.slice(0, blob.size, contentType);
    return await withDeadline(prepareFetchedImage(typedBlob), 'Media preparation timed out', signal);
  } finally {
    clearTimeout(timeoutId);
    controller.abort();
    signal?.removeEventListener('abort', abortFromCaller);
  }
}


function withDeadline<T>(promise: Promise<T>, message: string, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      reject(new Error(message));
    }, UPLOAD.timeout);
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
    throw new Error(`Media too large to capture: ${sizeMB}MB`);
  }

  return uploadBlob;
}

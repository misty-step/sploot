/**
 * Image Fetcher
 *
 * Handles CORS-aware image downloading from any website.
 * Background context has elevated permissions to bypass CORS.
 */

import { UPLOAD, isValidMimeType } from '@sploot/common';

/**
 * Fetch image from URL
 *
 * Background service worker context bypasses CORS via host_permissions.
 * Validates content type and size before returning blob.
 *
 * @throws Error if fetch fails, invalid content type, or exceeds size limit
 */
export async function fetchImage(url: string): Promise<Blob> {
  // Validate URL
  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch (error) {
    console.error('[ImageFetcher] Invalid URL', { url, error });
    throw new Error('Invalid image URL');
  }

  // Only allow HTTP(S) protocols
  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    console.warn('[ImageFetcher] Unsupported protocol', {
      url,
      protocol: urlObj.protocol,
    });
    throw new Error('Only HTTP/HTTPS URLs are supported');
  }

  try {
    console.log('[ImageFetcher] Fetching image', { url });
    // Fetch image using background context (bypasses CORS)
    const response = await fetch(url, {
      credentials: 'omit', // Don't send cookies (privacy)
      cache: 'no-store', // Fresh fetch each time
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Validate content type
    const contentType = response.headers.get('content-type')?.toLowerCase();
    if (!contentType || !isValidMimeType(contentType)) {
      console.warn('[ImageFetcher] Invalid content type', {
        url,
        contentType,
      });
      throw new Error(`Invalid content type: ${contentType || 'unknown'}`);
    }

    // Get blob
    const blob = await response.blob();

    // Validate size
    if (blob.size > UPLOAD.maxSize) {
      const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
      console.warn('[ImageFetcher] Image too large', { url, sizeMB });
      throw new Error(`Image too large: ${sizeMB}MB (max ${UPLOAD.maxSizeMB}MB)`);
    }

    // Ensure blob has correct MIME type
    if (!isValidMimeType(blob.type)) {
      // Try to infer from content-type header
      const inferredType = contentType || 'image/jpeg';
      return new Blob([blob], { type: inferredType });
    }

    return blob;
  } catch (error) {
    // If fetch fails, try fallback method using image element
    console.warn('[ImageFetcher] Fetch failed, trying fallback:', error);
    return await fetchViaImageElement(url);
  }
}

/**
 * Fallback: Fetch image via Image element + canvas
 *
 * Used when direct fetch fails (some sites block fetch but allow img tags)
 */
async function fetchViaImageElement(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    console.log('[ImageFetcher] Fallback via Image element', { url });
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Try to request CORS

    img.onload = () => {
      try {
        // Create canvas and draw image
        const canvas = new OffscreenCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        ctx.drawImage(img, 0, 0);

        // Convert to blob
        canvas
          .convertToBlob({ type: 'image/png', quality: 0.95 })
          .then(blob => {
            // Validate size
            if (blob.size > UPLOAD.maxSize) {
              const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
              reject(new Error(`Image too large: ${sizeMB}MB (max ${UPLOAD.maxSizeMB}MB)`));
              return;
            }

            resolve(blob);
          })
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      console.error('[ImageFetcher] Fallback image load failed', { url });
      reject(new Error('Failed to load image'));
    };

    // Set src to trigger load
    img.src = url;

    // Timeout using shared constant
    setTimeout(() => {
      reject(new Error('Image load timeout'));
    }, UPLOAD.timeout);
  });
}

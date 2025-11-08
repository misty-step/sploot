/**
 * API Client
 *
 * Simple interface for uploading images to Sploot API.
 * Hides FormData construction, auth headers, error handling.
 */

import { getAuthToken } from '../entrypoints/background/auth-manager';

const API_BASE_URL = 'https://sploot.app';
const UPLOAD_TIMEOUT_MS = 10000; // 10 seconds

export interface UploadResult {
  assetId: string;
  blobUrl: string;
  thumbnailUrl: string;
}

/**
 * Upload image to Sploot
 *
 * Calls existing /api/upload endpoint with multipart form data.
 * Includes auth token and source metadata.
 *
 * @throws Error if upload fails or auth required
 */
export async function uploadImage(
  blob: Blob,
  filename?: string
): Promise<UploadResult> {
  // Get auth token
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  // Create FormData
  const formData = new FormData();
  const file = new File([blob], filename || 'image.jpg', {
    type: blob.type || 'image/jpeg',
  });
  formData.append('file', file);

  // Add metadata (source tracking)
  formData.append(
    'metadata',
    JSON.stringify({
      source: 'chrome-extension',
    })
  );

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Handle specific error codes
      if (response.status === 401) {
        throw new Error('Session expired. Please login again.');
      }

      if (response.status === 413) {
        throw new Error('Image too large (max 10MB)');
      }

      if (response.status === 429) {
        throw new Error('Too many uploads. Please try again later.');
      }

      // Try to parse error message from server
      let errorMessage = `Upload failed: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Ignore JSON parse errors
      }

      throw new Error(errorMessage);
    }

    // Parse successful response
    const data = await response.json();

    return {
      assetId: data.id || data.assetId,
      blobUrl: data.blobUrl,
      thumbnailUrl: data.thumbnailUrl || data.blobUrl,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle network errors
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Upload timeout. Please try again.');
      }

      // Re-throw with context
      throw error;
    }

    throw new Error('Upload failed. Please try again.');
  }
}

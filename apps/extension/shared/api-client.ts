/**
 * API Client
 *
 * Simple interface for uploading images to Sploot API.
 * Hides FormData construction, auth headers, error handling.
 */

import {
  UPLOAD,
  type SplootApiError,
  type SplootApiErrorCode,
  type SplootApiUploadResponse,
} from '@sploot/common';
import { getAuthToken } from '../entrypoints/background/auth-manager';
import { assertExtensionConfig, CLERK_ENVIRONMENT, SPLOOT_API_BASE_URL } from './env';
import { toUploadResult, type UploadResult } from './upload-response';

const API_BASE_URL = SPLOOT_API_BASE_URL;

console.log('[ApiClient] Initialized', {
  apiBaseUrl: API_BASE_URL,
  environment: CLERK_ENVIRONMENT,
});

export interface AuthTokenProvider {
  getToken(): Promise<string | null>;
}

const clerkAuthTokenProvider: AuthTokenProvider = {
  getToken: getAuthToken,
};

export class SplootApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: SplootApiErrorCode,
    public readonly retryable: boolean = false,
    public readonly actionHref?: string
  ) {
    super(message);
    this.name = 'SplootApiClientError';
  }
}

export class SplootApiClient {
  constructor(private readonly authTokenProvider: AuthTokenProvider = clerkAuthTokenProvider) {}

  async uploadImage(
    blob: Blob,
    filename?: string
  ): Promise<UploadResult> {
    return uploadImageWithTokenProvider(this.authTokenProvider, blob, filename);
  }
}

export function createSplootApiClient(authTokenProvider?: AuthTokenProvider): SplootApiClient {
  return new SplootApiClient(authTokenProvider);
}

async function parseErrorResponse(
  response: Response,
  parsedErrorData?: Partial<SplootApiError> | null
): Promise<SplootApiClientError> {
  let errorData: Partial<SplootApiError> | null = parsedErrorData ?? null;
  if (parsedErrorData === undefined) {
    try {
      errorData = (await response.json()) as SplootApiError;
    } catch {
      errorData = null;
    }
  }

  if (errorData?.code === 'quota_exceeded') {
    return new SplootApiClientError(
      'Storage quota exceeded. Open Sploot settings to manage storage.',
      response.status,
      errorData.code,
      false,
      errorData.action?.href
    );
  }

  if (errorData?.code === 'uploads_disabled') {
    return new SplootApiClientError(
      'Uploads are temporarily paused. Please try again later.',
      response.status,
      errorData.code,
      true
    );
  }

  if (response.status === 401) {
    return new SplootApiClientError('Session expired. Please login again.', response.status, 'unauthorized');
  }

  if (response.status === 413) {
    return new SplootApiClientError('Image too large after compression.', response.status, 'invalid_upload');
  }

  if (response.status === 429) {
    return new SplootApiClientError('Too many uploads. Please try again later.', response.status, 'rate_limited', true);
  }

  return new SplootApiClientError(
    errorData?.error || `Upload failed: ${response.status}`,
    response.status,
    errorData?.code,
    errorData?.retryable ?? response.status >= 500,
    errorData?.action?.href
  );
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
  return uploadImageWithTokenProvider(clerkAuthTokenProvider, blob, filename);
}

async function uploadImageWithTokenProvider(
  authTokenProvider: AuthTokenProvider,
  blob: Blob,
  filename?: string
): Promise<UploadResult> {
  assertExtensionConfig();

  // Get auth token
  const token = await authTokenProvider.getToken();
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
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD.timeout);

  try {
    console.log('[ApiClient] Upload starting', {
      filename: file.name,
      size: file.size,
      apiBaseUrl: API_BASE_URL,
    });

    const response = await fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = (await response.json()) as SplootApiUploadResponse;

    if (response.status === 409 && data.success && data.asset && data.isDuplicate) {
      const uploadResult = toUploadResult(data);
      console.log('[ApiClient] Duplicate upload', {
        assetId: uploadResult.assetId,
        blobUrl: uploadResult.blobUrl,
      });
      return uploadResult;
    }

    if (!response.ok) {
      throw await parseErrorResponse(response, data);
    }

    // Parse successful response
    const uploadResult = toUploadResult(data);

    console.log('[ApiClient] Upload success', {
      assetId: uploadResult.assetId,
      blobUrl: uploadResult.blobUrl,
    });

    return uploadResult;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle network errors
    if (error instanceof Error) {
      console.error('[ApiClient] Upload failed', {
        message: error.message,
        name: error.name,
      });
      if (error.name === 'AbortError') {
        throw new Error('Upload timeout. Please try again.');
      }

      // Re-throw with context
      throw error;
    }

    throw new Error('Upload failed. Please try again.');
  }
}

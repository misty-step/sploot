/**
 * API Client
 *
 * Simple interface for uploading images to Sploot API.
 * Hides FormData construction, auth headers, error handling.
 */

import {
  UPLOAD,
  normalizeMimeType,
  type SplootApiError,
  type SplootApiErrorCode,
  type SplootApiUploadResponse,
} from '@sploot/common';
import { getAuthToken, invalidateAuthToken } from '../entrypoints/background/auth-manager';
import { getInstanceUrl } from './env';
import { toUploadResult, type UploadResult } from './upload-response';


export interface AuthTokenProvider {
  getToken(signal?: AbortSignal, instanceUrl?: string): Promise<string | null>;
}

const deviceAuthTokenProvider: AuthTokenProvider = {
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
  constructor(private readonly authTokenProvider: AuthTokenProvider = deviceAuthTokenProvider) {}

  async uploadImage(
    blob: Blob,
    filename?: string,
    signal?: AbortSignal,
    idempotencyKey?: string,
  ): Promise<UploadResult> {
    return uploadImageWithTokenProvider(this.authTokenProvider, blob, filename, signal, idempotencyKey);
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

  if (errorData?.code === 'quota_exceeded'
    || errorData?.code === 'storage_limit_exceeded'
    || errorData?.code === 'storage_reserve_exceeded') {
    return new SplootApiClientError(
      'Storage is full. Open Sploot settings to manage storage.',
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
    return new SplootApiClientError(
      'Session expired. Please login again.',
      response.status,
      'unauthorized',
      false,
      '/sign-in'
    );
  }

  if (response.status === 413) {
    return new SplootApiClientError('Media exceeds the upload size limit.', response.status, 'invalid_upload');
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
  filename?: string,
  authTokenProvider: AuthTokenProvider = deviceAuthTokenProvider,
  signal?: AbortSignal,
  idempotencyKey?: string,
): Promise<UploadResult> {
  return uploadImageWithTokenProvider(authTokenProvider, blob, filename, signal, idempotencyKey);
}

async function uploadImageWithTokenProvider(
  authTokenProvider: AuthTokenProvider,
  blob: Blob,
  filename?: string,
  signal?: AbortSignal,
  idempotencyKey?: string,
): Promise<UploadResult> {
  const instanceUrl = await getInstanceUrl();
  const token = await authTokenProvider.getToken(signal, instanceUrl);
  if (!token) {
    throw new Error('Authentication required');
  }

  // Create FormData
  const formData = new FormData();
  const mime = normalizeMimeType(blob.type || 'image/jpeg');
  const extension = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1];
  const name = filename || 'media';
  const uploadFilename = name.toLowerCase().endsWith(`.${extension}`)
    || (mime === 'image/jpeg' && name.toLowerCase().endsWith('.jpeg'))
    ? name
    : `${name.replace(/\.[^./\\]+$/, '')}.${extension}`;
  const file = new File([blob], uploadFilename, {
    type: mime,
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
  const abortUpload = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    abortUpload();
  } else {
    signal?.addEventListener('abort', abortUpload, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD.timeout);

  try {
    console.log('[ApiClient] Upload starting', {
      filename: file.name,
      size: file.size,
      apiBaseUrl: instanceUrl,
    });

    const response = await fetch(`${instanceUrl}/api/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: formData,
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
    });

    if (response.status === 401) await invalidateAuthToken(token, instanceUrl);

    let data: SplootApiUploadResponse | null;
    try {
      data = await response.json() as SplootApiUploadResponse;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if (!response.ok) throw await parseErrorResponse(response, null);
      throw new SplootApiClientError(
        'Sploot did not return a save receipt. Check your library before retrying.',
        response.status,
      );
    }

    if (response.status === 409 && data?.success === true && data.asset && data.isDuplicate === true) {
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

    if (!data) {
      throw new SplootApiClientError(
        'Sploot did not return a save receipt. Check your library before retrying.',
        response.status,
      );
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
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortUpload);
  }
}

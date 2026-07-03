/**
 * Shared API types
 *
 * These types define the contract between the web API and clients (extension, mobile).
 * Internal types (database models, Vercel Blob responses) stay in their respective apps.
 */

export type SplootApiErrorCode =
  | 'unauthorized'
  | 'quota_exceeded'
  | 'uploads_disabled'
  | 'embeddings_disabled'
  | 'invalid_upload'
  | 'rate_limited'
  | 'server_error';

export type SplootApiErrorActionType =
  | 'manage_storage'
  | 'try_later'
  | 'retry'
  | 'sign_in'
  | 'contact_support';

export interface SplootApiErrorAction {
  type: SplootApiErrorActionType;
  label: string;
  href?: string;
}

export interface StorageQuotaSnapshot {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  reservedBytes?: number;
  incomingBytes?: number;
}

/**
 * Response from POST /api/upload
 *
 * This is the public API contract that clients depend on.
 */
export interface SplootApiUploadResponse {
  success: boolean;
  asset?: {
    id: string;
    blobUrl: string;
    pathname: string;
    filename: string;
    mimeType: string;
    size: number;
    checksum: string;
    phash?: string | null;
    nearDuplicate?: {
      id: string;
      blobUrl: string;
      thumbnailUrl?: string | null;
      pathname: string;
      mime: string;
      phash: string;
      distance: number;
      createdAt: string;
    } | null;
    createdAt: string;
    needsEmbedding?: boolean;
  };
  message?: string;
  error?: string;
  code?: SplootApiErrorCode;
  retryable?: boolean;
  action?: SplootApiErrorAction;
  quota?: StorageQuotaSnapshot;
  isDuplicate?: boolean;
}

/**
 * Standard error response from Sploot API
 */
export interface SplootApiError {
  error: string;
  code?: SplootApiErrorCode;
  retryable?: boolean;
  action?: SplootApiErrorAction;
  quota?: StorageQuotaSnapshot;
}

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
  | 'invalid_embedding'
  | 'invalid_search_parameter'
  | 'invalid_upload'
  | 'rate_limited'
  | 'server_error';

export type SplootApiEmbeddingReadiness =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'unavailable';

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

/** Minimal published asset fields shared by token-scoped clients. */
export interface SplootApiPublicAssetDto {
  id: string;
  blobUrl: string;
  thumbnailUrl: string | null;
}

/** Minimal published search result fields emitted by the token-scoped search endpoint and cache. */
export interface SplootApiSearchResultDto extends SplootApiPublicAssetDto {
  similarity: number;
  relevance: number;
  belowThreshold?: boolean;
}

export interface SplootApiSearchResponse {
  results: SplootApiSearchResultDto[];
  query: string;
  total: number;
  limit: number;
  requestedLimit: number;
  threshold: number;
  requestedThreshold: number;
  processingTime: number;
  cached?: boolean;
  thresholdFallback?: boolean;
}

/** Minimal published upload asset fields. */
export interface SplootApiUploadAsset {
  id: string;
  blobUrl: string;
  thumbnailUrl: string | null;
}

export interface SplootApiUploadSuccessResponse {
  success: true;
  asset: SplootApiUploadAsset;
  message: string;
  isDuplicate: boolean;
}

export interface SplootApiUploadErrorResponse {
  success?: false;
  error: string;
  code?: SplootApiErrorCode;
  retryable?: boolean;
  action?: SplootApiErrorAction;
  quota?: StorageQuotaSnapshot;
  details?: string;
}

/**
 * Response from POST /api/upload
 *
 * This is the public API contract that clients depend on.
 */
export type SplootApiUploadResponse =
  | SplootApiUploadSuccessResponse
  | SplootApiUploadErrorResponse;

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

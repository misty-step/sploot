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
  | 'enrollment_closed'
  | 'enrollment_unavailable'
  | 'enrollment_identity_conflict'
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
 * - 'open': a valid capped/GA policy verified live capacity.
 * - 'paused': policy deliberately refuses new accounts (closed mode, cap
 *   reached, or the invalid-configuration fail-safe).
 * - 'unknown': a valid capped/GA policy could not reach its database, so the
 *   truthful public claim is "cannot confirm", never an ordinary pause.
 */
export type SplootEnrollmentPublicStatus = 'open' | 'paused' | 'unknown';

export interface SplootEnrollmentPublicState {
  status: SplootEnrollmentPublicStatus;
  mode: 'capped' | 'ga' | 'closed';
  configuration: 'valid' | 'invalid';
}

export function isSplootEnrollmentPublicState(value: unknown): value is SplootEnrollmentPublicState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const shapeIsValid = (
    (candidate.status === 'open' || candidate.status === 'paused' || candidate.status === 'unknown') &&
    (candidate.mode === 'capped' || candidate.mode === 'ga' || candidate.mode === 'closed') &&
    (candidate.configuration === 'valid' || candidate.configuration === 'invalid') &&
    Object.keys(candidate).length === 3
  );

  if (!shapeIsValid) return false;

  // Public state is a projection, not a bag of independent flags. Invalid
  // configuration is always the canonical closed/paused fail-safe; an open
  // state can only come from a valid capped or GA policy, and unknown exists
  // only where a valid capped/GA policy actually needed the database.
  if (candidate.configuration === 'invalid') {
    return candidate.status === 'paused' && candidate.mode === 'closed';
  }

  if (candidate.mode === 'closed') return candidate.status === 'paused';
  if (candidate.status === 'open' || candidate.status === 'unknown') {
    return candidate.mode === 'capped' || candidate.mode === 'ga';
  }
  return true;
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

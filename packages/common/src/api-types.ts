/** Node-safe public API DTO types and strict parsers shared by all clients. */
import type {
  SplootApiErrorAction,
  SplootApiErrorCode,
  SplootApiSearchResponse,
  SplootApiSearchResultDto,
  SplootApiUploadErrorResponse,
  SplootApiUploadResponse,
  SplootApiUploadSuccessResponse,
  StorageQuotaSnapshot,
} from './types.js';

export type {
  SplootApiEmbeddingReadiness,
  SplootApiPublicAssetDto,
  SplootApiSearchResponse,
  SplootApiSearchResultDto,
  SplootApiUploadErrorResponse,
  SplootApiUploadAsset,
  SplootApiUploadResponse,
  SplootApiUploadSuccessResponse,
} from './types.js';

type UnknownRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasExactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonnegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isSafeNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isErrorCode(value: unknown): value is SplootApiErrorCode {
  return typeof value === 'string' && [
    'unauthorized', 'quota_exceeded', 'uploads_disabled', 'embeddings_disabled',
    'invalid_embedding', 'invalid_search_parameter', 'invalid_upload',
    'rate_limited', 'server_error',
  ].includes(value);
}

function isErrorAction(value: unknown): value is SplootApiErrorAction {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['type', 'label'], ['href'])) return false;
  return typeof value.type === 'string' &&
    ['manage_storage', 'try_later', 'retry', 'sign_in', 'contact_support'].includes(value.type) &&
    typeof value.label === 'string' &&
    (value.href === undefined || typeof value.href === 'string');
}

function isQuotaSnapshot(value: unknown): value is StorageQuotaSnapshot {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['usedBytes', 'limitBytes', 'remainingBytes'], ['reservedBytes', 'incomingBytes'])) {
    return false;
  }
  return isSafeNonnegativeInteger(value.usedBytes) &&
    isSafeNonnegativeInteger(value.limitBytes) &&
    isSafeNonnegativeInteger(value.remainingBytes) &&
    (value.reservedBytes === undefined || isSafeNonnegativeInteger(value.reservedBytes)) &&
    (value.incomingBytes === undefined || isSafeNonnegativeInteger(value.incomingBytes));
}

function isUploadAsset(value: unknown): value is SplootApiUploadSuccessResponse['asset'] {
  return isPlainRecord(value) &&
    hasExactKeys(value, ['id', 'blobUrl', 'thumbnailUrl']) &&
    typeof value.id === 'string' &&
    typeof value.blobUrl === 'string' &&
    (value.thumbnailUrl === null || typeof value.thumbnailUrl === 'string');
}

function isUploadError(value: unknown): value is SplootApiUploadErrorResponse {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['error'], ['success', 'code', 'retryable', 'action', 'quota', 'details'])) {
    return false;
  }
  return typeof value.error === 'string' &&
    (value.success === undefined || value.success === false) &&
    (value.code === undefined || isErrorCode(value.code)) &&
    (value.retryable === undefined || typeof value.retryable === 'boolean') &&
    (value.action === undefined || isErrorAction(value.action)) &&
    (value.quota === undefined || isQuotaSnapshot(value.quota)) &&
    (value.details === undefined || typeof value.details === 'string');
}

function isSearchResult(value: unknown): value is SplootApiSearchResultDto {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['id', 'blobUrl', 'thumbnailUrl', 'similarity', 'relevance'], ['belowThreshold'])) {
    return false;
  }
  return typeof value.id === 'string' &&
    typeof value.blobUrl === 'string' &&
    (value.thumbnailUrl === null || typeof value.thumbnailUrl === 'string') &&
    isNonnegativeFiniteNumber(value.similarity) && value.similarity <= 1 &&
    isNonnegativeFiniteNumber(value.relevance) && value.relevance <= 100 &&
    (value.belowThreshold === undefined || typeof value.belowThreshold === 'boolean');
}

/** Parse the published upload response without coercion or unknown-key tolerance. */
export function parseSplootApiUploadResponse(value: unknown): SplootApiUploadResponse | null {
  if (!isPlainRecord(value)) return null;
  if (value.success === true) {
    if (!hasExactKeys(value, ['success', 'isDuplicate', 'asset', 'message']) ||
        typeof value.isDuplicate !== 'boolean' ||
        !isUploadAsset(value.asset) ||
        typeof value.message !== 'string') return null;
    return value as unknown as SplootApiUploadSuccessResponse;
  }
  return isUploadError(value) ? value : null;
}

/** Parse the published search response at the client/cache boundary. */
export function parseSplootApiSearchResponse(value: unknown): SplootApiSearchResponse | null {
  if (!isPlainRecord(value) || !hasExactKeys(value,
    ['results', 'query', 'total', 'limit', 'requestedLimit', 'threshold', 'requestedThreshold', 'processingTime'],
    ['cached', 'thresholdFallback'])) return null;
  if (!Array.isArray(value.results) || typeof value.query !== 'string' ||
      !isSafeNonnegativeInteger(value.total) ||
      !isSafeNonnegativeInteger(value.limit) ||
      !isSafeNonnegativeInteger(value.requestedLimit) || value.limit > value.requestedLimit ||
      value.results.length > value.limit || value.results.length > value.total ||
      !isFiniteNumber(value.threshold) || value.threshold < 0 || value.threshold > 1 ||
      !isFiniteNumber(value.requestedThreshold) || value.requestedThreshold < 0 || value.requestedThreshold > 1 ||
      !isNonnegativeFiniteNumber(value.processingTime) ||
      (value.cached !== undefined && typeof value.cached !== 'boolean') ||
      (value.thresholdFallback !== undefined && typeof value.thresholdFallback !== 'boolean') ||
      !value.results.every(isSearchResult)) return null;
  return value as unknown as SplootApiSearchResponse;
}

/** Parse only the stable error branch of the published upload contract. */
export function parseSplootApiUploadErrorResponse(value: unknown): SplootApiUploadErrorResponse | null {
  return isUploadError(value) ? value : null;
}

/** Build a search result with the one canonical score normalization rule. */
export function createSplootApiSearchResult(input: {
  id: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  similarity: number;
  relevance?: number;
  belowThreshold?: boolean;
}): SplootApiSearchResultDto {
  const similarity = isFiniteNumber(input.similarity)
    ? Math.min(1, Math.max(0, input.similarity))
    : 0;
  const relevance = isFiniteNumber(input.relevance)
    ? Math.min(100, Math.max(0, input.relevance))
    : Math.round(similarity * 100);
  return {
    id: input.id,
    blobUrl: input.blobUrl,
    thumbnailUrl: input.thumbnailUrl,
    similarity,
    relevance,
    ...(input.belowThreshold === undefined ? {} : { belowThreshold: input.belowThreshold }),
  };
}

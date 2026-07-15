import type {
  AssetEmbedding,
  AssetGridBaseDto,
  AssetGridCamelSource,
  AssetGridClientDto,
  AssetGridDtoExtensions,
  AssetGridEmbeddingSource,
  AssetGridSnakeSource,
  AssetUploadClientDto,
  AssetUploadDtoExtension,
  AssetTag,
  PublicAssetDto,
  PublicSearchResultDto,
} from '@/lib/types/asset-grid';
import type { SplootApiSearchResultDto } from '@sploot/common';

export interface AssetGridDtoOptions extends AssetGridDtoExtensions {
  filename?: string;
  includeThumbnailUrl?: boolean;
  includeUpdatedAt?: boolean;
  embedding?: AssetEmbedding | null;
  embeddingStatus?: string;
  upload?: AssetUploadDtoExtension;
}

export interface PublicAssetDtoOptions {
  filename?: string;
  embeddingStatus?: string | null;
  tags?: AssetTag[];
  similarity?: {
    similarity: number;
    relevance: number;
    belowThreshold?: boolean;
  };
}

export function normalizeSimilarityScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeRelevanceScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

type AssetGridSource = AssetGridCamelSource | AssetGridSnakeSource;

/** Public route mapper. It intentionally never reads or emits embedding rows. */
export function normalizeAssetToPublicDto(
  row: AssetGridSource,
  options: PublicAssetDtoOptions & { similarity: NonNullable<PublicAssetDtoOptions['similarity']> },
): PublicSearchResultDto;
export function normalizeAssetToPublicDto(
  row: AssetGridSource,
  options?: PublicAssetDtoOptions,
): PublicAssetDto;
export function normalizeAssetToPublicDto(
  row: AssetGridSource,
  options: PublicAssetDtoOptions = {},
): PublicAssetDto | PublicSearchResultDto {
  const snake = isSnakeSource(row);
  const pathname = row.pathname;
  const filename = options.filename ?? row.filename ?? pathname.split('/').pop() ?? pathname;
  const createdAt = snake ? row.created_at : row.createdAt;
  const status = options.embeddingStatus;
  const dto: PublicAssetDto = {
    id: row.id,
    blobUrl: snake ? row.blob_url : row.blobUrl,
    thumbnailUrl: snake
      ? row.thumbnail_url ?? null
      : row.thumbnailUrl ?? null,
    pathname,
    filename,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    favorite: row.favorite,
    createdAt: toJsonDate(createdAt),
    tags: options.tags ?? [],
    ...(status && ['pending', 'processing', 'ready', 'failed', 'unavailable'].includes(status)
      ? { embeddingStatus: status as PublicAssetDto['embeddingStatus'] }
      : {}),
  };

  if (options.similarity) {
    return {
      ...dto,
      similarity: normalizeSimilarityScore(options.similarity.similarity),
      relevance: normalizeRelevanceScore(options.similarity.relevance),
      ...(options.similarity.belowThreshold === undefined
        ? {}
        : { belowThreshold: options.similarity.belowThreshold }),
    };
  }

  return dto;
}

type MutableAssetGridDto = AssetGridBaseDto & {
  embedding?: AssetEmbedding | null;
};

function toJsonDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isSnakeSource(row: AssetGridSource): row is AssetGridSnakeSource {
  return 'blob_url' in row;
}

function createEmbedding(
  row: AssetGridCamelSource,
  source: AssetGridEmbeddingSource,
): AssetEmbedding {
  const assetId = source.assetId ?? row.id;
  const createdAt = source.createdAt;
  const modelName = source.modelName;
  const modelVersion = source.modelVersion;

  if (
    modelName !== null &&
    modelName !== undefined &&
    modelVersion !== null &&
    modelVersion !== undefined &&
    createdAt !== null &&
    createdAt !== undefined
  ) {
    if (
      typeof source.dim === 'number' &&
      source.status !== undefined &&
      source.error !== undefined &&
      source.completedAt !== undefined &&
      source.updatedAt !== undefined &&
      source.updatedAt !== null
    ) {
      return {
        assetId,
        modelName,
        modelVersion,
        createdAt,
        status: source.status,
        updatedAt: source.updatedAt,
        dim: source.dim,
        error: source.error,
        completedAt: source.completedAt,
      };
    }

    return {
      assetId,
      modelName,
      modelVersion,
      createdAt,
      ...(source.status !== undefined ? { status: source.status } : {}),
      ...(source.updatedAt !== undefined && source.updatedAt !== null
        ? { updatedAt: source.updatedAt }
        : {}),
    };
  }

  return { assetId };
}

function normalizeEmbedding(
  row: AssetGridSource,
  options: AssetGridDtoOptions,
): AssetEmbedding | null | undefined {
  if (options.embedding !== undefined) {
    return options.embedding;
  }

  if (isSnakeSource(row)) {
    return undefined;
  }

  if (row.embedding) {
    return createEmbedding(row, row.embedding);
  }

  if (row.embeddingId) {
    return createEmbedding(row, {
      assetId: row.embeddingId,
      modelName: row.embeddingModelName,
      modelVersion: row.embeddingModelVersion,
      status: row.embeddingStatus,
      createdAt: row.embeddingCreatedAt,
    });
  }

  return undefined;
}

export function normalizeAssetToGridDto(
  row: AssetGridSource,
  options: AssetGridDtoOptions & { upload: AssetUploadDtoExtension },
): AssetUploadClientDto;
export function normalizeAssetToGridDto(
  row: AssetGridSource,
  options?: AssetGridDtoOptions,
): AssetGridClientDto;
export function normalizeAssetToGridDto(
  row: AssetGridSource,
  options: AssetGridDtoOptions = {},
): AssetGridClientDto | AssetUploadClientDto {

  const snake = isSnakeSource(row);
  const pathname = row.pathname;
  const filename = options.filename ?? row.filename ?? pathname.split('/').pop() ?? pathname;
  const embedding = options.embedding;
  const embeddingStatus = options.embeddingStatus ?? (!snake
    ? row.embeddingStatus ?? undefined
    : undefined);

  const dto: MutableAssetGridDto = {
    id: row.id,
    blobUrl: snake ? row.blob_url : row.blobUrl,
    pathname,
    filename,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    favorite: row.favorite,
    createdAt: toJsonDate(snake ? row.created_at : row.createdAt),
  };

  if (!snake && options.includeThumbnailUrl !== false) {
    dto.thumbnailUrl = row.thumbnailUrl ?? null;
  }

  if (snake && options.includeThumbnailUrl !== false) {
    dto.thumbnailUrl = row.thumbnail_url ?? null;
  }

  if (!snake && options.includeUpdatedAt && row.updatedAt !== undefined) {
    dto.updatedAt = toJsonDate(row.updatedAt);
  }

  if (snake && options.includeUpdatedAt && row.updated_at !== undefined) {
    dto.updatedAt = toJsonDate(row.updated_at);
  }

  if (embedding !== undefined) {
    dto.embedding = embedding;
  }

  if (embeddingStatus !== undefined && embeddingStatus !== null && embeddingStatus !== '') {
    dto.embeddingStatus = embeddingStatus;
  }

  if (options.similarity) {
    Object.assign(dto, options.similarity);
  }

  if (options.tasteScore) {
    Object.assign(dto, options.tasteScore);
  }

  if (options.tags) {
    Object.assign(dto, options.tags);
  }

  if (options.upload) {
    const uploadDto: AssetUploadClientDto = {
      ...dto,
      ...(options.upload.embedding !== undefined
        ? { embedding: options.upload.embedding }
        : {}),
      ...(options.upload.embeddingStatus !== undefined
        ? { embeddingStatus: options.upload.embeddingStatus }
        : {}),
      ...(options.upload.embeddingError !== undefined
        ? { embeddingError: options.upload.embeddingError }
        : {}),
      ...(options.upload.tags !== undefined ? { tags: options.upload.tags } : {}),
    };
    return uploadDto;
  }

  return dto;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);

  if (keys.length < required.length) return false;
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return false;
  }

  return keys.every((key) => allowed.has(key));
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  return new Date(value).toISOString() === value;
}

function isNonnegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

interface CachedSearchResult extends SplootApiSearchResultDto {}

function isCachedSearchResult(value: unknown): value is CachedSearchResult {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(
      value,
      [
        'id',
        'blobUrl',
        'thumbnailUrl',
        'similarity',
        'relevance',
      ],
      ['belowThreshold'],
    )
  ) {
    return false;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.blobUrl !== 'string' ||
    (value.thumbnailUrl !== null && typeof value.thumbnailUrl !== 'string') ||
    !isNonnegativeFiniteNumber(value.similarity) ||
    value.similarity > 1 ||
    !isNonnegativeFiniteNumber(value.relevance) ||
    value.relevance > 100
  ) {
    return false;
  }

  if ('belowThreshold' in value && typeof value.belowThreshold !== 'boolean') {
    return false;
  }

  return true;
}

/** Validate and re-normalize untrusted cached search rows at the route boundary. */
export function normalizeCachedGridResults(value: unknown): SplootApiSearchResultDto[] | null {
  if (!Array.isArray(value)) return null;

  const normalized: SplootApiSearchResultDto[] = [];
  for (const candidate of value) {
    if (!isCachedSearchResult(candidate)) {
      return null;
    }

    normalized.push({
      id: candidate.id,
      blobUrl: candidate.blobUrl,
      thumbnailUrl: candidate.thumbnailUrl,
      similarity: candidate.similarity,
      relevance: candidate.relevance,
      ...(typeof candidate.belowThreshold === 'boolean'
        ? { belowThreshold: candidate.belowThreshold }
        : {}),
    });
  }

  return normalized;
}

/** Validate the complete cached page envelope before a route can use it. */
export function normalizeCachedSearchPage(value: unknown): {
  results: SplootApiSearchResultDto[];
  total: number;
  seed: number | null;
} | null {
  if (!isRecord(value) || !hasExactKeys(value, ['results', 'total', 'seed'])) return null;
  const total = value.total;
  const seed = value.seed;
  if (!isNonnegativeSafeInteger(total)) return null;
  if (seed !== null && (!isNonnegativeSafeInteger(seed) || seed > 1_000_000)) {
    return null;
  }
  const results = normalizeCachedGridResults(value.results);
  if (!results || results.length > total) return null;
  return { results, total, seed: seed as number | null };
}

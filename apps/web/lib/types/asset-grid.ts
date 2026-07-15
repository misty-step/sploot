import type {
  SplootApiErrorAction,
  SplootApiErrorCode,
  SplootApiEmbeddingReadiness,
  StorageQuotaSnapshot,
  SplootApiSearchResultDto,
} from '@sploot/common';

export type EmbeddingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'unavailable';
export type PublicEmbeddingStatus = SplootApiEmbeddingReadiness;

export interface AssetTag {
  id: string;
  name: string;
}

export interface AssetEmbeddingReference {
  assetId: string;
}

export interface AssetEmbeddingSummary extends AssetEmbeddingReference {
  modelName: string;
  modelVersion: string;
  createdAt: Date | string;
  status?: string | null;
  updatedAt?: Date | string;
}

export interface AssetEmbeddingFull extends AssetEmbeddingSummary {
  dim: number;
  status: string | null;
  error: string | null;
  completedAt: Date | string | null;
  updatedAt: Date | string;
}

export type AssetEmbedding =
  | AssetEmbeddingReference
  | AssetEmbeddingSummary
  | AssetEmbeddingFull;

export interface AssetGridBaseDto {
  id: string;
  blobUrl: string;
  thumbnailUrl?: string | null;
  pathname: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  favorite: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
  embeddingStatus?: EmbeddingStatus | string;
}

export interface PublicAssetDto extends AssetGridBaseDto {
  tags?: AssetTag[];
}

export interface PublicSearchResultDto extends PublicAssetDto {
  similarity?: number;
  relevance?: number;
  belowThreshold?: boolean;
}

export type PublicAssetListDto = PublicAssetDto & { tasteScore?: number };

export interface AssetGridReferenceDto extends AssetGridBaseDto {
  embedding: AssetEmbeddingReference;
}

export interface AssetGridSummaryDto extends AssetGridBaseDto {
  embedding: AssetEmbeddingSummary;
}

export interface AssetGridFullDto extends AssetGridBaseDto {
  embedding: AssetEmbeddingFull;
}

export interface AssetGridSimilarityExtension {
  similarity: number;
  relevance: number;
  belowThreshold?: boolean;
}

export interface AssetGridTasteScoreExtension {
  tasteScore: number;
}

export interface AssetGridTagsExtension {
  tags: AssetTag[];
}

export interface AssetGridDtoExtensions {
  similarity?: AssetGridSimilarityExtension;
  tasteScore?: AssetGridTasteScoreExtension;
  tags?: AssetGridTagsExtension;
}

export type AssetGridClientDto = AssetGridBaseDto & {
  /** A grid response may omit embedding, or carry one explicit variant. */
  embedding?: AssetEmbedding | null;
} &
  Partial<AssetGridSimilarityExtension> &
  Partial<AssetGridTasteScoreExtension> &
  Partial<AssetGridTagsExtension>;

export interface AssetUploadDtoExtension {
  embedding?: AssetEmbedding | null;
  embeddingStatus?: string;
  embeddingError?: string | null;
  tags?: AssetTag[];
}

export type AssetUploadClientDto = AssetGridBaseDto & AssetUploadDtoExtension;

export interface AssetUploadDuplicateResponse {
  asset: PublicAssetDto;
  message: string;
  duplicate: true;
}

export interface AssetUploadCreatedResponse {
  asset: PublicAssetDto;
  message: string;
}

export type AssetUploadResponse =
  | AssetUploadDuplicateResponse
  | AssetUploadCreatedResponse;

export interface AssetListResponse {
  assets: PublicAssetListDto[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  taste?: {
    status: 'ready' | 'insufficient_bangers';
    embeddedBangerCount: number;
    minimumBangerEmbeddings: number;
  };
}

export interface SearchResponse {
  results: AssetGridClientDto[];
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

export interface SimilarAssetsResponse {
  results: PublicSearchResultDto[];
  reason: 'source-unembedded' | 'no-neighbors' | null;
}

export interface AssetDetailResponse {
  asset: PublicAssetDto;
}

export interface AssetDetailPatchResponse {
  asset: PublicAssetDto;
  message: 'Asset updated successfully';
}

export interface ApiErrorResponse {
  error: string;
  retry?: boolean;
  details?: unknown;
}

export interface IngestedNearDuplicateSource {
  id: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  pathname: string;
  mime: string;
  phash: string;
  distance: number;
  createdAt: string;
}

/** Internal result from the shared ingestion pipeline; never a public DTO. */
export interface IngestedAssetSource {
  id: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  pathname: string;
  filename: string;
  mime: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  favorite: boolean;
  checksum: string;
  phash?: string | null;
  nearDuplicate?: IngestedNearDuplicateSource | {
    id: string;
    blobUrl: string;
    thumbnailUrl: string | null;
    pathname: string;
    mime: string;
    phash: string;
    distance: number;
    createdAt: Date | string;
  } | null;
  createdAt: Date | string;
  needsEmbedding: boolean;
}

export interface AdvancedSearchFilters {
  favorites?: boolean;
  mimeTypes?: string[];
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  minWidth?: number;
  minHeight?: number;
}

export interface AdvancedSearchPagination {
  total: number;
  page: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface AdvancedSearchResponse {
  results: SplootApiSearchResultDto[];
  query: string;
  filters: AdvancedSearchFilters;
  sortBy: 'relevance' | 'date' | 'favorite';
  pagination: AdvancedSearchPagination;
  seed: number | null;
  processingTime: number;
  searchType: 'semantic' | 'metadata';
  cached: boolean;
  error: string | null;
}

export type AdvancedSearchCacheResponse = AdvancedSearchResponse;
export type AdvancedSearchMetadataFallbackResponse = AdvancedSearchResponse;
export type AdvancedSearchSuccessResponse = AdvancedSearchResponse;
export type AdvancedSearchEmptyResponse = AdvancedSearchResponse;

export interface AdvancedSearchErrorResponse {
  error: string;
  code: SplootApiErrorCode;
  retryable?: boolean;
  results: [];
  query: string;
  pagination: AdvancedSearchPagination;
}

export type AdvancedSearchRouteResponse = AdvancedSearchResponse | AdvancedSearchErrorResponse;

export interface AssetGridCamelSource {
  id: string;
  blobUrl: string;
  thumbnailUrl?: string | null;
  pathname: string;
  filename?: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  favorite: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
  embedding?: AssetGridEmbeddingSource | null;
  embeddingId?: string | null;
  embeddingModelName?: string | null;
  embeddingModelVersion?: string | null;
  embeddingStatus?: string | null;
  embeddingCreatedAt?: Date | string | null;
}

export interface AssetGridEmbeddingSource {
  assetId?: string | null;
  modelName?: string | null;
  modelVersion?: string | null;
  status?: string | null;
  dim?: number | null;
  error?: string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface AssetGridSnakeSource {
  id: string;
  blob_url: string;
  thumbnail_url?: string | null;
  pathname: string;
  filename?: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  favorite: boolean;
  created_at: Date | string;
  updated_at?: Date | string;
  distance?: number;
  similarity?: number;
}

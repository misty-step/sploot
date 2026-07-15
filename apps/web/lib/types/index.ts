/**
 * Shared TypeScript types and interfaces
 */

// Re-export shared API types from @sploot/common
export type {
  AssetSortBy,
  AssetSortDirection,
  SplootApiUploadResponse,
  SplootApiError,
} from '@sploot/common';
export type {
  ApiErrorResponse,
  AdvancedSearchCacheResponse,
  AdvancedSearchEmptyResponse,
  AdvancedSearchErrorResponse,
  AdvancedSearchFilters,
  AdvancedSearchMetadataFallbackResponse,
  AdvancedSearchPagination,
  AdvancedSearchResponse,
  AdvancedSearchRouteResponse,
  AdvancedSearchSuccessResponse,
  AssetDetailResponse,
  AssetDetailPatchResponse,
  AssetEmbedding,
  AssetEmbeddingFull,
  AssetEmbeddingReference,
  AssetEmbeddingSummary,
  AssetGridBaseDto,
  AssetGridCamelSource,
  AssetGridClientDto,
  AssetGridDtoExtensions,
  AssetGridEmbeddingSource,
  AssetGridFullDto,
  AssetGridReferenceDto,
  AssetGridSimilarityExtension,
  AssetGridSnakeSource,
  AssetGridSummaryDto,
  AssetGridTagsExtension,
  AssetGridTasteScoreExtension,
  AssetListResponse,
  AssetTag,
  AssetUploadClientDto,
  AssetUploadCreatedResponse,
  AssetUploadDuplicateResponse,
  AssetUploadDtoExtension,
  AssetUploadResponse,
  PublicAssetDto,
  PublicAssetListDto,
  PublicEmbeddingStatus,
  PublicSearchResultDto,
  IngestedAssetSource,
  IngestedNearDuplicateSource,
  EmbeddingStatus,
  SearchResponse,
  SimilarAssetsResponse,
} from './asset-grid';

import type { AssetGridClientDto, EmbeddingStatus, AssetTag } from './asset-grid';

export type Asset = AssetGridClientDto & {
  embeddingError?: string | null;
  embeddingRetryCount?: number;
  embeddingLastAttempt?: Date | string;
};

export interface TasteMetadata {
  status: 'ready' | 'insufficient_bangers';
  embeddedBangerCount: number;
  minimumBangerEmbeddings: number;
}

export interface SemanticPileThumbnailAsset {
  id: string;
  blobUrl: string;
  thumbnailUrl?: string | null;
  pathname: string;
  filename: string;
  mime: string;
  favorite: boolean;
}

export interface SemanticPile {
  id: string;
  label: string;
  count: number;
  bangers: number;
  confidence: number;
  assetIds: string[];
  thumbnailAssets: SemanticPileThumbnailAsset[];
}

export interface AutomaticPilesResponse {
  status: 'ready' | 'insufficient_embedded_assets';
  minimumAssets: number;
  embeddedAssetCount: number;
  piles: SemanticPile[];
}

export interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'duplicate' | 'offline';
  progress: number;
  error?: string;
  assetId?: string; // Added when upload completes
}

export interface SearchResult extends Asset {
  similarity: number;
  relevance?: number;
}

export interface AssetUpdate {
  favorite?: boolean;
  tags?: AssetTag[];
  embeddingStatus?: EmbeddingStatus;
  embeddingError?: string;
  embeddingRetryCount?: number;
  embeddingLastAttempt?: Date | string;
}

export interface UseAssetsOptions {
  initialLimit?: number;
  sortBy?: import('@sploot/common').AssetSortBy;
  sortOrder?: import('@sploot/common').AssetSortDirection;
  filterFavorites?: boolean;
  autoLoad?: boolean;
  tagId?: string;
  shuffleSeed?: number;
}

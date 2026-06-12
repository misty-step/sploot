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

export type EmbeddingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface AssetEmbedding {
  assetId: string;
  modelName: string;
  modelVersion?: string;
  createdAt: Date | string;
}

export interface AssetTag {
  id: string;
  name: string;
}

export interface Asset {
  id: string;
  blobUrl: string;
  thumbnailUrl?: string | null;
  pathname: string;
  filename: string;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
  favorite: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
  tags?: AssetTag[];

  // Embedding fields
  embedding?: AssetEmbedding | null;
  embeddingStatus?: EmbeddingStatus;
  embeddingError?: string;
  embeddingRetryCount?: number;
  embeddingLastAttempt?: Date | string;

  // Search-related fields (from similarity search results)
  similarity?: number;
  relevance?: number;
  belowThreshold?: boolean;

  // Taste-related fields (from taste-ranked library results)
  tasteScore?: number;
}

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

export interface UploadResponse {
  success: boolean;
  asset?: {
    id: string;
    blobUrl: string;
    pathname: string;
    filename: string;
    mimeType: string;
    size: number;
    checksum: string;
    createdAt: string;
    needsEmbedding?: boolean;
  };
  message?: string;
  error?: string;
  isDuplicate?: boolean;
  mock?: boolean;
}

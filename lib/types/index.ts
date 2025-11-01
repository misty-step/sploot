/**
 * Shared TypeScript types and interfaces
 */

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
  sortBy?: 'recent' | 'date' | 'size' | 'name' | 'shuffle' | 'createdAt' | 'favorite';
  sortOrder?: 'asc' | 'desc';
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
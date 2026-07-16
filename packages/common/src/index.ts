/**
 * @sploot/common
 *
 * Shared constants and types for Sploot ecosystem.
 * Used by web app and browser extension.
 */

// Constants
export {
  ASSET_SORT,
  type AssetSortBy,
  type AssetSortDirection,
  UPLOAD,
  type AllowedMimeType,
  isAssetSortBy,
  isAssetSortDirection,
  isValidMimeType,
  isValidFileSize,
  normalizeMimeType,
  isVideoMimeType,
  isImageMimeType,
  isAnimatedImageMimeType,
  isStaticImageMimeType,
} from './constants';

export {
  EMBEDDING_DIMENSION,
} from './embeddings';

export {
  prepareImageForUpload,
  isCompressibleImageType,
  shouldPrepareImage,
  type PreparedImage,
} from './image-preparation';

// API Types
export type {
  SplootApiError,
  SplootApiErrorAction,
  SplootApiErrorActionType,
  SplootApiErrorCode,
  SplootApiUploadResponse,
  SplootEnrollmentPublicState,
  SplootEnrollmentPublicStatus,
  StorageQuotaSnapshot,
} from './types';

export { isSplootEnrollmentPublicState } from './types';

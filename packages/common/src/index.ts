/**
 * @sploot/common
 *
 * Shared constants and types for Sploot ecosystem.
 * Used by web app and browser extension.
 */

// Constants
export {
  UPLOAD,
  type AllowedMimeType,
  isValidMimeType,
  isValidFileSize,
} from './constants';

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
  StorageQuotaSnapshot,
} from './types';

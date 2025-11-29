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

// API Types
export type { SplootApiUploadResponse, SplootApiError } from './types';

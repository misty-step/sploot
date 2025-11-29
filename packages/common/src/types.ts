/**
 * Shared API types
 *
 * These types define the contract between the web API and clients (extension, mobile).
 * Internal types (database models, Vercel Blob responses) stay in their respective apps.
 */

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
    createdAt: string;
    needsEmbedding?: boolean;
  };
  message?: string;
  error?: string;
  isDuplicate?: boolean;
}

/**
 * Standard error response from Sploot API
 */
export interface SplootApiError {
  error: string;
  code?: string;
}

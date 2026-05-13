/**
 * Shared upload constants
 *
 * Single source of truth for file upload validation rules.
 * Both web app and extension import these constants.
 */

export const UPLOAD = {
  /** Maximum file size in bytes (10MB) */
  maxSize: 10 * 1024 * 1024,
  /** Maximum file size in MB for display */
  maxSizeMB: 10,
  /** Safe multipart payload budget for Vercel Functions (4.5MB hard limit) */
  multipartSafeSize: 4 * 1024 * 1024,
  /** Compression target leaves room for multipart overhead */
  compressionTargetSize: Math.floor(3.8 * 1024 * 1024),
  /** Maximum static image edge before upload */
  maxImageDimension: 2048,
  /** Initial browser re-encode quality for static images */
  compressionQuality: 0.86,
  /** Lowest browser re-encode quality before giving up */
  minimumCompressionQuality: 0.62,
  /** Upload timeout in milliseconds */
  timeout: 10_000,
  /** Allowed MIME types for image uploads */
  allowedTypes: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
  ] as const,
} as const;

/** Type helper for allowed MIME types */
export type AllowedMimeType = (typeof UPLOAD.allowedTypes)[number];

/**
 * Check if a MIME type is valid for upload
 */
export function isValidMimeType(
  mimeType: string
): mimeType is AllowedMimeType {
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  return UPLOAD.allowedTypes.includes(normalized as AllowedMimeType);
}

/**
 * Check if a file size is within limits
 */
export function isValidFileSize(size: number): boolean {
  return size > 0 && size <= UPLOAD.maxSize;
}

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

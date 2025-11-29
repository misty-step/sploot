import { put, del, list } from '@vercel/blob';

// Allowed file types for upload
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];

// Max file size: 10MB
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface UploadResult {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
}

/**
 * Validates if the file type is allowed for upload.
 * Supports JPEG, PNG, WebP, and GIF images.
 */
export function isValidFileType(mimeType: string): boolean {
  return ALLOWED_FILE_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Validates if the file size is within limits.
 * Maximum allowed size is 10MB.
 */
export function isValidFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}

/**
 * Generates a unique filename for storage.
 * Format: userId/timestamp-random.extension
 */
export function generateUniqueFilename(
  userId: string,
  originalFilename: string
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const extension = originalFilename.split('.').pop()?.toLowerCase() || 'jpg';
  return `${userId}/${timestamp}-${random}.${extension}`;
}

/**
 * Uploads a file to Vercel Blob storage.
 * Files are stored publicly with optional cache control.
 */
export async function uploadToBlob(
  file: File | Blob,
  pathname: string,
  options?: {
    addRandomSuffix?: boolean;
    cacheControlMaxAge?: number;
  }
): Promise<UploadResult> {
  const blob = await put(pathname, file, {
    access: 'public',
    addRandomSuffix: options?.addRandomSuffix ?? false,
    cacheControlMaxAge: options?.cacheControlMaxAge,
  });

  return {
    url: blob.url,
    downloadUrl: blob.downloadUrl,
    pathname: blob.pathname,
    contentType: blob.contentType,
    contentDisposition: blob.contentDisposition,
  };
}

/**
 * Deletes a file from Vercel Blob storage.
 * Permanent deletion, cannot be undone.
 * @throws Error if deletion fails
 */
export async function deleteFromBlob(url: string): Promise<void> {
  await del(url);
}

/**
 * Lists all files in Vercel Blob storage for a specific user.
 * Returns up to 1000 most recent files.
 */
export async function listUserBlobs(userId: string) {
  const blobs = await list({
    prefix: `${userId}/`,
    limit: 1000,
  });

  return blobs.blobs;
}

/**
 * Constructs the blob URL from a pathname.
 * Returns placeholder URL in development mode.
 */
export function getBlobUrl(pathname: string): string {
  // In production, this will be your actual blob URL
  // For development, we'll use a placeholder
  const baseUrl = process.env.NEXT_PUBLIC_BLOB_BASE_URL || 'https://your-blob-store.vercel-storage.com';
  return `${baseUrl}/${pathname}`;
}
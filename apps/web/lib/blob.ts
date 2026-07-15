import { createHash } from 'node:crypto';
import { VercelObjectStore } from '@/lib/storage/object-store';

// Re-export shared constants and validation from @sploot/common
export {
  UPLOAD,
  isValidMimeType,
  isValidFileSize,
  type AllowedMimeType,
} from '@sploot/common';

/**
 * Vercel Blob upload result (internal type, not shared)
 */
export interface UploadResult {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
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
  if (options?.addRandomSuffix) throw new Error('Random suffixes are not allowed for canonical storage keys');
  const bytes = Buffer.from(await file.arrayBuffer());
  const blob = await new VercelObjectStore().put(pathname, bytes, {
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    contentType: file.type || undefined,
  });

  return {
    url: blob.url,
    downloadUrl: blob.url,
    pathname: blob.key,
    contentType: file.type || 'application/octet-stream',
    contentDisposition: 'inline',
  };
}

/**
 * Deletes a file from Vercel Blob storage.
 * Permanent deletion, cannot be undone.
 * @throws Error if deletion fails
 */
export async function deleteFromBlob(url: string): Promise<void> {
  await new VercelObjectStore().delete(url);
}

/**
 * Lists all files in Vercel Blob storage for a specific user.
 * Returns up to 1000 most recent files.
 */
export async function listUserBlobs(userId: string) {
  return (await new VercelObjectStore().list(`${userId}/`, 1000)) ?? [];
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

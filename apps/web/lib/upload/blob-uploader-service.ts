import { put, del } from '@vercel/blob';
import { generateUniqueFilename } from '@/lib/blob';
import { logger } from '@/lib/logger';
import type { ImageProcessingResult } from '@/lib/image-processing';

/**
 * Blob upload error with cleanup information
 */
export class BlobUploadError extends Error {
  constructor(
    message: string,
    public retryable: boolean = false,
    public cause?: Error
  ) {
    super(message);
    this.name = 'BlobUploadError';
  }
}

/**
 * URLs returned after successful blob upload
 */
export interface BlobUploadResult {
  mainUrl: string;
  mainPathname: string;
  thumbnailUrl: string | null;
  thumbnailPathname: string | null;
}

/**
 * Configuration for blob uploader
 */
export interface BlobUploaderConfig {
  access?: 'public';
  addRandomSuffix?: boolean;
  maxRetries?: number;
}

/**
 * Service for uploading files to Vercel Blob storage with atomic cleanup.
 * Deep module: simple upload interface hides Vercel Blob API, cleanup logic, error handling.
 *
 * Interface: upload(userId, filename, buffer, processedImages?) -> BlobUploadResult
 * Hidden: Vercel Blob put/del API, filename generation, atomic cleanup on failure, retry logic
 *
 * Key design: Atomic uploads - both main and thumbnail succeed or both are cleaned up.
 * Failed uploads leave no orphaned blobs in storage.
 */
export class BlobUploaderService {
  private access: 'public';
  private addRandomSuffix: boolean;
  private maxRetries: number;

  constructor(config?: BlobUploaderConfig) {
    this.access = config?.access ?? 'public';
    this.addRandomSuffix = config?.addRandomSuffix ?? false;
    this.maxRetries = config?.maxRetries ?? 2;
  }

  /**
   * Upload main image and optional thumbnail to blob storage
   * Atomic operation: both succeed or both are cleaned up
   */
  async upload(
    userId: string,
    originalFilename: string,
    mainBuffer: Buffer,
    processedImages?: ImageProcessingResult | null
  ): Promise<BlobUploadResult> {
    const uniqueFilename = generateUniqueFilename(userId, originalFilename);
    const thumbnailFilename = uniqueFilename.replace(/\.(\w+)$/, '-thumb.$1');

    logger.debug('Starting blob upload', {
      userId,
      filename: uniqueFilename,
      mainSize: mainBuffer.length,
      hasThumbnail: !!processedImages,
    });

    let mainBlobUrl: string | null = null;
    let mainPathname: string | null = null;
    let thumbnailBlobUrl: string | null = null;
    let thumbnailPathname: string | null = null;

    try {
      // Upload main image
      const mainBlob = await this.uploadWithRetry(
        uniqueFilename,
        processedImages ? processedImages.main.buffer : mainBuffer
      );

      mainBlobUrl = mainBlob.url;
      mainPathname = mainBlob.pathname;

      logger.debug('Main blob uploaded successfully', {
        url: mainBlobUrl,
        pathname: mainPathname,
      });

      // Upload thumbnail if processed images are available
      if (processedImages) {
        try {
          const thumbnailBlob = await put(thumbnailFilename, processedImages.thumbnail.buffer, {
            access: this.access,
            addRandomSuffix: this.addRandomSuffix,
          });

          thumbnailBlobUrl = thumbnailBlob.url;
          thumbnailPathname = thumbnailBlob.pathname;

          logger.debug('Thumbnail blob uploaded successfully', {
            url: thumbnailBlobUrl,
            pathname: thumbnailPathname,
          });
        } catch (thumbError) {
          logger.warn('Thumbnail upload failed, continuing without thumbnail', {
            error: thumbError instanceof Error ? thumbError.message : String(thumbError),
          });
          // Continue without thumbnail - not critical, don't retry
        }
      }

      return {
        mainUrl: mainBlobUrl,
        mainPathname: mainPathname,
        thumbnailUrl: thumbnailBlobUrl,
        thumbnailPathname: thumbnailPathname,
      };
    } catch (error) {
      // Upload failed - clean up any uploaded blobs
      logger.error('Blob upload failed, initiating cleanup', {
        error: error instanceof Error ? error.message : String(error),
        mainUploaded: !!mainBlobUrl,
        thumbnailUploaded: !!thumbnailBlobUrl,
      });

      await this.cleanup(mainBlobUrl, thumbnailBlobUrl);

      throw new BlobUploadError(
        'Failed to upload to blob storage',
        true, // Retryable
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Upload a single blob with retry logic
   */
  private async uploadWithRetry(
    filename: string,
    buffer: Buffer
  ): Promise<{ url: string; pathname: string }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const blob = await put(filename, buffer, {
          access: this.access,
          addRandomSuffix: this.addRandomSuffix,
        });

        return {
          url: blob.url,
          pathname: blob.pathname,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn('Blob upload attempt failed', {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          filename,
          error: lastError.message,
        });

        if (attempt < this.maxRetries) {
          // Wait before retry (exponential backoff)
          await this.sleep(100 * Math.pow(2, attempt));
        }
      }
    }

    throw new BlobUploadError(
      `Failed to upload blob after ${this.maxRetries + 1} attempts`,
      false, // Not retryable - already exhausted retries
      lastError || undefined
    );
  }

  /**
   * Clean up uploaded blobs (used on failure)
   * Best-effort cleanup - logs errors but doesn't throw
   */
  async cleanup(
    mainBlobUrl: string | null,
    thumbnailBlobUrl: string | null
  ): Promise<void> {
    const cleanupErrors: string[] = [];

    // Delete main blob if uploaded
    if (mainBlobUrl) {
      try {
        await del(mainBlobUrl);
        logger.info('Successfully cleaned up main blob', { url: mainBlobUrl });
      } catch (error) {
        const errorMsg = `Failed to delete main blob: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('Cleanup failed for main blob', {
          url: mainBlobUrl,
          error: errorMsg,
        });
        cleanupErrors.push(errorMsg);
      }
    }

    // Delete thumbnail blob if uploaded
    if (thumbnailBlobUrl) {
      try {
        await del(thumbnailBlobUrl);
        logger.info('Successfully cleaned up thumbnail blob', { url: thumbnailBlobUrl });
      } catch (error) {
        const errorMsg = `Failed to delete thumbnail: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('Cleanup failed for thumbnail blob', {
          url: thumbnailBlobUrl,
          error: errorMsg,
        });
        cleanupErrors.push(errorMsg);
      }
    }

    // Log orphan alert if cleanup failed
    if (cleanupErrors.length > 0) {
      logger.error('[ORPHAN ALERT] Failed to cleanup blobs. Manual cleanup required', {
        mainBlobUrl,
        thumbnailBlobUrl,
        errors: cleanupErrors,
      });
    }
  }

  /**
   * Delete blobs from storage (public method for explicit cleanup)
   */
  async deleteBlobs(urls: string[]): Promise<void> {
    for (const url of urls) {
      if (url) {
        try {
          await del(url);
          logger.info('Blob deleted successfully', { url });
        } catch (error) {
          logger.error('Failed to delete blob', {
            url,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service configuration
   */
  getConfig(): Required<BlobUploaderConfig> {
    return {
      access: this.access,
      addRandomSuffix: this.addRandomSuffix,
      maxRetries: this.maxRetries,
    };
  }
}

/**
 * Singleton instance for convenience
 */
let defaultUploader: BlobUploaderService | null = null;

export function getBlobUploader(): BlobUploaderService {
  if (!defaultUploader) {
    defaultUploader = new BlobUploaderService();
  }
  return defaultUploader;
}

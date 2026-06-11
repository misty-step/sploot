import {
  processUploadedImage,
  isValidImage,
  generateImagePoster,
  getImageMetadata,
  type ProcessedImage,
  type ImageProcessingResult,
} from '@/lib/image-processing';
import { logger } from '@/lib/logger';
import { isAnimatedImageMimeType, isStaticImageMimeType, isVideoMimeType } from '@sploot/common';
import { extractVideoPoster } from '@/lib/video-processing';

/**
 * Image processing error with retry information
 */
export class ImageProcessingError extends Error {
  constructor(
    message: string,
    public retryable: boolean = false,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

/**
 * Configuration for image processing
 */
export interface ImageProcessorConfig {
  maxRetries?: number;
  retryDelay?: number;
  fallbackToOriginal?: boolean;
}

/**
 * Result of image processing operation
 */
export interface ProcessingResult {
  success: boolean;
  processed: ImageProcessingResult | MediaProcessingRenditions | null;
  metadata?: { width: number | null; height: number | null };
  error?: ImageProcessingError;
  usedFallback: boolean;
}

export interface MediaProcessingRenditions {
  main?: ProcessedImage | null;
  thumbnail?: ProcessedImage | null;
}

/**
 * Service for processing uploaded images with retry logic and fallback.
 * Deep module: simple processImage interface hides Sharp complexity, retry logic, error handling.
 *
 * Interface: processImage(buffer, mimeType) -> ProcessingResult
 * Hidden: Sharp API calls, retry attempts, dimension calculations, format conversions, fallback logic
 *
 * Key design decision: Graceful degradation - always returns a result, never blocks upload.
 * Failed processing → fallback to original buffer rather than rejecting upload.
 */
export class ImageProcessorService {
  private maxRetries: number;
  private retryDelay: number;
  private fallbackToOriginal: boolean;

  constructor(config?: ImageProcessorConfig) {
    this.maxRetries = config?.maxRetries ?? 2;
    this.retryDelay = config?.retryDelay ?? 100;
    this.fallbackToOriginal = config?.fallbackToOriginal ?? true;
  }

  /**
   * Process uploaded image with retry logic and fallback
   * Returns null for processed images if processing fails and fallback is disabled
   */
  async processImage(
    buffer: Buffer,
    mimeType: string
  ): Promise<ProcessingResult> {
    if (isVideoMimeType(mimeType)) {
      return await this.processVideo(buffer, mimeType);
    }

    if (isAnimatedImageMimeType(mimeType)) {
      return await this.processAnimatedImage(buffer, mimeType);
    }

    if (!isStaticImageMimeType(mimeType)) {
      return {
        success: false,
        processed: null,
        error: new ImageProcessingError(`Unsupported media type: ${mimeType}`, false),
        usedFallback: false,
      };
    }

    // Validate buffer contains valid image data
    const isValid = await this.validateImageBuffer(buffer);
    if (!isValid) {
      const error = new ImageProcessingError(
        'Invalid image buffer: unable to read image data',
        false // Not retryable - corrupted data
      );

      logger.error('Image validation failed', {
        mimeType,
        bufferSize: buffer.length,
        error: error.message,
      });

      return {
        success: false,
        processed: null,
        error,
        usedFallback: false,
      };
    }

    // Attempt processing with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const processed = await processUploadedImage(buffer, mimeType);

        logger.debug('Image processing succeeded', {
          attempt,
          mimeType,
          originalSize: buffer.length,
          mainSize: processed.main.size,
          thumbnailSize: processed.thumbnail.size,
          dimensions: `${processed.main.width}x${processed.main.height}`,
        });

        return {
          success: true,
          processed,
          metadata: {
            width: processed.main.width,
            height: processed.main.height,
          },
          usedFallback: false,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn('Image processing attempt failed', {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          mimeType,
          error: lastError.message,
        });

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    // All retries exhausted
    const processingError = new ImageProcessingError(
      `Image processing failed after ${this.maxRetries + 1} attempts`,
      false, // Not retryable - already exhausted retries
      lastError || undefined
    );

    logger.error('Image processing failed after all retries', {
      attempts: this.maxRetries + 1,
      mimeType,
      bufferSize: buffer.length,
      cause: lastError?.message,
    });

    return {
      success: false,
      processed: null,
      error: processingError,
      usedFallback: false,
    };
  }

  /**
   * Validate image buffer contains readable image data
   */
  private async validateImageBuffer(buffer: Buffer): Promise<boolean> {
    try {
      return await isValidImage(buffer);
    } catch (error) {
      logger.error('Image validation error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async processAnimatedImage(
    buffer: Buffer,
    mimeType: string
  ): Promise<ProcessingResult> {
    const isValid = await this.validateImageBuffer(buffer);
    if (!isValid) {
      const error = new ImageProcessingError(
        'Invalid image buffer: unable to read image data',
        false
      );

      logger.error('Image validation failed', {
        mimeType,
        bufferSize: buffer.length,
        error: error.message,
      });

      return {
        success: false,
        processed: null,
        error,
        usedFallback: false,
      };
    }

    try {
      const metadata = await getImageMetadata(buffer);
      const poster = await generateImagePoster(buffer);

      logger.debug('Animated image poster generated', {
        mimeType,
        posterSize: poster.size,
        dimensions: `${metadata.width ?? poster.width}x${metadata.height ?? poster.height}`,
      });

      return {
        success: true,
        processed: { thumbnail: poster },
        metadata: {
          width: metadata.width ?? poster.width,
          height: metadata.height ?? poster.height,
        },
        usedFallback: true,
      };
    } catch (error) {
      const processingError = new ImageProcessingError(
        'Animated image poster generation failed',
        false,
        error instanceof Error ? error : new Error(String(error))
      );

      logger.error('Animated image poster generation failed', {
        mimeType,
        bufferSize: buffer.length,
        error: processingError.cause?.message ?? processingError.message,
      });

      return {
        success: false,
        processed: null,
        error: processingError,
        usedFallback: false,
      };
    }
  }

  private async processVideo(
    buffer: Buffer,
    mimeType: string
  ): Promise<ProcessingResult> {
    try {
      const poster = await extractVideoPoster(buffer, mimeType);

      logger.debug('Video poster generated', {
        mimeType,
        posterSize: poster.size,
        dimensions: `${poster.width}x${poster.height}`,
      });

      return {
        success: true,
        processed: { thumbnail: poster },
        metadata: {
          width: poster.width,
          height: poster.height,
        },
        usedFallback: true,
      };
    } catch (error) {
      const processingError = new ImageProcessingError(
        'Video poster generation failed',
        false,
        error instanceof Error ? error : new Error(String(error))
      );

      logger.error('Video poster generation failed', {
        mimeType,
        bufferSize: buffer.length,
        error: processingError.cause?.message ?? processingError.message,
      });

      return {
        success: false,
        processed: null,
        error: processingError,
        usedFallback: false,
      };
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get processing configuration info
   */
  getConfig(): Required<ImageProcessorConfig> {
    return {
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      fallbackToOriginal: this.fallbackToOriginal,
    };
  }
}

/**
 * Singleton instance for convenience
 */
let defaultProcessor: ImageProcessorService | null = null;

export function getImageProcessor(): ImageProcessorService {
  if (!defaultProcessor) {
    defaultProcessor = new ImageProcessorService();
  }
  return defaultProcessor;
}

/**
 * Type guard for successful processing result
 */
export function isSuccessfulProcessing(
  result: ProcessingResult
): result is ProcessingResult & { processed: ImageProcessingResult | MediaProcessingRenditions } {
  return result.success && result.processed !== null;
}

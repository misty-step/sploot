import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ImageProcessorService,
  ImageProcessingError,
  isSuccessfulProcessing,
} from '@/lib/upload/image-processor-service';
import * as imageProcessing from '@/lib/image-processing';
import { logger } from '@/lib/logger';

// Mock dependencies
vi.mock('@/lib/image-processing');
vi.mock('@/lib/logger');

describe('ImageProcessorService', () => {
  let processor: ImageProcessorService;
  const mockBuffer = Buffer.from('fake-image-data');
  const mockMimeType = 'image/jpeg';

  beforeEach(() => {
    processor = new ImageProcessorService();
    vi.clearAllMocks();
  });

  describe('processImage', () => {
    it('returns successful result when processing succeeds', async () => {
      const mockProcessedResult = {
        main: {
          buffer: Buffer.from('processed-main'),
          format: 'jpeg',
          width: 1024,
          height: 768,
          size: 50000,
        },
        thumbnail: {
          buffer: Buffer.from('processed-thumb'),
          format: 'jpeg',
          width: 256,
          height: 256,
          size: 10000,
        },
      };

      vi.mocked(imageProcessing.isValidImage).mockResolvedValue(true);
      vi.mocked(imageProcessing.processUploadedImage).mockResolvedValue(mockProcessedResult);

      const result = await processor.processImage(mockBuffer, mockMimeType);

      expect(result.success).toBe(true);
      expect(result.processed).toEqual(mockProcessedResult);
      expect(result.error).toBeUndefined();
      expect(result.usedFallback).toBe(false);
    });

    it('validates image buffer before processing', async () => {
      vi.mocked(imageProcessing.isValidImage).mockResolvedValue(true);
      vi.mocked(imageProcessing.processUploadedImage).mockResolvedValue({
        main: {} as any,
        thumbnail: {} as any,
      });

      await processor.processImage(mockBuffer, mockMimeType);

      expect(imageProcessing.isValidImage).toHaveBeenCalledWith(mockBuffer);
    });

    it('rejects invalid image buffer', async () => {
      vi.mocked(imageProcessing.isValidImage).mockResolvedValue(false);

      const result = await processor.processImage(mockBuffer, mockMimeType);

      expect(result.success).toBe(false);
      expect(result.processed).toBeNull();
      expect(result.error).toBeInstanceOf(ImageProcessingError);
      expect(result.error?.retryable).toBe(false);
      expect(result.error?.message).toContain('Invalid image buffer');
    });

    it('logs error when validation fails', async () => {
      vi.mocked(imageProcessing.isValidImage).mockResolvedValue(false);

      await processor.processImage(mockBuffer, mockMimeType);

      expect(logger.error).toHaveBeenCalledWith(
        'Image validation failed',
        expect.objectContaining({
          mimeType: mockMimeType,
          bufferSize: mockBuffer.length,
        })
      );
    });

    it('retries on processing failure', async () => {
      vi.mocked(imageProcessing.isValidImage).mockResolvedValue(true);
      vi.mocked(imageProcessing.processUploadedImage)
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockResolvedValue({
          main: {} as any,
          thumbnail: {} as any,
        });

      const result = await processor.processImage(mockBuffer, mockMimeType);

      expect(result.success).toBe(true);
      expect(imageProcessing.processUploadedImage).toHaveBeenCalledTimes(3);
    });

    it('returns error after exhausting retries', async () => {
      const customProcessor = new ImageProcessorService({ maxRetries: 1 });

      vi.mocked(imageProcessing.isValidImage).mockResolvedValue(true);
      vi.mocked(imageProcessing.processUploadedImage)
        .mockRejectedValue(new Error('Processing failed'));

      const result = await customProcessor.processImage(mockBuffer, mockMimeType);

      expect(result.success).toBe(false);
      expect(result.processed).toBeNull();
      expect(result.error).toBeInstanceOf(ImageProcessingError);
      expect(result.error?.message).toContain('failed after 2 attempts');
      expect(imageProcessing.processUploadedImage).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('logs warning on each retry attempt', async () => {
      const customProcessor = new ImageProcessorService({ maxRetries: 1 });

      vi.mocked(imageProcessing.isValidImage).mockResolvedValue(true);
      vi.mocked(imageProcessing.processUploadedImage)
        .mockRejectedValue(new Error('Processing failed'));

      await customProcessor.processImage(mockBuffer, mockMimeType);

      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Image processing attempt failed',
        expect.objectContaining({
          attempt: 1,
          maxRetries: 1,
        })
      );
    });

    it('logs error after all retries exhausted', async () => {
      const customProcessor = new ImageProcessorService({ maxRetries: 0 });

      vi.mocked(imageProcessing.isValidImage).mockResolvedValue(true);
      vi.mocked(imageProcessing.processUploadedImage)
        .mockRejectedValue(new Error('Processing failed'));

      await customProcessor.processImage(mockBuffer, mockMimeType);

      expect(logger.error).toHaveBeenCalledWith(
        'Image processing failed after all retries',
        expect.objectContaining({
          attempts: 1,
          mimeType: mockMimeType,
        })
      );
    });

    it('logs success with processing details', async () => {
      const mockProcessedResult = {
        main: {
          buffer: Buffer.from('processed-main'),
          format: 'jpeg',
          width: 1024,
          height: 768,
          size: 50000,
        },
        thumbnail: {
          buffer: Buffer.from('processed-thumb'),
          format: 'jpeg',
          width: 256,
          height: 256,
          size: 10000,
        },
      };

      vi.mocked(imageProcessing.isValidImage).mockResolvedValue(true);
      vi.mocked(imageProcessing.processUploadedImage).mockResolvedValue(mockProcessedResult);

      await processor.processImage(mockBuffer, mockMimeType);

      expect(logger.debug).toHaveBeenCalledWith(
        'Image processing succeeded',
        expect.objectContaining({
          mimeType: mockMimeType,
          mainSize: 50000,
          thumbnailSize: 10000,
          dimensions: '1024x768',
        })
      );
    });

    it('handles non-Error exceptions gracefully', async () => {
      vi.mocked(imageProcessing.isValidImage).mockResolvedValue(true);
      vi.mocked(imageProcessing.processUploadedImage)
        .mockRejectedValue('string error');

      const result = await processor.processImage(mockBuffer, mockMimeType);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ImageProcessingError);
    });

    it('applies exponential backoff for retries', async () => {
      const customProcessor = new ImageProcessorService({
        maxRetries: 2,
        retryDelay: 100,
      });
      const sleepSpy = vi.spyOn(customProcessor as any, 'sleep');

      vi.mocked(imageProcessing.isValidImage).mockResolvedValue(true);
      vi.mocked(imageProcessing.processUploadedImage)
        .mockRejectedValueOnce(new Error('Attempt 1'))
        .mockRejectedValueOnce(new Error('Attempt 2'))
        .mockResolvedValue({
          main: {} as any,
          thumbnail: {} as any,
        });

      await customProcessor.processImage(mockBuffer, mockMimeType);

      // Should sleep with exponential backoff between retries
      // Attempt 1 fails -> sleep(100 * 2^0 = 100ms)
      // Attempt 2 fails -> sleep(100 * 2^1 = 200ms)
      // Attempt 3 succeeds -> no sleep
      expect(sleepSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('custom configuration', () => {
    it('accepts custom max retries', () => {
      const customProcessor = new ImageProcessorService({ maxRetries: 5 });
      const config = customProcessor.getConfig();

      expect(config.maxRetries).toBe(5);
    });

    it('accepts custom retry delay', () => {
      const customProcessor = new ImageProcessorService({ retryDelay: 500 });
      const config = customProcessor.getConfig();

      expect(config.retryDelay).toBe(500);
    });

    it('accepts custom fallback setting', () => {
      const customProcessor = new ImageProcessorService({ fallbackToOriginal: false });
      const config = customProcessor.getConfig();

      expect(config.fallbackToOriginal).toBe(false);
    });

    it('uses default config when not provided', () => {
      const defaultProcessor = new ImageProcessorService();
      const config = defaultProcessor.getConfig();

      expect(config.maxRetries).toBe(2);
      expect(config.retryDelay).toBe(100);
      expect(config.fallbackToOriginal).toBe(true);
    });
  });

  describe('ImageProcessingError', () => {
    it('includes retryable flag', () => {
      const error = new ImageProcessingError('Test error', true);

      expect(error.message).toBe('Test error');
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('ImageProcessingError');
    });

    it('defaults retryable to false', () => {
      const error = new ImageProcessingError('Test error');

      expect(error.retryable).toBe(false);
    });

    it('includes cause error', () => {
      const cause = new Error('Original error');
      const error = new ImageProcessingError('Wrapper error', false, cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('isSuccessfulProcessing', () => {
    it('returns true for successful processing result', () => {
      const result = {
        success: true,
        processed: {
          main: {} as any,
          thumbnail: {} as any,
        },
        usedFallback: false,
      };

      expect(isSuccessfulProcessing(result)).toBe(true);
    });

    it('returns false when success is false', () => {
      const result = {
        success: false,
        processed: null,
        error: new ImageProcessingError('Error'),
        usedFallback: false,
      };

      expect(isSuccessfulProcessing(result)).toBe(false);
    });

    it('returns false when processed is null', () => {
      const result = {
        success: true, // Inconsistent state for testing
        processed: null,
        usedFallback: false,
      };

      expect(isSuccessfulProcessing(result)).toBe(false);
    });

    it('narrows type when true', () => {
      const result = {
        success: true,
        processed: {
          main: {} as any,
          thumbnail: {} as any,
        },
        usedFallback: false,
      };

      if (isSuccessfulProcessing(result)) {
        // TypeScript should know processed is not null here
        expect(result.processed.main).toBeDefined();
        expect(result.processed.thumbnail).toBeDefined();
      }
    });
  });

  describe('validation edge cases', () => {
    it('handles validation throwing exception', async () => {
      vi.mocked(imageProcessing.isValidImage).mockRejectedValue(
        new Error('Validation error')
      );

      const result = await processor.processImage(mockBuffer, mockMimeType);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid image buffer');
    });

    it('logs validation exception', async () => {
      const validationError = new Error('Validation error');
      vi.mocked(imageProcessing.isValidImage).mockRejectedValue(validationError);

      await processor.processImage(mockBuffer, mockMimeType);

      expect(logger.error).toHaveBeenCalledWith(
        'Image validation error',
        expect.objectContaining({
          error: 'Validation error',
        })
      );
    });
  });

  describe('zero retry configuration', () => {
    it('does not retry when maxRetries is 0', async () => {
      const noRetryProcessor = new ImageProcessorService({ maxRetries: 0 });

      vi.mocked(imageProcessing.isValidImage).mockResolvedValue(true);
      vi.mocked(imageProcessing.processUploadedImage)
        .mockRejectedValue(new Error('Processing failed'));

      await noRetryProcessor.processImage(mockBuffer, mockMimeType);

      expect(imageProcessing.processUploadedImage).toHaveBeenCalledTimes(1);
    });
  });
});

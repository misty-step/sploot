import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BlobUploaderService,
  BlobUploadError,
} from '@/lib/upload/blob-uploader-service';
import * as vercelBlob from '@vercel/blob';
import * as blobUtils from '@/lib/blob';
import { logger } from '@/lib/logger';

// Mock dependencies
vi.mock('@vercel/blob');
vi.mock('@/lib/blob');
vi.mock('@/lib/logger');

describe('BlobUploaderService', () => {
  let uploader: BlobUploaderService;
  const mockUserId = 'user-123';
  const mockFilename = 'test-image.jpg';
  const mockBuffer = Buffer.from('fake-image-data');

  const mockMainBlob = {
    url: 'https://blob.store/main.jpg',
    pathname: 'user-123/main.jpg',
    downloadUrl: 'https://blob.store/main.jpg',
    contentType: 'image/jpeg',
    contentDisposition: 'inline',
  };

  const mockThumbnailBlob = {
    url: 'https://blob.store/thumb.jpg',
    pathname: 'user-123/thumb.jpg',
    downloadUrl: 'https://blob.store/thumb.jpg',
    contentType: 'image/jpeg',
    contentDisposition: 'inline',
  };

  beforeEach(() => {
    uploader = new BlobUploaderService();
    vi.clearAllMocks();

    vi.mocked(blobUtils.generateUniqueFilename).mockReturnValue('user-123/unique-file.jpg');
  });

  describe('upload', () => {
    it('uploads main image successfully without thumbnail', async () => {
      vi.mocked(vercelBlob.put).mockResolvedValue(mockMainBlob);

      const result = await uploader.upload(mockUserId, mockFilename, mockBuffer);

      expect(result.mainUrl).toBe(mockMainBlob.url);
      expect(result.mainPathname).toBe(mockMainBlob.pathname);
      expect(result.thumbnailUrl).toBeNull();
      expect(result.thumbnailPathname).toBeNull();
    });

    it('uploads both main and thumbnail when processed images provided', async () => {
      const processedImages = {
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

      vi.mocked(vercelBlob.put)
        .mockResolvedValueOnce(mockMainBlob)
        .mockResolvedValueOnce(mockThumbnailBlob);

      const result = await uploader.upload(mockUserId, mockFilename, mockBuffer, processedImages);

      expect(result.mainUrl).toBe(mockMainBlob.url);
      expect(result.thumbnailUrl).toBe(mockThumbnailBlob.url);
      expect(vercelBlob.put).toHaveBeenCalledTimes(2);
    });

    it('generates unique filenames for storage', async () => {
      vi.mocked(vercelBlob.put).mockResolvedValue(mockMainBlob);

      await uploader.upload(mockUserId, mockFilename, mockBuffer);

      expect(blobUtils.generateUniqueFilename).toHaveBeenCalledWith(mockUserId, mockFilename);
    });

    it('uploads with correct options', async () => {
      vi.mocked(vercelBlob.put).mockResolvedValue(mockMainBlob);

      await uploader.upload(mockUserId, mockFilename, mockBuffer);

      expect(vercelBlob.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        expect.objectContaining({
          access: 'public',
          addRandomSuffix: false,
        })
      );
    });

    it('logs debug message on successful upload', async () => {
      vi.mocked(vercelBlob.put).mockResolvedValue(mockMainBlob);

      await uploader.upload(mockUserId, mockFilename, mockBuffer);

      expect(logger.debug).toHaveBeenCalledWith(
        'Main blob uploaded successfully',
        expect.objectContaining({
          url: mockMainBlob.url,
          pathname: mockMainBlob.pathname,
        })
      );
    });

    it('continues without thumbnail if thumbnail upload fails', async () => {
      const processedImages = {
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

      vi.mocked(vercelBlob.put)
        .mockResolvedValueOnce(mockMainBlob)
        .mockRejectedValueOnce(new Error('Thumbnail upload failed'));

      const result = await uploader.upload(mockUserId, mockFilename, mockBuffer, processedImages);

      expect(result.mainUrl).toBe(mockMainBlob.url);
      expect(result.thumbnailUrl).toBeNull();
    });

    it('logs warning when thumbnail upload fails', async () => {
      const processedImages = {
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

      vi.mocked(vercelBlob.put)
        .mockResolvedValueOnce(mockMainBlob)
        .mockRejectedValueOnce(new Error('Thumbnail upload failed'));

      await uploader.upload(mockUserId, mockFilename, mockBuffer, processedImages);

      expect(logger.warn).toHaveBeenCalledWith(
        'Thumbnail upload failed, continuing without thumbnail',
        expect.objectContaining({
          error: 'Thumbnail upload failed',
        })
      );
    });

    it('retries on upload failure', async () => {
      vi.mocked(vercelBlob.put)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue(mockMainBlob);

      const result = await uploader.upload(mockUserId, mockFilename, mockBuffer);

      expect(result.mainUrl).toBe(mockMainBlob.url);
      expect(vercelBlob.put).toHaveBeenCalledTimes(3);
    });

    it('throws BlobUploadError after exhausting retries', async () => {
      const customUploader = new BlobUploaderService({ maxRetries: 1 });

      vi.mocked(vercelBlob.put).mockRejectedValue(new Error('Upload failed'));

      await expect(
        customUploader.upload(mockUserId, mockFilename, mockBuffer)
      ).rejects.toThrow(BlobUploadError);

      expect(vercelBlob.put).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('calls cleanup method on main upload failure', async () => {
      vi.mocked(vercelBlob.put).mockRejectedValue(new Error('Upload failed'));
      vi.mocked(vercelBlob.del).mockResolvedValue();

      const cleanupSpy = vi.spyOn(uploader as any, 'cleanup');

      try {
        await uploader.upload(mockUserId, mockFilename, mockBuffer);
      } catch (error) {
        // Expected to throw
      }

      // Cleanup should be called with null URLs since nothing uploaded
      expect(cleanupSpy).toHaveBeenCalledWith(null, null);
    });

    it('throws BlobUploadError on upload failure', async () => {
      const customUploader = new BlobUploaderService({ maxRetries: 0 });

      // Reset and set up fresh mock
      vi.mocked(vercelBlob.put).mockReset();
      vi.mocked(vercelBlob.put).mockRejectedValue(new Error('Upload failed'));
      vi.mocked(blobUtils.generateUniqueFilename).mockReturnValue('user-123/unique-file.jpg');

      await expect(
        customUploader.upload(mockUserId, mockFilename, mockBuffer)
      ).rejects.toThrow(BlobUploadError);
    });
  });

  describe('cleanup', () => {
    it('deletes main blob if provided', async () => {
      vi.mocked(vercelBlob.del).mockResolvedValue();

      await uploader.cleanup(mockMainBlob.url, null);

      expect(vercelBlob.del).toHaveBeenCalledWith(mockMainBlob.url);
    });

    it('deletes both blobs if both provided', async () => {
      vi.mocked(vercelBlob.del).mockResolvedValue();

      await uploader.cleanup(mockMainBlob.url, mockThumbnailBlob.url);

      expect(vercelBlob.del).toHaveBeenCalledTimes(2);
      expect(vercelBlob.del).toHaveBeenCalledWith(mockMainBlob.url);
      expect(vercelBlob.del).toHaveBeenCalledWith(mockThumbnailBlob.url);
    });

    it('does not throw on cleanup errors', async () => {
      vi.mocked(vercelBlob.del).mockRejectedValue(new Error('Delete failed'));

      await expect(
        uploader.cleanup(mockMainBlob.url, mockThumbnailBlob.url)
      ).resolves.toBeUndefined();
    });

    it('logs orphan alert when cleanup fails', async () => {
      vi.mocked(vercelBlob.del).mockRejectedValue(new Error('Delete failed'));

      await uploader.cleanup(mockMainBlob.url, mockThumbnailBlob.url);

      expect(logger.error).toHaveBeenCalledWith(
        '[ORPHAN ALERT] Failed to cleanup blobs. Manual cleanup required',
        expect.objectContaining({
          mainBlobUrl: mockMainBlob.url,
          thumbnailBlobUrl: mockThumbnailBlob.url,
          errors: expect.any(Array),
        })
      );
    });

    it('logs success when cleanup succeeds', async () => {
      vi.mocked(vercelBlob.del).mockResolvedValue();

      await uploader.cleanup(mockMainBlob.url, null);

      expect(logger.info).toHaveBeenCalledWith(
        'Successfully cleaned up main blob',
        { url: mockMainBlob.url }
      );
    });

    it('handles null URLs gracefully', async () => {
      await uploader.cleanup(null, null);

      expect(vercelBlob.del).not.toHaveBeenCalled();
    });
  });

  describe('deleteBlobs', () => {
    it('deletes all provided URLs', async () => {
      vi.mocked(vercelBlob.del).mockResolvedValue();

      const urls = ['https://blob.store/1.jpg', 'https://blob.store/2.jpg'];
      await uploader.deleteBlobs(urls);

      expect(vercelBlob.del).toHaveBeenCalledTimes(2);
      expect(vercelBlob.del).toHaveBeenCalledWith(urls[0]);
      expect(vercelBlob.del).toHaveBeenCalledWith(urls[1]);
    });

    it('skips empty URLs', async () => {
      vi.mocked(vercelBlob.del).mockResolvedValue();

      const urls = ['https://blob.store/1.jpg', '', 'https://blob.store/2.jpg'];
      await uploader.deleteBlobs(urls);

      expect(vercelBlob.del).toHaveBeenCalledTimes(2);
    });

    it('continues deleting even if one fails', async () => {
      vi.mocked(vercelBlob.del)
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce();

      const urls = ['https://blob.store/1.jpg', 'https://blob.store/2.jpg'];
      await uploader.deleteBlobs(urls);

      expect(vercelBlob.del).toHaveBeenCalledTimes(2);
    });
  });

  describe('custom configuration', () => {
    it('uses public access by default', async () => {
      const defaultUploader = new BlobUploaderService();

      vi.mocked(vercelBlob.put).mockResolvedValue(mockMainBlob);

      await defaultUploader.upload(mockUserId, mockFilename, mockBuffer);

      expect(vercelBlob.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        expect.objectContaining({ access: 'public' })
      );
    });

    it('accepts custom addRandomSuffix setting', async () => {
      const randomSuffixUploader = new BlobUploaderService({ addRandomSuffix: true });

      vi.mocked(vercelBlob.put).mockResolvedValue(mockMainBlob);

      await randomSuffixUploader.upload(mockUserId, mockFilename, mockBuffer);

      expect(vercelBlob.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        expect.objectContaining({ addRandomSuffix: true })
      );
    });

    it('accepts custom max retries', () => {
      const customUploader = new BlobUploaderService({ maxRetries: 5 });
      const config = customUploader.getConfig();

      expect(config.maxRetries).toBe(5);
    });

    it('returns default config when not provided', () => {
      const defaultUploader = new BlobUploaderService();
      const config = defaultUploader.getConfig();

      expect(config.access).toBe('public');
      expect(config.addRandomSuffix).toBe(false);
      expect(config.maxRetries).toBe(2);
    });
  });

  describe('BlobUploadError', () => {
    it('includes retryable flag', () => {
      const error = new BlobUploadError('Test error', true);

      expect(error.message).toBe('Test error');
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('BlobUploadError');
    });

    it('defaults retryable to false', () => {
      const error = new BlobUploadError('Test error');

      expect(error.retryable).toBe(false);
    });

    it('includes cause error', () => {
      const cause = new Error('Original error');
      const error = new BlobUploadError('Wrapper error', false, cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('retry behavior', () => {
    it('applies exponential backoff between retries', async () => {
      const sleepSpy = vi.spyOn(uploader as any, 'sleep');

      vi.mocked(vercelBlob.put)
        .mockRejectedValueOnce(new Error('Attempt 1'))
        .mockRejectedValueOnce(new Error('Attempt 2'))
        .mockResolvedValue(mockMainBlob);

      await uploader.upload(mockUserId, mockFilename, mockBuffer);

      expect(sleepSpy).toHaveBeenCalledTimes(2);
    });

    it('logs warning on each retry attempt', async () => {
      const customUploader = new BlobUploaderService({ maxRetries: 1 });

      vi.mocked(vercelBlob.put)
        .mockRejectedValueOnce(new Error('Upload failed'))
        .mockResolvedValue(mockMainBlob);

      await customUploader.upload(mockUserId, mockFilename, mockBuffer);

      expect(logger.warn).toHaveBeenCalledWith(
        'Blob upload attempt failed',
        expect.objectContaining({
          attempt: 1,
          maxRetries: 1,
        })
      );
    });
  });
});

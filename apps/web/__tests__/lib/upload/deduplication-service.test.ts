import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DeduplicationService,
  hasDuplicate,
} from '@/lib/upload/deduplication-service';
import * as db from '@/lib/db';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// Mock dependencies
vi.mock('@/lib/db');
vi.mock('@/lib/logger');

describe('DeduplicationService', () => {
  let deduplicator: DeduplicationService;
  const mockUserId = 'user-123';
  const mockBuffer = Buffer.from('test-image-content');

  // Compute expected checksum for mock buffer
  const expectedChecksum = crypto
    .createHash('sha256')
    .update(mockBuffer)
    .digest('hex');

  beforeEach(() => {
    deduplicator = new DeduplicationService();
    vi.clearAllMocks();

    // Mock prisma as available by default
    vi.mocked(db).prisma = {} as any;
  });

  describe('checkDuplicate', () => {
    it('returns no duplicate when asset does not exist', async () => {
      vi.mocked(db.assetExists).mockResolvedValue(null);

      const result = await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(result.isDuplicate).toBe(false);
      expect(result.checksum).toBe(expectedChecksum);
      expect(result.existingAsset).toBeUndefined();
    });

    it('computes correct SHA-256 checksum', async () => {
      vi.mocked(db.assetExists).mockResolvedValue(null);

      const result = await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(result.checksum).toHaveLength(64); // SHA-256 produces 64 hex chars
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('calls assetExists with correct parameters', async () => {
      vi.mocked(db.assetExists).mockResolvedValue(null);

      await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(db.assetExists).toHaveBeenCalledWith(
        mockUserId,
        expectedChecksum,
        { includeEmbedding: true }
      );
    });

    it('returns duplicate when asset exists', async () => {
      const mockExistingAsset: db.ExistingAssetMetadata = {
        id: 'asset-456',
        blobUrl: 'https://blob.store/image.jpg',
        thumbnailUrl: 'https://blob.store/thumb.jpg',
        pathname: 'user-123/image.jpg',
        mime: 'image/jpeg',
        size: 50000,
        width: 1024,
        height: 768,
        checksumSha256: expectedChecksum,
        favorite: false,
        createdAt: new Date(),
        hasEmbedding: true,
      };

      vi.mocked(db.assetExists).mockResolvedValue(mockExistingAsset);

      const result = await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(result.isDuplicate).toBe(true);
      expect(result.checksum).toBe(expectedChecksum);
      expect(result.existingAsset).toEqual(mockExistingAsset);
    });

    it('logs debug message when checking for duplicates', async () => {
      vi.mocked(db.assetExists).mockResolvedValue(null);

      await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(logger.debug).toHaveBeenCalledWith(
        'Checking for duplicate upload',
        expect.objectContaining({
          userId: mockUserId,
          checksum: expectedChecksum,
          bufferSize: mockBuffer.length,
        })
      );
    });

    it('logs info message when duplicate found', async () => {
      const mockExistingAsset: db.ExistingAssetMetadata = {
        id: 'asset-456',
        blobUrl: 'https://blob.store/image.jpg',
        thumbnailUrl: null,
        pathname: 'user-123/image.jpg',
        mime: 'image/jpeg',
        size: 50000,
        width: 1024,
        height: 768,
        checksumSha256: expectedChecksum,
        favorite: false,
        createdAt: new Date(),
        hasEmbedding: false,
      };

      vi.mocked(db.assetExists).mockResolvedValue(mockExistingAsset);

      await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(logger.info).toHaveBeenCalledWith(
        'Duplicate upload detected',
        expect.objectContaining({
          userId: mockUserId,
          checksum: expectedChecksum,
          assetId: 'asset-456',
          hasEmbedding: false,
        })
      );
    });

    it('logs debug message when no duplicate found', async () => {
      vi.mocked(db.assetExists).mockResolvedValue(null);

      await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(logger.debug).toHaveBeenCalledWith(
        'No duplicate found',
        expect.objectContaining({
          userId: mockUserId,
          checksum: expectedChecksum,
        })
      );
    });

    it('handles database not configured gracefully', async () => {
      vi.mocked(db).prisma = null;
      vi.mocked(db.assetExists).mockResolvedValue(null);

      const result = await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(result.isDuplicate).toBe(false);
      expect(result.checksum).toBe(expectedChecksum);
    });

    it('logs warning when database not configured', async () => {
      vi.mocked(db).prisma = null;
      vi.mocked(db.assetExists).mockResolvedValue(null);

      await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(logger.warn).toHaveBeenCalledWith(
        'Database not configured, skipping duplicate check'
      );
    });

    it('handles database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      vi.mocked(db.assetExists).mockRejectedValue(dbError);

      const result = await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      // Should not throw - returns no duplicate on error
      expect(result.isDuplicate).toBe(false);
      expect(result.checksum).toBe(expectedChecksum);
    });

    it('logs error when database query fails', async () => {
      const dbError = new Error('Database connection failed');
      vi.mocked(db.assetExists).mockRejectedValue(dbError);

      await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(logger.error).toHaveBeenCalledWith(
        'Error checking for duplicate asset',
        expect.objectContaining({
          userId: mockUserId,
          checksum: expectedChecksum,
          error: 'Database connection failed',
        })
      );
    });

    it('computes same checksum for identical buffers', async () => {
      vi.mocked(db.assetExists).mockResolvedValue(null);

      const buffer1 = Buffer.from('identical-content');
      const buffer2 = Buffer.from('identical-content');

      const result1 = await deduplicator.checkDuplicate(mockUserId, buffer1);
      const result2 = await deduplicator.checkDuplicate(mockUserId, buffer2);

      expect(result1.checksum).toBe(result2.checksum);
    });

    it('computes different checksums for different buffers', async () => {
      vi.mocked(db.assetExists).mockResolvedValue(null);

      const buffer1 = Buffer.from('content-one');
      const buffer2 = Buffer.from('content-two');

      const result1 = await deduplicator.checkDuplicate(mockUserId, buffer1);
      const result2 = await deduplicator.checkDuplicate(mockUserId, buffer2);

      expect(result1.checksum).not.toBe(result2.checksum);
    });
  });

  describe('computeChecksumOnly', () => {
    it('returns checksum without database lookup', () => {
      const checksum = deduplicator.computeChecksumOnly(mockBuffer);

      expect(checksum).toBe(expectedChecksum);
      expect(db.assetExists).not.toHaveBeenCalled();
    });

    it('returns same checksum as checkDuplicate', async () => {
      vi.mocked(db.assetExists).mockResolvedValue(null);

      const checksumOnly = deduplicator.computeChecksumOnly(mockBuffer);
      const result = await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(checksumOnly).toBe(result.checksum);
    });
  });

  describe('verifyChecksum', () => {
    it('returns true when checksum matches', () => {
      const isValid = deduplicator.verifyChecksum(mockBuffer, expectedChecksum);

      expect(isValid).toBe(true);
    });

    it('returns false when checksum does not match', () => {
      const wrongChecksum = 'a'.repeat(64);
      const isValid = deduplicator.verifyChecksum(mockBuffer, wrongChecksum);

      expect(isValid).toBe(false);
    });

    it('handles case sensitivity correctly', () => {
      const uppercaseChecksum = expectedChecksum.toUpperCase();
      const isValid = deduplicator.verifyChecksum(mockBuffer, uppercaseChecksum);

      // SHA-256 hex is lowercase, so uppercase should not match
      expect(isValid).toBe(false);
    });

    it('returns false for empty checksum', () => {
      const isValid = deduplicator.verifyChecksum(mockBuffer, '');

      expect(isValid).toBe(false);
    });
  });

  describe('custom configuration', () => {
    it('accepts custom checksum algorithm', () => {
      const md5Deduplicator = new DeduplicationService({
        checksumAlgorithm: 'md5',
      });

      const checksum = md5Deduplicator.computeChecksumOnly(mockBuffer);

      expect(checksum).toHaveLength(32); // MD5 produces 32 hex chars
    });

    it('accepts custom embedding status flag', async () => {
      const noEmbeddingDeduplicator = new DeduplicationService({
        includeEmbeddingStatus: false,
      });

      vi.mocked(db.assetExists).mockResolvedValue(null);

      await noEmbeddingDeduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(db.assetExists).toHaveBeenCalledWith(
        mockUserId,
        expect.any(String),
        { includeEmbedding: false }
      );
    });

    it('uses default config when not provided', () => {
      const defaultDeduplicator = new DeduplicationService();
      const config = defaultDeduplicator.getConfig();

      expect(config.checksumAlgorithm).toBe('sha256');
      expect(config.includeEmbeddingStatus).toBe(true);
    });

    it('returns custom config via getConfig', () => {
      const customDeduplicator = new DeduplicationService({
        checksumAlgorithm: 'sha512',
        includeEmbeddingStatus: false,
      });

      const config = customDeduplicator.getConfig();

      expect(config.checksumAlgorithm).toBe('sha512');
      expect(config.includeEmbeddingStatus).toBe(false);
    });
  });

  describe('hasDuplicate', () => {
    it('returns true for duplicate result with asset', () => {
      const result = {
        isDuplicate: true,
        checksum: 'abc123',
        existingAsset: {
          id: 'asset-789',
        } as db.ExistingAssetMetadata,
      };

      expect(hasDuplicate(result)).toBe(true);
    });

    it('returns false when isDuplicate is false', () => {
      const result = {
        isDuplicate: false,
        checksum: 'abc123',
      };

      expect(hasDuplicate(result)).toBe(false);
    });

    it('returns false when existingAsset is undefined', () => {
      const result = {
        isDuplicate: true, // Inconsistent state for testing
        checksum: 'abc123',
        existingAsset: undefined,
      };

      expect(hasDuplicate(result)).toBe(false);
    });

    it('narrows type when true', () => {
      const result = {
        isDuplicate: true,
        checksum: 'abc123',
        existingAsset: {
          id: 'asset-789',
          blobUrl: 'https://example.com/image.jpg',
        } as db.ExistingAssetMetadata,
      };

      if (hasDuplicate(result)) {
        // TypeScript should know existingAsset is defined here
        expect(result.existingAsset.id).toBe('asset-789');
        expect(result.existingAsset.blobUrl).toBe('https://example.com/image.jpg');
      }
    });
  });

  describe('edge cases', () => {
    it('handles empty buffer', async () => {
      vi.mocked(db.assetExists).mockResolvedValue(null);

      const emptyBuffer = Buffer.from('');
      const result = await deduplicator.checkDuplicate(mockUserId, emptyBuffer);

      expect(result.checksum).toBeDefined();
      expect(result.isDuplicate).toBe(false);
    });

    it('handles very large buffer', async () => {
      vi.mocked(db.assetExists).mockResolvedValue(null);

      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB
      const result = await deduplicator.checkDuplicate(mockUserId, largeBuffer);

      expect(result.checksum).toBeDefined();
      expect(result.checksum).toHaveLength(64);
    });

    it('handles non-Error exception in database query', async () => {
      vi.mocked(db.assetExists).mockRejectedValue('string error');

      const result = await deduplicator.checkDuplicate(mockUserId, mockBuffer);

      expect(result.isDuplicate).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});

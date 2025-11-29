import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AssetRecorderService,
  AssetRecordError,
  type AssetMetadata,
} from '@/lib/upload/asset-recorder-service';
import * as db from '@/lib/db';
import { logger } from '@/lib/logger';

// Mock dependencies
vi.mock('@/lib/db');
vi.mock('@/lib/logger');

describe('AssetRecorderService', () => {
  let recorder: AssetRecorderService;

  const mockMetadata: AssetMetadata = {
    ownerUserId: 'user-123',
    blobUrl: 'https://blob.store/image.jpg',
    thumbnailUrl: 'https://blob.store/thumb.jpg',
    pathname: 'user-123/image.jpg',
    thumbnailPath: 'user-123/thumb.jpg',
    mime: 'image/jpeg',
    width: 1024,
    height: 768,
    size: 50000,
    checksumSha256: 'abc123def456',
  };

  const mockAsset = {
    id: 'asset-789',
    ownerUserId: 'user-123',
    blobUrl: 'https://blob.store/image.jpg',
    thumbnailUrl: 'https://blob.store/thumb.jpg',
    pathname: 'user-123/image.jpg',
    thumbnailPath: 'user-123/thumb.jpg',
    mime: 'image/jpeg',
    width: 1024,
    height: 768,
    size: 50000,
    checksumSha256: 'abc123def456',
    favorite: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(() => {
    recorder = new AssetRecorderService();
    vi.clearAllMocks();

    // Mock prisma as available by default
    vi.mocked(db).prisma = {
      $transaction: vi.fn(),
    } as any;
  });

  describe('recordAsset', () => {
    it('creates asset without tags successfully', async () => {
      const mockTx = {
        asset: {
          create: vi.fn().mockResolvedValue(mockAsset),
        },
      };

      vi.mocked(db.prisma!.$transaction).mockImplementation(async (fn: any) => {
        return await fn(mockTx);
      });

      const result = await recorder.recordAsset(mockMetadata);

      expect(result.asset).toEqual(mockAsset);
      expect(result.tagsCreated).toBe(0);
      expect(result.tagsAssociated).toBe(0);
      expect(mockTx.asset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ownerUserId: mockMetadata.ownerUserId,
          checksumSha256: mockMetadata.checksumSha256,
          favorite: false,
        }),
      });
    });

    it('creates asset with tags using batch operations', async () => {
      const tags = ['nature', 'landscape', 'sunset'];

      const mockTx = {
        asset: {
          create: vi.fn().mockResolvedValue(mockAsset),
        },
        tag: {
          findMany: vi.fn().mockResolvedValue([]),
          createManyAndReturn: vi.fn().mockResolvedValue([
            { id: 'tag-1', name: 'nature' },
            { id: 'tag-2', name: 'landscape' },
            { id: 'tag-3', name: 'sunset' },
          ]),
        },
        assetTag: {
          createMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
      };

      vi.mocked(db.prisma!.$transaction).mockImplementation(async (fn: any) => {
        return await fn(mockTx);
      });

      const result = await recorder.recordAsset(mockMetadata, tags);

      expect(result.asset).toEqual(mockAsset);
      expect(result.tagsCreated).toBe(3);
      expect(result.tagsAssociated).toBe(3);

      // Verify batch operations were called
      expect(mockTx.tag.findMany).toHaveBeenCalledWith({
        where: {
          ownerUserId: mockMetadata.ownerUserId,
          name: { in: tags },
        },
        select: { id: true, name: true },
      });

      expect(mockTx.tag.createManyAndReturn).toHaveBeenCalledWith({
        data: tags.map(name => ({
          ownerUserId: mockMetadata.ownerUserId,
          name,
        })),
        select: { id: true, name: true },
      });

      expect(mockTx.assetTag.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          { assetId: mockAsset.id, tagId: 'tag-1' },
          { assetId: mockAsset.id, tagId: 'tag-2' },
          { assetId: mockAsset.id, tagId: 'tag-3' },
        ]),
        skipDuplicates: true,
      });
    });

    it('reuses existing tags (does not create duplicates)', async () => {
      const tags = ['nature', 'landscape'];

      const existingTags = [
        { id: 'existing-tag-1', name: 'nature' },
      ];

      const mockTx = {
        asset: {
          create: vi.fn().mockResolvedValue(mockAsset),
        },
        tag: {
          findMany: vi.fn().mockResolvedValue(existingTags),
          createManyAndReturn: vi.fn().mockResolvedValue([
            { id: 'tag-2', name: 'landscape' },
          ]),
        },
        assetTag: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };

      vi.mocked(db.prisma!.$transaction).mockImplementation(async (fn: any) => {
        return await fn(mockTx);
      });

      const result = await recorder.recordAsset(mockMetadata, tags);

      expect(result.tagsCreated).toBe(1); // Only created 'landscape'
      expect(result.tagsAssociated).toBe(2); // Associated both

      // Should only create new tag 'landscape'
      expect(mockTx.tag.createManyAndReturn).toHaveBeenCalledWith({
        data: [{ ownerUserId: mockMetadata.ownerUserId, name: 'landscape' }],
        select: { id: true, name: true },
      });

      // Should associate both tags (existing + new)
      expect(mockTx.assetTag.createMany).toHaveBeenCalledWith({
        data: [
          { assetId: mockAsset.id, tagId: 'existing-tag-1' },
          { assetId: mockAsset.id, tagId: 'tag-2' },
        ],
        skipDuplicates: true,
      });
    });

    it('sanitizes tags (trims whitespace, deduplicates)', async () => {
      const dirtyTags = ['  nature  ', 'nature', ' landscape ', '', 'nature'];

      const mockTx = {
        asset: {
          create: vi.fn().mockResolvedValue(mockAsset),
        },
        tag: {
          findMany: vi.fn().mockResolvedValue([]),
          createManyAndReturn: vi.fn().mockResolvedValue([
            { id: 'tag-1', name: 'nature' },
            { id: 'tag-2', name: 'landscape' },
          ]),
        },
        assetTag: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };

      vi.mocked(db.prisma!.$transaction).mockImplementation(async (fn: any) => {
        return await fn(mockTx);
      });

      const result = await recorder.recordAsset(mockMetadata, dirtyTags);

      expect(result.tagsCreated).toBe(2); // Only unique, non-empty tags
      expect(mockTx.tag.createManyAndReturn).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          { ownerUserId: mockMetadata.ownerUserId, name: 'nature' },
          { ownerUserId: mockMetadata.ownerUserId, name: 'landscape' },
        ]),
        select: { id: true, name: true },
      });
    });

    it('throws AssetRecordError when database not configured', async () => {
      vi.mocked(db).prisma = null;

      await expect(
        recorder.recordAsset(mockMetadata)
      ).rejects.toThrow(AssetRecordError);

      await expect(
        recorder.recordAsset(mockMetadata)
      ).rejects.toThrow('Database not configured');
    });

    it('throws AssetRecordError on transaction failure', async () => {
      vi.mocked(db.prisma!.$transaction).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        recorder.recordAsset(mockMetadata)
      ).rejects.toThrow(AssetRecordError);
    });

    it('logs debug message when recording asset', async () => {
      const mockTx = {
        asset: {
          create: vi.fn().mockResolvedValue(mockAsset),
        },
        tag: {
          findMany: vi.fn().mockResolvedValue([]),
          createManyAndReturn: vi.fn().mockResolvedValue([
            { id: 'tag-1', name: 'tag1' },
            { id: 'tag-2', name: 'tag2' },
          ]),
        },
        assetTag: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };

      vi.mocked(db.prisma!.$transaction).mockImplementation(async (fn: any) => {
        return await fn(mockTx);
      });

      await recorder.recordAsset(mockMetadata, ['tag1', 'tag2']);

      expect(logger.debug).toHaveBeenCalledWith(
        'Recording asset with tags',
        expect.objectContaining({
          userId: mockMetadata.ownerUserId,
          checksum: mockMetadata.checksumSha256,
          tagCount: 2,
        })
      );
    });

    it('logs success message after recording', async () => {
      const mockTx = {
        asset: {
          create: vi.fn().mockResolvedValue(mockAsset),
        },
      };

      vi.mocked(db.prisma!.$transaction).mockImplementation(async (fn: any) => {
        return await fn(mockTx);
      });

      await recorder.recordAsset(mockMetadata);

      expect(logger.info).toHaveBeenCalledWith(
        'Asset recorded successfully',
        expect.objectContaining({
          assetId: mockAsset.id,
          userId: mockMetadata.ownerUserId,
        })
      );
    });

    it('logs error on failure', async () => {
      const dbError = new Error('Database error');
      vi.mocked(db.prisma!.$transaction).mockRejectedValue(dbError);

      try {
        await recorder.recordAsset(mockMetadata);
      } catch (error) {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to record asset',
        expect.objectContaining({
          userId: mockMetadata.ownerUserId,
          error: 'Database error',
        })
      );
    });

    it('handles empty tag array', async () => {
      const mockTx = {
        asset: {
          create: vi.fn().mockResolvedValue(mockAsset),
        },
      };

      vi.mocked(db.prisma!.$transaction).mockImplementation(async (fn: any) => {
        return await fn(mockTx);
      });

      const result = await recorder.recordAsset(mockMetadata, []);

      expect(result.tagsCreated).toBe(0);
      expect(result.tagsAssociated).toBe(0);
    });

    it('handles non-string elements in tags array gracefully', async () => {
      const invalidTags = ['valid', 123 as any, null as any, 'another'];

      const mockTx = {
        asset: {
          create: vi.fn().mockResolvedValue(mockAsset),
        },
        tag: {
          findMany: vi.fn().mockResolvedValue([]),
          createManyAndReturn: vi.fn().mockResolvedValue([
            { id: 'tag-1', name: 'valid' },
            { id: 'tag-2', name: 'another' },
          ]),
        },
        assetTag: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };

      vi.mocked(db.prisma!.$transaction).mockImplementation(async (fn: any) => {
        return await fn(mockTx);
      });

      const result = await recorder.recordAsset(mockMetadata, invalidTags);

      // Should only process valid string tags
      expect(result.tagsCreated).toBe(2);
      expect(mockTx.tag.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          { ownerUserId: mockMetadata.ownerUserId, name: 'valid' },
          { ownerUserId: mockMetadata.ownerUserId, name: 'another' },
        ],
        select: { id: true, name: true },
      });
    });
  });

  describe('addTagsToAsset', () => {
    it('adds tags to existing asset', async () => {
      const tags = ['new-tag1', 'new-tag2'];

      const mockTx = {
        tag: {
          findMany: vi.fn().mockResolvedValue([]),
          createManyAndReturn: vi.fn().mockResolvedValue([
            { id: 'tag-1', name: 'new-tag1' },
            { id: 'tag-2', name: 'new-tag2' },
          ]),
        },
        assetTag: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };

      vi.mocked(db.prisma!.$transaction).mockImplementation(async (fn: any) => {
        return await fn(mockTx);
      });

      const result = await recorder.addTagsToAsset('asset-123', 'user-123', tags);

      expect(result.tagsCreated).toBe(2);
      expect(result.tagsAssociated).toBe(2);
    });

    it('returns zero counts for empty tags', async () => {
      const result = await recorder.addTagsToAsset('asset-123', 'user-123', []);

      expect(result.tagsCreated).toBe(0);
      expect(result.tagsAssociated).toBe(0);
    });

    it('throws error when database not configured', async () => {
      vi.mocked(db).prisma = null;

      await expect(
        recorder.addTagsToAsset('asset-123', 'user-123', ['tag1'])
      ).rejects.toThrow(AssetRecordError);
    });

    it('logs success message', async () => {
      const mockTx = {
        tag: {
          findMany: vi.fn().mockResolvedValue([]),
          createManyAndReturn: vi.fn().mockResolvedValue([
            { id: 'tag-1', name: 'tag1' },
          ]),
        },
        assetTag: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      vi.mocked(db.prisma!.$transaction).mockImplementation(async (fn: any) => {
        return await fn(mockTx);
      });

      await recorder.addTagsToAsset('asset-123', 'user-123', ['tag1']);

      expect(logger.info).toHaveBeenCalledWith(
        'Tags added to asset',
        expect.objectContaining({
          assetId: 'asset-123',
          tagsCreated: 1,
          tagsAssociated: 1,
        })
      );
    });
  });

  describe('AssetRecordError', () => {
    it('includes retryable flag', () => {
      const error = new AssetRecordError('Test error', true);

      expect(error.message).toBe('Test error');
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('AssetRecordError');
    });

    it('defaults retryable to false', () => {
      const error = new AssetRecordError('Test error');

      expect(error.retryable).toBe(false);
    });

    it('includes cause error', () => {
      const cause = new Error('Original error');
      const error = new AssetRecordError('Wrapper error', false, cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('batch operations (N+1 fix)', () => {
    it('uses only 3 queries for any number of tags', async () => {
      const tags = Array.from({ length: 10 }, (_, i) => `tag-${i}`);

      const mockTx = {
        asset: {
          create: vi.fn().mockResolvedValue(mockAsset),
        },
        tag: {
          findMany: vi.fn().mockResolvedValue([]),
          createManyAndReturn: vi.fn().mockResolvedValue(
            tags.map((name, i) => ({ id: `tag-${i}`, name }))
          ),
        },
        assetTag: {
          createMany: vi.fn().mockResolvedValue({ count: tags.length }),
        },
      };

      vi.mocked(db.prisma!.$transaction).mockImplementation(async (fn: any) => {
        return await fn(mockTx);
      });

      await recorder.recordAsset(mockMetadata, tags);

      // Should only call these 3 methods once each, regardless of tag count
      expect(mockTx.tag.findMany).toHaveBeenCalledTimes(1);
      expect(mockTx.tag.createManyAndReturn).toHaveBeenCalledTimes(1);
      expect(mockTx.assetTag.createMany).toHaveBeenCalledTimes(1);
    });

    it('skips tag creation if all tags exist', async () => {
      const tags = ['existing1', 'existing2'];

      const mockTx = {
        asset: {
          create: vi.fn().mockResolvedValue(mockAsset),
        },
        tag: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'tag-1', name: 'existing1' },
            { id: 'tag-2', name: 'existing2' },
          ]),
          createManyAndReturn: vi.fn(),
        },
        assetTag: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };

      vi.mocked(db.prisma!.$transaction).mockImplementation(async (fn: any) => {
        return await fn(mockTx);
      });

      const result = await recorder.recordAsset(mockMetadata, tags);

      expect(result.tagsCreated).toBe(0);
      expect(result.tagsAssociated).toBe(2);
      expect(mockTx.tag.createManyAndReturn).not.toHaveBeenCalled();
    });
  });
});

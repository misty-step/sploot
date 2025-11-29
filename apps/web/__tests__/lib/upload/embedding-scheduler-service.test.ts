import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EmbeddingSchedulerService,
  EmbeddingScheduleError,
  type EmbeddingScheduleParams,
} from '@/lib/upload/embedding-scheduler-service';
import * as db from '@/lib/db';
import * as embeddings from '@/lib/embeddings';
import { EmbeddingError } from '@/lib/embeddings';
import * as nextServer from 'next/server';

// Mock dependencies
vi.mock('next/server');
vi.mock('@/lib/db');
vi.mock('@/lib/logger');

describe('EmbeddingSchedulerService', () => {
  let service: EmbeddingSchedulerService;
  let mockPrisma: any;
  let mockUpsertAssetEmbedding: any;
  let mockCreateEmbeddingService: any;
  let mockAfter: any;

  beforeEach(() => {
    service = new EmbeddingSchedulerService();

    // Setup mock functions
    mockAfter = vi.fn((callback) => callback());
    vi.mocked(nextServer).after = mockAfter;

    mockPrisma = {
      assetEmbedding: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    };
    Object.defineProperty(vi.mocked(db), 'prisma', {
      value: mockPrisma,
      writable: true,
      configurable: true,
    });

    mockUpsertAssetEmbedding = vi.fn();
    Object.defineProperty(vi.mocked(db), 'upsertAssetEmbedding', {
      value: mockUpsertAssetEmbedding,
      writable: true,
      configurable: true,
    });

    mockCreateEmbeddingService = vi.fn();
    vi.spyOn(embeddings, 'createEmbeddingService').mockImplementation(mockCreateEmbeddingService);

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('scheduleEmbedding', () => {
    const baseParams: EmbeddingScheduleParams = {
      assetId: 'asset-123',
      blobUrl: 'https://example.com/image.jpg',
      checksum: 'abc123',
      mode: 'sync',
    };

    describe('sync mode', () => {
      it('should generate embedding synchronously and return success', async () => {
        // Setup: no existing embedding
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);

        // Setup: mock embedding service
        const mockEmbeddingService = {
          embedImage: vi.fn().mockResolvedValue({
            embedding: new Array(512).fill(0.1),
            model: 'test-model',
            dimension: 512,
          }),
        };
        mockCreateEmbeddingService.mockReturnValue(mockEmbeddingService);
        mockUpsertAssetEmbedding.mockResolvedValue(undefined);

        // Execute
        const result = await service.scheduleEmbedding(baseParams);

        // Verify
        expect(result).toEqual({
          scheduled: true,
          mode: 'sync',
          assetId: 'asset-123',
        });
        expect(mockEmbeddingService.embedImage).toHaveBeenCalledWith(
          'https://example.com/image.jpg',
          'abc123'
        );
        expect(mockUpsertAssetEmbedding).toHaveBeenCalledWith({
          assetId: 'asset-123',
          modelName: 'test-model',
          modelVersion: 'test-model',
          dim: 512,
          embedding: expect.any(Array),
        });
        expect(mockAfter).not.toHaveBeenCalled();
      });

      it('should skip if embedding already exists', async () => {
        // Setup: existing embedding
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue({
          id: 'embedding-1',
          assetId: 'asset-123',
        });

        // Execute
        const result = await service.scheduleEmbedding(baseParams);

        // Verify
        expect(result).toEqual({
          scheduled: true,
          mode: 'sync',
          assetId: 'asset-123',
        });
        expect(mockUpsertAssetEmbedding).not.toHaveBeenCalled();
      });

      it('should throw EmbeddingScheduleError on embedding service init failure', async () => {
        // Setup
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        mockCreateEmbeddingService.mockImplementation(() => {
          throw new Error('API key missing');
        });
        mockPrisma.assetEmbedding.upsert.mockResolvedValue({});

        // Execute & Verify
        await expect(service.scheduleEmbedding(baseParams)).rejects.toThrow(
          EmbeddingScheduleError
        );
        await expect(service.scheduleEmbedding(baseParams)).rejects.toThrow(
          'Failed to initialize embedding service'
        );

        // Verify failure was marked in DB
        expect(mockPrisma.assetEmbedding.upsert).toHaveBeenCalledWith({
          where: { assetId: 'asset-123' },
          create: expect.objectContaining({
            assetId: 'asset-123',
            status: 'failed',
            error: 'Failed to initialize embedding service',
          }),
          update: expect.objectContaining({
            status: 'failed',
            error: 'Failed to initialize embedding service',
          }),
        });
      });

      it('should throw EmbeddingScheduleError on embedding generation failure', async () => {
        // Setup
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        const mockEmbeddingService = {
          embedImage: vi.fn().mockRejectedValue(
            new EmbeddingError('API rate limit exceeded', 429, true)
          ),
        };
        mockCreateEmbeddingService.mockReturnValue(mockEmbeddingService);
        mockPrisma.assetEmbedding.upsert.mockResolvedValue({});

        // Execute & Verify
        await expect(service.scheduleEmbedding(baseParams)).rejects.toThrow(
          EmbeddingScheduleError
        );

        const error = await service
          .scheduleEmbedding(baseParams)
          .catch((e) => e);
        expect(error).toBeInstanceOf(EmbeddingScheduleError);
        expect(error.retryable).toBe(true);

        // Verify failure was marked in DB
        expect(mockPrisma.assetEmbedding.upsert).toHaveBeenCalledWith({
          where: { assetId: 'asset-123' },
          create: expect.objectContaining({
            status: 'failed',
            error: 'API rate limit exceeded',
          }),
          update: expect.objectContaining({
            status: 'failed',
            error: 'API rate limit exceeded',
          }),
        });
      });

      it('should handle database unavailable gracefully', async () => {
        // Setup: no database
        const originalPrisma = vi.mocked(db).prisma;
        Object.defineProperty(vi.mocked(db), 'prisma', {
          value: null,
          writable: true,
          configurable: true,
        });

        // Execute
        const result = await service.scheduleEmbedding(baseParams);

        // Verify: succeeds but skips generation
        expect(result).toEqual({
          scheduled: true,
          mode: 'sync',
          assetId: 'asset-123',
        });
        expect(mockUpsertAssetEmbedding).not.toHaveBeenCalled();

        // Restore
        Object.defineProperty(vi.mocked(db), 'prisma', {
          value: originalPrisma,
          writable: true,
          configurable: true,
        });
      });
    });

    describe('async mode', () => {
      it('should schedule embedding asynchronously and call after()', async () => {
        // Setup
        const asyncParams = { ...baseParams, mode: 'async' as const };
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);

        const mockEmbeddingService = {
          embedImage: vi.fn().mockResolvedValue({
            embedding: new Array(512).fill(0.1),
            model: 'test-model',
            dimension: 512,
          }),
        };
        mockCreateEmbeddingService.mockReturnValue(mockEmbeddingService);
        mockUpsertAssetEmbedding.mockResolvedValue(undefined);

        // Execute
        const result = await service.scheduleEmbedding(asyncParams);

        // Verify: returns immediately
        expect(result).toEqual({
          scheduled: true,
          mode: 'async',
          assetId: 'asset-123',
        });

        // Verify: after() was called with a function
        expect(mockAfter).toHaveBeenCalledWith(expect.any(Function));
      });

      it('should handle async errors gracefully without throwing', async () => {
        // Setup
        const asyncParams = { ...baseParams, mode: 'async' as const };
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        mockCreateEmbeddingService.mockImplementation(() => {
          throw new Error('Service unavailable');
        });
        mockPrisma.assetEmbedding.upsert.mockResolvedValue({});

        // Execute: should not throw
        const result = await service.scheduleEmbedding(asyncParams);

        // Verify: returns success despite error
        expect(result).toEqual({
          scheduled: true,
          mode: 'async',
          assetId: 'asset-123',
        });

        // Verify: error was marked in DB
        expect(mockPrisma.assetEmbedding.upsert).toHaveBeenCalled();
      });

      it('should skip if embedding exists in async mode', async () => {
        // Setup
        const asyncParams = { ...baseParams, mode: 'async' as const };
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue({
          id: 'embedding-1',
          assetId: 'asset-123',
        });

        // Execute
        const result = await service.scheduleEmbedding(asyncParams);

        // Verify
        expect(result).toEqual({
          scheduled: true,
          mode: 'async',
          assetId: 'asset-123',
        });
        expect(mockAfter).toHaveBeenCalled();
        expect(mockUpsertAssetEmbedding).not.toHaveBeenCalled();
      });
    });

    describe('error handling edge cases', () => {
      it('should handle non-Error exceptions in embedding generation', async () => {
        // Setup
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        const mockEmbeddingService = {
          embedImage: vi.fn().mockRejectedValue('String error'),
        };
        mockCreateEmbeddingService.mockReturnValue(mockEmbeddingService);
        mockPrisma.assetEmbedding.upsert.mockResolvedValue({});

        // Execute & Verify
        await expect(service.scheduleEmbedding(baseParams)).rejects.toThrow(
          EmbeddingScheduleError
        );

        // Verify failure marked with generic message
        expect(mockPrisma.assetEmbedding.upsert).toHaveBeenCalledWith({
          where: { assetId: 'asset-123' },
          create: expect.objectContaining({
            status: 'failed',
            error: 'Unknown error',
          }),
          update: expect.objectContaining({
            status: 'failed',
          }),
        });
      });

      it('should handle DB upsert failure during error marking', async () => {
        // Setup
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        mockCreateEmbeddingService.mockImplementation(() => {
          throw new Error('Service error');
        });
        mockPrisma.assetEmbedding.upsert.mockRejectedValue(
          new Error('DB connection lost')
        );

        // Execute: should still throw original error
        await expect(service.scheduleEmbedding(baseParams)).rejects.toThrow(
          EmbeddingScheduleError
        );

        // Verify: doesn't crash on DB failure
        expect(mockPrisma.assetEmbedding.upsert).toHaveBeenCalled();
      });

      it('should handle null prisma during error marking', async () => {
        // Setup
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        mockCreateEmbeddingService.mockImplementation(() => {
          throw new Error('Service error');
        });

        // Temporarily null out prisma after initial check
        let callCount = 0;
        const originalPrisma = vi.mocked(db).prisma;
        Object.defineProperty(vi.mocked(db), 'prisma', {
          get: () => {
            callCount++;
            return callCount === 1 ? originalPrisma : null;
          },
          configurable: true,
        });

        // Execute: should handle gracefully
        await expect(service.scheduleEmbedding(baseParams)).rejects.toThrow(
          EmbeddingScheduleError
        );

        // Restore
        Object.defineProperty(vi.mocked(db), 'prisma', {
          value: originalPrisma,
          configurable: true,
        });
      });
    });

    describe('integration scenarios', () => {
      it('should handle full successful flow with model metadata', async () => {
        // Setup
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        const mockEmbedding = new Array(768).fill(0.5);
        const mockEmbeddingService = {
          embedImage: vi.fn().mockResolvedValue({
            embedding: mockEmbedding,
            model: 'siglip-base-patch16-384',
            dimension: 768,
          }),
        };
        mockCreateEmbeddingService.mockReturnValue(mockEmbeddingService);
        mockUpsertAssetEmbedding.mockResolvedValue(undefined);

        // Execute
        const result = await service.scheduleEmbedding(baseParams);

        // Verify complete flow
        expect(result.scheduled).toBe(true);
        expect(mockPrisma.assetEmbedding.findUnique).toHaveBeenCalledWith({
          where: { assetId: 'asset-123' },
        });
        expect(mockEmbeddingService.embedImage).toHaveBeenCalledWith(
          'https://example.com/image.jpg',
          'abc123'
        );
        expect(mockUpsertAssetEmbedding).toHaveBeenCalledWith({
          assetId: 'asset-123',
          modelName: 'siglip-base-patch16-384',
          modelVersion: 'siglip-base-patch16-384',
          dim: 768,
          embedding: mockEmbedding,
        });
      });

      it('should preserve retryable flag from EmbeddingError', async () => {
        // Setup: retryable error
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        const mockEmbeddingService = {
          embedImage: vi
            .fn()
            .mockRejectedValue(new EmbeddingError('Temporary failure', 500, true)),
        };
        mockCreateEmbeddingService.mockReturnValue(mockEmbeddingService);
        mockPrisma.assetEmbedding.upsert.mockResolvedValue({});

        // Execute
        const error = await service
          .scheduleEmbedding(baseParams)
          .catch((e) => e);

        // Verify retryable flag preserved
        expect(error).toBeInstanceOf(EmbeddingScheduleError);
        expect(error.retryable).toBe(true);
      });

      it('should mark non-retryable for non-EmbeddingError exceptions', async () => {
        // Setup: generic error
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        const mockEmbeddingService = {
          embedImage: vi.fn().mockRejectedValue(new Error('Unknown error')),
        };
        mockCreateEmbeddingService.mockReturnValue(mockEmbeddingService);
        mockPrisma.assetEmbedding.upsert.mockResolvedValue({});

        // Execute
        const error = await service
          .scheduleEmbedding(baseParams)
          .catch((e) => e);

        // Verify not retryable
        expect(error).toBeInstanceOf(EmbeddingScheduleError);
        expect(error.retryable).toBe(false);
      });
    });
  });
});

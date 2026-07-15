import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EmbeddingSchedulerService,
  EmbeddingScheduleError,
  type EmbeddingScheduleParams,
} from '@/lib/upload/embedding-scheduler-service';
import * as db from '@/lib/db';
import * as embeddings from '@/lib/embeddings';
import { EMBEDDING_DIMENSION } from '@sploot/common';
import { EmbeddingAdmissionError, EmbeddingError } from '@/lib/embeddings';
import { EmbeddingProviderCircuitOpenError } from '@/lib/embedding-errors';
import * as nextServer from 'next/server';
import { acquireEmbeddingProcessing } from '@/lib/embedding-guard';

const PROCESSING_CLAIM_UPDATED_AT = new Date('2026-07-10T00:00:00Z');

// Mock dependencies
vi.mock('next/server');
vi.mock('@/lib/db');
vi.mock('@/lib/logger');
vi.mock('@/lib/embedding-guard', async () => {
  const actual = await vi.importActual<any>('@/lib/embedding-guard');
  return {
    ...actual,
    acquireEmbeddingProcessing: vi.fn().mockResolvedValue({
      acquired: true,
      state: 'processing',
    }),
  };
});

describe('EmbeddingSchedulerService', () => {
  let service: EmbeddingSchedulerService;
  let mockPrisma: any;
  let mockUpsertAssetEmbedding: any;
  let mockCreateEmbeddingService: any;
  let mockAfter: any;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new EmbeddingSchedulerService();

    // Setup mock functions
    mockAfter = vi.fn((callback) => callback());
    vi.mocked(nextServer).after = mockAfter;

    mockPrisma = {
      assetEmbedding: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
    vi.spyOn(embeddings, 'createEmbeddingService').mockImplementation(
      mockCreateEmbeddingService
    );
    vi.mocked(acquireEmbeddingProcessing).mockResolvedValue({
      acquired: true,
      state: 'processing',
      updatedAt: PROCESSING_CLAIM_UPDATED_AT,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('scheduleEmbedding', () => {
    const baseParams: EmbeddingScheduleParams = {
      assetId: 'asset-123',
      blobUrl: 'https://example.com/image.jpg',
      mime: 'image/jpeg',
      thumbnailUrl: null,
      checksum: 'abc123',
      mode: 'sync',
      ownerUserId: 'user-123',
    };

    describe('sync mode', () => {
      it('should generate embedding synchronously and return success', async () => {
        // Setup: no existing embedding
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);

        // Setup: mock embedding service
        const mockEmbeddingService = {
          embedImage: vi.fn().mockResolvedValue({
            embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
            model: 'test-model',
            dimension: EMBEDDING_DIMENSION,
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
        expect(mockUpsertAssetEmbedding).toHaveBeenCalledWith(
          {
            assetId: 'asset-123',
            modelName: 'test-model',
            modelVersion: 'test-model',
            dim: EMBEDDING_DIMENSION,
            embedding: expect.any(Array),
          },
          PROCESSING_CLAIM_UPDATED_AT,
        );
        expect(mockAfter).not.toHaveBeenCalled();
      });

      it('should skip if embedding already exists', async () => {
        // Setup: existing embedding
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue({
          id: 'embedding-1',
          assetId: 'asset-123',
          status: 'ready',
          completedAt: new Date(),
          updatedAt: new Date(),
          dim: EMBEDDING_DIMENSION,
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

      it('should skip when embedding lock is unavailable', async () => {
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        vi.mocked(acquireEmbeddingProcessing).mockResolvedValue({
          acquired: false,
          state: 'unavailable',
        });

        const result = await service.scheduleEmbedding(baseParams);

        expect(result).toEqual({
          scheduled: true,
          mode: 'sync',
          assetId: 'asset-123',
        });
        expect(mockCreateEmbeddingService).not.toHaveBeenCalled();
        expect(mockUpsertAssetEmbedding).not.toHaveBeenCalled();
      });

      it('should bind provider admission to the asset owner', async () => {
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        const mockEmbeddingService = {
          embedImage: vi.fn().mockResolvedValue({
            embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
            model: 'test-model',
            dimension: EMBEDDING_DIMENSION,
          }),
        };
        mockCreateEmbeddingService.mockReturnValue(mockEmbeddingService);
        mockUpsertAssetEmbedding.mockResolvedValue(undefined);

        await service.scheduleEmbedding(baseParams);

        expect(mockCreateEmbeddingService).toHaveBeenCalledWith('user-123');
      });

      it('uses a video poster and terminal-skips video without one before admission', async () => {
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        mockPrisma.assetEmbedding.upsert.mockResolvedValue({});
        const videoService = {
          embedImage: vi.fn().mockResolvedValue({
            embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
            model: 'test-model',
            dimension: EMBEDDING_DIMENSION,
          }),
        };
        mockCreateEmbeddingService.mockReturnValue(videoService);

        const posterResult = await service.scheduleEmbedding({
          ...baseParams,
          assetId: 'video-asset',
          blobUrl: 'https://example.com/raw.mp4',
          mime: 'video/mp4',
          thumbnailUrl: 'https://example.com/poster.jpg',
        });

        expect(posterResult).toEqual({
          scheduled: true,
          mode: 'sync',
          assetId: 'video-asset',
        });
        expect(videoService.embedImage).toHaveBeenCalledWith(
          'https://example.com/poster.jpg',
          'abc123'
        );

        vi.clearAllMocks();
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        mockPrisma.assetEmbedding.upsert.mockResolvedValue({});

        const skippedResult = await service.scheduleEmbedding({
          ...baseParams,
          assetId: 'video-terminal-skip',
          blobUrl: 'https://example.com/raw.webm',
          mime: 'video/webm',
          thumbnailUrl: null,
        });

        expect(skippedResult).toEqual({
          scheduled: false,
          mode: 'sync',
          assetId: 'video-terminal-skip',
          reason: 'video_without_poster',
        });
        expect(mockCreateEmbeddingService).not.toHaveBeenCalled();
        expect(mockPrisma.assetEmbedding.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { assetId: 'video-terminal-skip' },
            create: expect.objectContaining({
              assetId: 'video-terminal-skip',
              status: 'failed',
              terminalAt: expect.any(Date),
            }),
            update: expect.objectContaining({
              status: 'failed',
              terminalAt: expect.any(Date),
              nextAttemptAt: null,
            }),
          })
        );
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
          'Embedding generation deferred: Embedding service initialization failed'
        );

        // Initialization failures use the same retryable durable transition as
        // execution failures. The legacy mock has no $queryRaw resilience
        // client, so the compatibility fallback keeps the placeholder
        // discoverable instead of stranding it as failed.
        expect(mockPrisma.assetEmbedding.updateMany).toHaveBeenCalledWith({
          where: {
            assetId: 'asset-123',
            status: 'processing',
            updatedAt: PROCESSING_CLAIM_UPDATED_AT,
          },
          data: expect.objectContaining({
            status: 'pending',
            error: 'Embedding service initialization failed',
          }),
        });
      });

      it('should throw EmbeddingScheduleError on embedding generation failure', async () => {
        // Setup
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        const mockEmbeddingService = {
          embedImage: vi
            .fn()
            .mockRejectedValue(
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

        // Retryable provider failures remain discoverable by cron.
        expect(mockPrisma.assetEmbedding.updateMany).toHaveBeenCalledWith({
          where: {
            assetId: 'asset-123',
            status: 'processing',
            updatedAt: PROCESSING_CLAIM_UPDATED_AT,
          },
          data: expect.objectContaining({
            status: 'pending',
            error: 'API rate limit exceeded',
          }),
        });
      });

      it('preserves typed admission status and retry metadata through sync scheduling', async () => {
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        const admission = new EmbeddingAdmissionError('daily_budget', 3600);
        mockCreateEmbeddingService.mockReturnValue({
          embedImage: vi.fn().mockRejectedValue(admission),
        });
        mockPrisma.assetEmbedding.upsert.mockResolvedValue({});

        const error = await service.scheduleEmbedding(baseParams).catch((e) => e);

        expect(error).toBeInstanceOf(EmbeddingScheduleError);
        expect(error).toMatchObject({
          statusCode: 429,
          retryable: true,
          retryAfterSec: 3600,
          reason: 'daily_budget',
          cause: admission,
        });
      });

      it('does not issue a legacy pending write after durable admission deferral succeeds', async () => {
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        mockPrisma.$executeRaw = vi.fn().mockResolvedValue(1);
        mockCreateEmbeddingService.mockReturnValue({
          embedImage: vi.fn().mockRejectedValue(new EmbeddingAdmissionError('daily_budget', 3600)),
        });

        const error = await service.scheduleEmbedding(baseParams).catch((e) => e);

        expect(error).toBeInstanceOf(EmbeddingScheduleError);
        expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce();
        expect(mockPrisma.assetEmbedding.upsert).not.toHaveBeenCalled();
      });

      it('does not issue a legacy pending write after durable circuit deferral succeeds', async () => {
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        mockPrisma.$executeRaw = vi.fn().mockResolvedValue(1);
        mockCreateEmbeddingService.mockReturnValue({
          embedImage: vi.fn().mockRejectedValue(new EmbeddingProviderCircuitOpenError(30)),
        });

        const error = await service.scheduleEmbedding(baseParams).catch((e) => e);

        expect(error).toBeInstanceOf(EmbeddingScheduleError);
        expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce();
        expect(mockPrisma.assetEmbedding.upsert).not.toHaveBeenCalled();
      });

      it('uses the legacy pending write only when durable admission deferral fails', async () => {
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        mockPrisma.$executeRaw = vi.fn().mockRejectedValue(new Error('migration unavailable'));
        mockCreateEmbeddingService.mockReturnValue({
          embedImage: vi.fn().mockRejectedValue(new EmbeddingAdmissionError('daily_budget', 3600)),
        });
        mockPrisma.assetEmbedding.upsert.mockResolvedValue({});

        const error = await service.scheduleEmbedding(baseParams).catch((e) => e);

        expect(error).toBeInstanceOf(EmbeddingScheduleError);
        expect(mockPrisma.assetEmbedding.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              assetId: 'asset-123',
              status: 'processing',
              updatedAt: PROCESSING_CLAIM_UPDATED_AT,
            }),
            data: expect.objectContaining({ status: 'pending' }),
          }),
        );
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
        expect(result).toMatchObject({
          scheduled: false,
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
            embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
            model: 'test-model',
            dimension: EMBEDDING_DIMENSION,
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
        const afterResult =
          mockAfter.mock.results[mockAfter.mock.results.length - 1]?.value;
        if (afterResult instanceof Promise) {
          await afterResult;
        }
        expect(mockPrisma.assetEmbedding.updateMany).toHaveBeenCalled();
      });

      it('should leave admission-denied async work pending for cron recovery', async () => {
        const asyncParams = { ...baseParams, mode: 'async' as const };
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        mockCreateEmbeddingService.mockReturnValue({
          embedImage: vi
            .fn()
            .mockRejectedValue(new EmbeddingAdmissionError('daily_budget', 3600)),
        });
        mockPrisma.assetEmbedding.upsert.mockResolvedValue({});

        await service.scheduleEmbedding(asyncParams);
        const afterResult = mockAfter.mock.results.at(-1)?.value;
        if (afterResult instanceof Promise) {
          await afterResult;
        }

        expect(mockPrisma.assetEmbedding.updateMany).toHaveBeenCalledWith({
          where: {
            assetId: 'asset-123',
            status: 'processing',
            updatedAt: PROCESSING_CLAIM_UPDATED_AT,
          },
          data: expect.objectContaining({
            status: 'pending',
          }),
        });
        expect(JSON.stringify(mockPrisma.assetEmbedding.updateMany.mock.calls)).not.toContain(
          '"status":"failed"'
        );
      });

      it('should skip if embedding exists in async mode', async () => {
        // Setup
        const asyncParams = { ...baseParams, mode: 'async' as const };
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue({
          id: 'embedding-1',
          assetId: 'asset-123',
          status: 'ready',
          completedAt: new Date(),
          updatedAt: new Date(),
          dim: EMBEDDING_DIMENSION,
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
        expect(mockPrisma.assetEmbedding.updateMany).toHaveBeenCalledWith({
          where: {
            assetId: 'asset-123',
            status: 'processing',
            updatedAt: PROCESSING_CLAIM_UPDATED_AT,
          },
          data: expect.objectContaining({
            status: 'failed',
            error: 'Unknown error',
          }),
        });
      });

      it('should handle a fenced DB update failure during error marking', async () => {
        // Setup
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        mockCreateEmbeddingService.mockImplementation(() => {
          throw new Error('Service error');
        });
        mockPrisma.assetEmbedding.updateMany.mockRejectedValue(
          new Error('DB connection lost')
        );

        // Execute: should still throw original error
        await expect(service.scheduleEmbedding(baseParams)).rejects.toThrow(
          EmbeddingScheduleError
        );

        // Verify: doesn't crash on DB failure
        expect(mockPrisma.assetEmbedding.updateMany).toHaveBeenCalled();
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
        const mockEmbedding = new Array(EMBEDDING_DIMENSION).fill(0.5);
        const mockEmbeddingService = {
          embedImage: vi.fn().mockResolvedValue({
            embedding: mockEmbedding,
            model: 'siglip-base-patch16-384',
            dimension: EMBEDDING_DIMENSION,
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
        expect(mockUpsertAssetEmbedding).toHaveBeenCalledWith(
          {
            assetId: 'asset-123',
            modelName: 'siglip-base-patch16-384',
            modelVersion: 'siglip-base-patch16-384',
            dim: EMBEDDING_DIMENSION,
            embedding: mockEmbedding,
          },
          PROCESSING_CLAIM_UPDATED_AT,
        );
      });

      it('should preserve retryable flag from EmbeddingError', async () => {
        // Setup: retryable error
        mockPrisma.assetEmbedding.findUnique.mockResolvedValue(null);
        const mockEmbeddingService = {
          embedImage: vi
            .fn()
            .mockRejectedValue(
              new EmbeddingError('Temporary failure', 500, true)
            ),
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

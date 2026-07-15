import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/process-embeddings/route';
import { NextRequest } from 'next/server';
import { EMBEDDING_DIMENSION } from '@sploot/common';
import {
  EmbeddingProviderCircuitOpenError,
  EmbeddingProviderRateLimitError,
} from '@/lib/embedding-errors';

// Mock next/headers
const mockHeaders = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

// Mock lib/db
const mockPrisma = {
  asset: {
    findMany: vi.fn(),
  },
  assetEmbedding: {
    upsert: vi.fn(),
  },
};

const mockUpsertAssetEmbedding = vi.fn();
const mockAcquireEmbeddingProcessing = vi.fn();
const mockGetEmbeddingProviderCircuit = vi.fn();
const mockRecordEmbeddingAdmissionFailure = vi.fn();
const mockDeferEmbeddingAdmission = vi.fn();
const mockRecordEmbeddingAttemptFailure = vi.fn();
const mockResetEmbeddingProviderCircuit = vi.fn();
const mockMarkEmbeddingTerminalSkipped = vi.fn();
const PROCESSING_CLAIM_UPDATED_AT = new Date('2026-07-10T00:00:00Z');
let mockDatabaseAvailable = true;

vi.mock('@/lib/db', () => ({
  get prisma() {
    return mockDatabaseAvailable ? mockPrisma : null;
  },
  get databaseAvailable() {
    return mockDatabaseAvailable;
  },
  upsertAssetEmbedding: (...args: unknown[]) => mockUpsertAssetEmbedding(...args),
}));

vi.mock('@/lib/embedding-guard', () => ({
  EMBEDDING_PROCESSING_TTL_MS: 10 * 60 * 1000,
  acquireEmbeddingProcessing: () => mockAcquireEmbeddingProcessing(),
  markEmbeddingTerminalSkipped: (...args: unknown[]) =>
    mockMarkEmbeddingTerminalSkipped(...args),
}));

vi.mock('@/lib/embedding-resilience', () => ({
  getEmbeddingAdmissionReason: (error: unknown) =>
    error && typeof error === 'object' && 'reason' in error && typeof error.reason === 'string'
      ? error.reason
      : 'provider_rate_limit',
  isGlobalEmbeddingAdmissionReason: (reason: string) =>
    ['global_rate', 'global_concurrency', 'daily_budget', 'limiter_unavailable', 'provider_rate_limit'].includes(reason),
  getEmbeddingProviderCircuit: () => mockGetEmbeddingProviderCircuit(),
  recordEmbeddingAdmissionFailure: (...args: unknown[]) =>
    mockRecordEmbeddingAdmissionFailure(...args),
  deferEmbeddingAdmission: (...args: unknown[]) =>
    mockDeferEmbeddingAdmission(...args),
  recordEmbeddingAttemptFailure: (...args: unknown[]) =>
    mockRecordEmbeddingAttemptFailure(...args),
  resetEmbeddingProviderCircuit: () => mockResetEmbeddingProviderCircuit(),
  isEmbeddingAdmissionFailure: (error: unknown) =>
    error instanceof Error && error.name === 'EmbeddingAdmissionError',
}));

// Mock lib/embeddings
const mockEmbedImage = vi.fn();
const mockCreateEmbeddingService = vi.fn();

vi.mock('@/lib/embeddings', () => ({
  createEmbeddingService: () => mockCreateEmbeddingService(),
  EmbeddingError: class EmbeddingError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'EmbeddingError';
    }
  },
}));

describe('/api/cron/process-embeddings', () => {
  const CRON_SECRET = 'test-cron-secret';
  const ONE_HOUR_MS = 60 * 60 * 1000;

  // Helper to create a date N hours ago
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

  beforeEach(() => {
    // Set up environment
    process.env.CRON_SECRET = CRON_SECRET;
    mockDatabaseAvailable = true;

    // Reset all mocks
    vi.clearAllMocks();

    mockGetEmbeddingProviderCircuit.mockResolvedValue({
      available: true,
      open: false,
    });
    mockAcquireEmbeddingProcessing.mockResolvedValue({
      acquired: true,
      state: 'processing',
      updatedAt: PROCESSING_CLAIM_UPDATED_AT,
    });
    mockRecordEmbeddingAdmissionFailure.mockResolvedValue({
      available: true,
      open: true,
      retryAfterSec: 30,
    });
    mockRecordEmbeddingAttemptFailure.mockResolvedValue({
      attemptCount: 1,
      terminal: false,
      nextAttemptAt: new Date(),
    });

    // Default mock: return valid headers
    mockHeaders.mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'authorization') return `Bearer ${CRON_SECRET}`;
        return null;
      }),
    });

    // Default: embedding service succeeds
    mockCreateEmbeddingService.mockReturnValue({
      embedImage: mockEmbedImage,
    });

    mockEmbedImage.mockResolvedValue({
      embedding: Array(EMBEDDING_DIMENSION).fill(0.1),
      model: 'siglip-large',
      dimension: EMBEDDING_DIMENSION,
      processingTime: 100,
    });

    // Default: upsert succeeds
    mockUpsertAssetEmbedding.mockResolvedValue({
      id: 'embedding-123',
      assetId: 'asset-123',
      imageEmbedding: Array(EMBEDDING_DIMENSION).fill(0.1),
      createdAt: new Date(),
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  describe('Authentication', () => {
    it('should return 500 when CRON_SECRET is not configured', async () => {
      delete process.env.CRON_SECRET;

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('CRON_SECRET not configured');
    });

    it('should return 401 when authorization header is missing', async () => {
      mockHeaders.mockReturnValue({
        get: vi.fn(() => null),
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 when authorization header is incorrect', async () => {
      mockHeaders.mockReturnValue({
        get: vi.fn((key: string) => {
          if (key === 'authorization') return 'Bearer wrong-secret';
          return null;
        }),
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 503 when database is unavailable', async () => {
      mockDatabaseAvailable = false;

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('Database unavailable');
    });
  });

  describe('Asset Discovery', () => {
    it('should return success when no assets need processing', async () => {
      mockPrisma.asset.findMany.mockResolvedValue([]);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.outcome).toBe('no_work');
      expect(data.status).toBe('idle');
      expect(data.message).toBe('No assets need processing');
      expect(data.stats.totalProcessed).toBe(0);
      expect(data.stats.successCount).toBe(0);
      expect(data.stats.failureCount).toBe(0);
    });

    it('should find assets older than 1 hour with no embedding', async () => {
      mockPrisma.asset.findMany.mockResolvedValue([]);

      await GET({} as NextRequest);

      // Verify the query includes correct filtering
      const callArgs = mockPrisma.asset.findMany.mock.calls[0][0];
      expect(callArgs.where.deletedAt).toBe(null);
      expect(callArgs.where.OR).toEqual(
        expect.arrayContaining([
          { embedding: null },
          {
            embedding: {
              is: {
                status: 'pending',
                OR: [
                  { nextAttemptAt: null },
                  { nextAttemptAt: { lte: expect.any(Date) } },
                ],
              },
            },
          },
          {
            embedding: {
              is: {
                status: 'processing',
                updatedAt: { lt: expect.any(Date) },
              },
            },
          },
        ])
      );
      expect(callArgs.where.createdAt.lt).toBeInstanceOf(Date);

      // Verify the cutoff is approximately 1 hour ago (within 1 second tolerance)
      const oneHourAgo = Date.now() - ONE_HOUR_MS;
      const cutoffTime = callArgs.where.createdAt.lt.getTime();
      expect(Math.abs(cutoffTime - oneHourAgo)).toBeLessThan(1000);
    });

    it('should process batch of 10 assets maximum', async () => {
      mockPrisma.asset.findMany.mockResolvedValue([]);

      await GET({} as NextRequest);

      // Verify the query includes batch size limit
      const callArgs = mockPrisma.asset.findMany.mock.calls[0][0];
      expect(callArgs.take).toBe(10);
    });

    it('should process oldest assets first', async () => {
      mockPrisma.asset.findMany.mockResolvedValue([]);

      await GET({} as NextRequest);

      // Verify the query orders by createdAt ascending
      const callArgs = mockPrisma.asset.findMany.mock.calls[0][0];
      expect(callArgs.orderBy).toEqual({ createdAt: 'asc' });
    });
  });

  describe('Embedding Processing', () => {
    it('should successfully process assets and generate embeddings', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          blobUrl: 'https://blob.vercel-storage.com/img-1.jpg',
          checksumSha256: 'checksum-1',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
        {
          id: 'asset-2',
          blobUrl: 'https://blob.vercel-storage.com/img-2.jpg',
          checksumSha256: 'checksum-2',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(3),
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats.totalProcessed).toBe(2);
      expect(data.stats.successCount).toBe(2);
      expect(data.stats.failureCount).toBe(0);

      // Verify embedding service was called for each asset
      expect(mockEmbedImage).toHaveBeenCalledTimes(2);
      expect(mockEmbedImage).toHaveBeenCalledWith(
        'https://blob.vercel-storage.com/img-1.jpg',
        'checksum-1'
      );
      expect(mockEmbedImage).toHaveBeenCalledWith(
        'https://blob.vercel-storage.com/img-2.jpg',
        'checksum-2'
      );

      // Verify embeddings were stored
      expect(mockUpsertAssetEmbedding).toHaveBeenCalledTimes(2);
    });

    it('uses the poster thumbnail for video assets and terminal-skips video without one', async () => {
      const posterAsset = {
        id: 'video-asset',
        blobUrl: 'https://blob.vercel-storage.com/raw.mp4',
        thumbnailUrl: 'https://blob.vercel-storage.com/poster.jpg',
        mime: 'video/mp4',
        checksumSha256: 'checksum-video',
        ownerUserId: 'user-1',
        createdAt: hoursAgo(2),
      };

      mockPrisma.asset.findMany.mockResolvedValue([posterAsset]);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats.successCount).toBe(1);
      expect(mockEmbedImage).toHaveBeenCalledWith(
        'https://blob.vercel-storage.com/poster.jpg',
        'checksum-video'
      );

      mockEmbedImage.mockReset();
      mockPrisma.asset.findMany.mockResolvedValue([
        {
          ...posterAsset,
          id: 'video-skip',
          thumbnailUrl: null,
          checksumSha256: 'checksum-skip',
        },
      ]);
      mockPrisma.assetEmbedding.upsert.mockResolvedValue({});

      const skipResponse = await GET({} as NextRequest);
      const skipData = await skipResponse.json();

      expect(skipResponse.status).toBe(207);
      expect(skipData.stats.skippedCount).toBe(1);
      expect(mockEmbedImage).not.toHaveBeenCalled();
      expect(mockMarkEmbeddingTerminalSkipped).toHaveBeenCalledWith(
        'video-skip',
        'Unsupported video without a poster thumbnail'
      );
    });

    it('should call upsertAssetEmbedding with correct parameters', async () => {
      const mockAssets = [
        {
          id: 'asset-123',
          blobUrl: 'https://blob.vercel-storage.com/test.jpg',
          checksumSha256: 'test-checksum',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      await GET({} as NextRequest);

      // Verify upsertAssetEmbedding was called
      expect(mockUpsertAssetEmbedding).toHaveBeenCalledTimes(1);
    });

    it('should handle embedding generation failure', async () => {
      const mockAssets = [
        {
          id: 'asset-fail',
          blobUrl: 'https://blob.vercel-storage.com/fail.jpg',
          checksumSha256: 'checksum-fail',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);
      mockEmbedImage.mockRejectedValue(new Error('Embedding generation failed'));

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.totalProcessed).toBe(1);
      expect(data.stats.successCount).toBe(0);
      expect(data.stats.failureCount).toBe(1);
      expect(data.stats.errors).toHaveLength(1);
      expect(data.stats.errors[0]).toEqual({
        assetId: 'asset-fail',
        error: 'Embedding generation failed',
        taxonomy: 'Error',
      });

      consoleErrorSpy.mockRestore();
    });

    it('should continue processing after single asset failure', async () => {
      const mockAssets = [
        {
          id: 'asset-fail',
          blobUrl: 'https://blob.vercel-storage.com/fail.jpg',
          checksumSha256: 'checksum-fail',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(3),
        },
        {
          id: 'asset-success',
          blobUrl: 'https://blob.vercel-storage.com/success.jpg',
          checksumSha256: 'checksum-success',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      // First fails, second succeeds
      mockEmbedImage
        .mockRejectedValueOnce(new Error('Generation failed'))
        .mockResolvedValueOnce({
          embedding: Array(EMBEDDING_DIMENSION).fill(0.2),
          model: 'siglip-large',
          dimension: EMBEDDING_DIMENSION,
          processingTime: 100,
        });

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.totalProcessed).toBe(2);
      expect(data.stats.successCount).toBe(1);
      expect(data.stats.failureCount).toBe(1);

      // Both should have been attempted
      expect(mockEmbedImage).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });

    it('should stop admitting work while the durable provider circuit is open', async () => {
      mockGetEmbeddingProviderCircuit.mockResolvedValue({
        available: true,
        open: true,
        retryAfterSec: 42,
        reason: 'global_rate',
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.outcome).toBe('backoff');
      expect(data.status).toBe('provider_backoff');
      expect(response.headers.get('Retry-After')).toBe('42');
      expect(data.message).toBe('Embedding provider backoff active');
      expect(data.retryAfterSec).toBe(42);
      expect(data.stats).toMatchObject({
        totalProcessed: 0,
        successCount: 0,
        failureCount: 0,
      });
      expect(mockPrisma.asset.findMany).not.toHaveBeenCalled();
      expect(mockEmbedImage).not.toHaveBeenCalled();
    });

    it('defers circuit-open initialization without consuming an asset attempt', async () => {
      mockPrisma.asset.findMany.mockResolvedValue([
        {
          id: 'asset-init-circuit-open',
          blobUrl: 'https://blob.vercel-storage.com/init-circuit-open.jpg',
          checksumSha256: 'checksum-init-circuit-open',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
      ]);
      mockCreateEmbeddingService.mockImplementation(() => {
        throw new EmbeddingProviderCircuitOpenError(42);
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('42');
      expect(data.stats).toMatchObject({
        totalProcessed: 1,
        successCount: 0,
        failureCount: 0,
        deferredCount: 1,
      });
      expect(mockDeferEmbeddingAdmission).toHaveBeenCalledWith(
        'asset-init-circuit-open',
        'Embedding provider temporarily unavailable',
        'provider_circuit_open',
        42,
        PROCESSING_CLAIM_UPDATED_AT,
      );
      expect(mockRecordEmbeddingAttemptFailure).not.toHaveBeenCalled();
      expect(mockEmbedImage).not.toHaveBeenCalled();
    });

    it('should persist admission backoff and stop the current batch after a throttle', async () => {
      const admissionError = new Error('Embedding generation is rate limited');
      admissionError.name = 'EmbeddingAdmissionError';
      Object.assign(admissionError, { reason: 'global_rate', retryAfterSec: 30 });

      mockPrisma.asset.findMany.mockResolvedValue([
        {
          id: 'asset-throttled',
          blobUrl: 'https://blob.vercel-storage.com/throttled.jpg',
          checksumSha256: 'checksum-throttled',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
        {
          id: 'asset-not-admitted',
          blobUrl: 'https://blob.vercel-storage.com/not-admitted.jpg',
          checksumSha256: 'checksum-not-admitted',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(3),
        },
      ]);
      mockEmbedImage.mockRejectedValueOnce(admissionError);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.outcome).toBe('backoff');
      expect(data.status).toBe('provider_backoff');
      expect(response.headers.get('Retry-After')).toBe('30');
      expect(data.stats).toMatchObject({
        totalProcessed: 1,
        successCount: 0,
        failureCount: 1,
      });
      expect(mockEmbedImage).toHaveBeenCalledOnce();
      expect(mockDeferEmbeddingAdmission).toHaveBeenCalledWith(
        'asset-throttled',
        admissionError.message,
        'global_rate',
        30,
        PROCESSING_CLAIM_UPDATED_AT,
      );
    });

    it('defers only the user-local admission failure and continues other users', async () => {
      const admissionError = new Error('user is rate limited');
      admissionError.name = 'EmbeddingAdmissionError';
      Object.assign(admissionError, { reason: 'user_rate', retryAfterSec: 60 });

      mockPrisma.asset.findMany.mockResolvedValue([
        {
          id: 'asset-user-limited',
          blobUrl: 'https://blob.vercel-storage.com/limited.jpg',
          checksumSha256: 'checksum-limited',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
        {
          id: 'asset-other-user',
          blobUrl: 'https://blob.vercel-storage.com/healthy.jpg',
          checksumSha256: 'checksum-healthy',
          ownerUserId: 'user-2',
          createdAt: hoursAgo(3),
        },
      ]);
      mockEmbedImage
        .mockRejectedValueOnce(admissionError)
        .mockResolvedValueOnce({
          embedding: Array(EMBEDDING_DIMENSION).fill(0.2),
          model: 'siglip-large',
          dimension: EMBEDDING_DIMENSION,
          processingTime: 100,
        });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(207);
      expect(response.headers.get('Retry-After')).toBe('60');
      expect(data.outcome).toBe('partial');
      expect(data.status).toBe('partial');
      expect(data.retryAfterSec).toBe(60);
      expect(data.stats).toMatchObject({
        totalProcessed: 2,
        successCount: 1,
        failureCount: 1,
        deferredCount: 1,
      });
      expect(mockRecordEmbeddingAdmissionFailure).not.toHaveBeenCalled();
      expect(mockDeferEmbeddingAdmission).toHaveBeenCalledWith(
        'asset-user-limited',
        admissionError.message,
        'user_rate',
        60,
        PROCESSING_CLAIM_UPDATED_AT,
      );
      expect(mockEmbedImage).toHaveBeenCalledTimes(2);
    });

    it('counts a real provider 429 as an asset attempt before returning shared backoff', async () => {
      mockPrisma.asset.findMany.mockResolvedValue([
        {
          id: 'asset-provider-429',
          blobUrl: 'https://blob.vercel-storage.com/provider-429.jpg',
          checksumSha256: 'checksum-provider-429',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
      ]);
      mockEmbedImage.mockRejectedValueOnce(new EmbeddingProviderRateLimitError(12));

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.outcome).toBe('backoff');
      expect(response.headers.get('Retry-After')).toBe('12');
      expect(mockRecordEmbeddingAttemptFailure).toHaveBeenCalledWith(
        'asset-provider-429',
        'Embedding provider rate limited',
        PROCESSING_CLAIM_UPDATED_AT,
      );
      expect(data.stats.errors[0]).toMatchObject({
        assetId: 'asset-provider-429',
        taxonomy: 'provider_rate_limit',
        statusCode: 429,
        retryAfterSec: 12,
      });
      expect(mockDeferEmbeddingAdmission).not.toHaveBeenCalled();
    });

    it('should bound poison failures while continuing with a healthy asset', async () => {
      const mockAssets = [
        {
          id: 'asset-poison',
          blobUrl: 'https://blob.vercel-storage.com/poison.jpg',
          checksumSha256: 'checksum-poison',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(3),
        },
        {
          id: 'asset-healthy',
          blobUrl: 'https://blob.vercel-storage.com/healthy.jpg',
          checksumSha256: 'checksum-healthy',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
      ];
      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);
      mockEmbedImage
        .mockRejectedValueOnce(new Error('Unable to identify image file'))
        .mockResolvedValueOnce({
          embedding: Array(EMBEDDING_DIMENSION).fill(0.2),
          model: 'siglip-large',
          dimension: EMBEDDING_DIMENSION,
          processingTime: 100,
        });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats).toMatchObject({
        totalProcessed: 2,
        successCount: 1,
        failureCount: 1,
      });
      expect(data.outcome).toBe('partial');
      expect(mockRecordEmbeddingAttemptFailure).toHaveBeenCalledWith(
        'asset-poison',
        'Unable to identify image file',
        PROCESSING_CLAIM_UPDATED_AT,
      );
      expect(mockEmbedImage).toHaveBeenCalledTimes(2);
      expect(mockUpsertAssetEmbedding).toHaveBeenCalledTimes(1);
    });

    it('should handle upsert failure', async () => {
      const mockAssets = [
        {
          id: 'asset-upsert-fail',
          blobUrl: 'https://blob.vercel-storage.com/test.jpg',
          checksumSha256: 'checksum',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);
      mockUpsertAssetEmbedding.mockResolvedValue(null); // Upsert returns null on failure

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.totalProcessed).toBe(1);
      expect(data.stats.successCount).toBe(0);
      expect(data.stats.failureCount).toBe(1);
      expect(data.stats.errors[0].error).toBe('Failed to persist embedding');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Service Availability', () => {
    it('should return 503 when embedding service fails to initialize', async () => {
      // Need to have assets first, otherwise service init is skipped
      const mockAssets = [
        {
          id: 'asset-1',
          blobUrl: 'https://blob.vercel-storage.com/test.jpg',
          checksumSha256: 'checksum',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);
      mockCreateEmbeddingService.mockImplementation(() => {
        throw new Error('Service initialization failed');
      });

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.outcome).toBe('backoff');
      expect(data.status).toBe('provider_backoff');
      expect(data.stats.errors[0]).toMatchObject({
        assetId: 'asset-1',
        taxonomy: 'provider_unavailable',
        statusCode: 503,
        retryAfterSec: 30,
      });
      expect(response.headers.get('Retry-After')).toBe('30');
      expect(response.headers.get('X-Sploot-Embedding-Outcome')).toBe(
        'provider_unavailable',
      );
      expect(mockRecordEmbeddingAttemptFailure).toHaveBeenCalledWith(
        'asset-1',
        'Embedding service initialization failed',
        PROCESSING_CLAIM_UPDATED_AT,
      );

      // Assets should have been found first
      expect(mockPrisma.asset.findMany).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Statistics', () => {
    it('should return correct processing stats', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          blobUrl: 'https://blob.vercel-storage.com/1.jpg',
          checksumSha256: 'checksum-1',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
        {
          id: 'asset-2',
          blobUrl: 'https://blob.vercel-storage.com/2.jpg',
          checksumSha256: 'checksum-2',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.message).toBe('Processed 2 assets');
      expect(data.stats).toMatchObject({
        totalProcessed: 2,
        successCount: 2,
        failureCount: 0,
        successRate: 100,
      });

      expect(data.stats.totalTime).toBeDefined();
      expect(data.stats.avgProcessingTime).toBeDefined();
    });

    it('should calculate success rate correctly with failures', async () => {
      const mockAssets = Array.from({ length: 10 }, (_, i) => ({
        id: `asset-${i}`,
        blobUrl: `https://blob.vercel-storage.com/${i}.jpg`,
        checksumSha256: `checksum-${i}`,
        ownerUserId: 'user-1',
        createdAt: hoursAgo(2),
      }));

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      // Make 3 fail
      mockEmbedImage
        .mockResolvedValueOnce({ embedding: [], model: 'test', dimension: EMBEDDING_DIMENSION, processingTime: 100 })
        .mockResolvedValueOnce({ embedding: [], model: 'test', dimension: EMBEDDING_DIMENSION, processingTime: 100 })
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({ embedding: [], model: 'test', dimension: EMBEDDING_DIMENSION, processingTime: 100 })
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({ embedding: [], model: 'test', dimension: EMBEDDING_DIMENSION, processingTime: 100 })
        .mockResolvedValueOnce({ embedding: [], model: 'test', dimension: EMBEDDING_DIMENSION, processingTime: 100 })
        .mockResolvedValueOnce({ embedding: [], model: 'test', dimension: EMBEDDING_DIMENSION, processingTime: 100 })
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({ embedding: [], model: 'test', dimension: EMBEDDING_DIMENSION, processingTime: 100 });

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.totalProcessed).toBe(10);
      expect(data.stats.successCount).toBe(7);
      expect(data.stats.failureCount).toBe(3);
      expect(data.stats.successRate).toBe(70); // 7/10 = 70%

      consoleErrorSpy.mockRestore();
    });

    it('should calculate average processing time correctly', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          blobUrl: 'https://blob.vercel-storage.com/1.jpg',
          checksumSha256: 'checksum-1',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      // Should have avgProcessingTime (can be 0 if processing is instant)
      expect(data.stats.avgProcessingTime).toBeGreaterThanOrEqual(0);
      expect(typeof data.stats.avgProcessingTime).toBe('number');
    });

    it('should handle zero success rate correctly', async () => {
      const mockAssets = [
        {
          id: 'asset-fail',
          blobUrl: 'https://blob.vercel-storage.com/fail.jpg',
          checksumSha256: 'checksum',
          ownerUserId: 'user-1',
          createdAt: hoursAgo(2),
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);
      mockEmbedImage.mockRejectedValue(new Error('All failed'));

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.successCount).toBe(0);
      expect(data.stats.successRate).toBe(0);
      expect(data.stats.avgProcessingTime).toBe(0);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      mockPrisma.asset.findMany.mockRejectedValue(new Error('Database connection failed'));

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to process embeddings');
      expect(data.stats).toBeDefined();

      consoleErrorSpy.mockRestore();
    });
  });
});

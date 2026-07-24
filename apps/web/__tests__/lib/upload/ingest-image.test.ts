import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertEnrolledUser: vi.fn(),
  validateUpload: vi.fn(),
  checkDuplicate: vi.fn(),
  inspect: vi.fn(),
  processImage: vi.fn(),
  upload: vi.fn(),
  cleanup: vi.fn(),
  recordAsset: vi.fn(),
  scheduleEmbedding: vi.fn(),
  reserveUploadBytes: vi.fn(),
  commitUploadBytes: vi.fn(),
  releaseStorageQuotaReservation: vi.fn(),
  StorageQuotaExceededError: class StorageQuotaExceededError extends Error {
    constructor(public readonly snapshot: unknown) {
      super('Storage quota exceeded');
      Object.setPrototypeOf(this, StorageQuotaExceededError.prototype);
    }
  },
}));

vi.mock('@/lib/db', () => ({ prisma: {} }));

vi.mock('@/lib/enrollment/enrollment-policy', () => ({
  assertEnrolledUser: mocks.assertEnrolledUser,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/upload/validation-service', () => ({
  UploadValidationService: vi.fn(function (this: unknown) {
    return { validateUpload: mocks.validateUpload };
  }),
}));

vi.mock('@/lib/upload/deduplication-service', () => ({
  DeduplicationService: vi.fn(function (this: unknown) {
    return { checkDuplicate: mocks.checkDuplicate };
  }),
}));

vi.mock('@/lib/upload/perceptual-hash-service', () => ({
  PerceptualHashService: vi.fn(function (this: unknown) {
    return { inspect: mocks.inspect };
  }),
}));

vi.mock('@/lib/upload/image-processor-service', () => ({
  ImageProcessorService: vi.fn(function (this: unknown) {
    return { processImage: mocks.processImage };
  }),
}));

vi.mock('@/lib/upload/blob-uploader-service', () => ({
  BlobUploaderService: vi.fn(function (this: unknown) {
    return { upload: mocks.upload, cleanup: mocks.cleanup };
  }),
}));

vi.mock('@/lib/upload/asset-recorder-service', () => ({
  AssetRecorderService: vi.fn(function (this: unknown) {
    return { recordAsset: mocks.recordAsset };
  }),
}));

vi.mock('@/lib/upload/embedding-scheduler-service', () => ({
  EmbeddingSchedulerService: vi.fn(function (this: unknown) {
    return { scheduleEmbedding: mocks.scheduleEmbedding };
  }),
}));

vi.mock('@/lib/quota/storage-quota-policy', () => ({
  reserveUploadBytes: mocks.reserveUploadBytes,
  commitUploadBytes: mocks.commitUploadBytes,
  releaseStorageQuotaReservation: mocks.releaseStorageQuotaReservation,
  StorageQuotaExceededError: mocks.StorageQuotaExceededError,
}));

import { ingestImage } from '@/lib/upload/ingest-image';

function fakeFile(name: string, size: number, type = 'image/png'): File {
  return { name, size, type, arrayBuffer: async () => new ArrayBuffer(size) } as unknown as File;
}

describe('ingestImage — derived-storage-aware quota commit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertEnrolledUser.mockResolvedValue(undefined);
    mocks.validateUpload.mockReturnValue({ valid: true });
    mocks.checkDuplicate.mockResolvedValue({ isDuplicate: false, checksum: 'checksum-1' });
    mocks.inspect.mockResolvedValue({ phash: null, nearDuplicate: null });
    mocks.processImage.mockResolvedValue({ success: true, processed: { main: null, thumbnail: null }, metadata: { width: 10, height: 10 }, usedFallback: false });
    mocks.reserveUploadBytes.mockResolvedValue({ id: 'reservation-1', snapshot: {} });
    mocks.commitUploadBytes.mockResolvedValue({ id: 'reservation-1', snapshot: {} });
    mocks.recordAsset.mockResolvedValue({ asset: { id: 'asset-1', createdAt: new Date() }, tagsCreated: 0, tagsAssociated: 0 });
    mocks.scheduleEmbedding.mockResolvedValue(undefined);
  });

  function uploadResult(overrides: Record<string, unknown> = {}) {
    return {
      mainUrl: 'https://blob.example.test/original.png',
      mainPathname: 'uploads/original.png',
      thumbnailUrl: 'https://blob.example.test/thumb.png',
      thumbnailPathname: 'uploads/thumb.png',
      storageProvider: 'vercel',
      storageKey: 'uploads/original.png',
      thumbnailStorageKey: 'uploads/thumb.png',
      mainSize: 1000,
      mainSha256: 'a'.repeat(64),
      thumbnailSize: 200,
      thumbnailSha256: 'b'.repeat(64),
      storageConfigFingerprint: 'fingerprint-1',
      mainReplicas: [{ provider: 'vercel', key: 'uploads/original.png', url: 'https://blob.example.test/original.png', size: 1000, sha256: 'a'.repeat(64) }],
      thumbnailReplicas: [{ provider: 'vercel', key: 'uploads/thumb.png', url: 'https://blob.example.test/thumb.png', size: 200, sha256: 'b'.repeat(64) }],
      ...overrides,
    };
  }

  it('commits the reservation to original+thumbnail physical bytes, not just the pre-processing file size', async () => {
    mocks.upload.mockResolvedValue(uploadResult());

    const result = await ingestImage({ userId: 'user-1', file: fakeFile('meme.png', 900) });

    expect(result.kind).toBe('created');
    expect(mocks.reserveUploadBytes).toHaveBeenCalledWith('user-1', 900);
    // 900 (pre-processing) != 1200 (real original+thumbnail total) — the
    // reservation-before-processing gap this commit step closes.
    expect(mocks.commitUploadBytes).toHaveBeenCalledWith('user-1', 'reservation-1', 1200);
    expect(mocks.commitUploadBytes.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordAsset.mock.invocationCallOrder[0]);
    expect(mocks.releaseStorageQuotaReservation).toHaveBeenCalledWith('reservation-1');
  });

  it('commits only the original size on a rendition failure (no thumbnail produced)', async () => {
    mocks.upload.mockResolvedValue(uploadResult({ thumbnailUrl: null, thumbnailPathname: null, thumbnailStorageKey: null, thumbnailSize: null, thumbnailSha256: null, thumbnailReplicas: [] }));

    await ingestImage({ userId: 'user-1', file: fakeFile('meme.png', 900) });

    expect(mocks.commitUploadBytes).toHaveBeenCalledWith('user-1', 'reservation-1', 1000);
  });

  it('cleans up already-uploaded blobs and propagates StorageQuotaExceededError when the real total no longer fits', async () => {
    const result = uploadResult();
    mocks.upload.mockResolvedValue(result);
    const quotaError = new mocks.StorageQuotaExceededError({ usedBytes: 999, limitBytes: 1000, remainingBytes: 1 });
    mocks.commitUploadBytes.mockRejectedValue(quotaError);

    await expect(ingestImage({ userId: 'user-1', file: fakeFile('meme.png', 900) })).rejects.toBe(quotaError);

    expect(mocks.cleanup).toHaveBeenCalledWith(result.mainUrl, result.thumbnailUrl, result.mainReplicas, result.thumbnailReplicas);
    expect(mocks.recordAsset).not.toHaveBeenCalled();
    // The outer catch still releases the (never-committed-successfully)
    // reservation so it doesn't leak until TTL expiry.
    expect(mocks.releaseStorageQuotaReservation).toHaveBeenCalledWith('reservation-1');
  });
});

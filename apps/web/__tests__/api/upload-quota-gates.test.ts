import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UPLOAD } from '@sploot/common';

const mocks = vi.hoisted(() => ({
  verifyBearerOrThrow: vi.fn(),
  uploadGateEnabled: true,
  reserveUploadBytes: vi.fn(),
  upload: vi.fn(),
  validateUpload: vi.fn(),
  processImage: vi.fn(),
  checkDuplicate: vi.fn(),
  recordAsset: vi.fn(),
  scheduleEmbedding: vi.fn(),
  loggerError: vi.fn(),
  StorageQuotaExceededError: class StorageQuotaExceededError extends Error {
    constructor(public readonly snapshot: any) {
      super('Storage quota exceeded');
      Object.setPrototypeOf(this, StorageQuotaExceededError.prototype);
    }
  },
}));

vi.mock('next/navigation', () => ({
  unstable_rethrow: vi.fn(),
}));

vi.mock('@/lib/auth/verify-bearer', () => ({
  verifyBearerOrThrow: mocks.verifyBearerOrThrow,
}));

vi.mock('@/lib/auth/api', () => ({
  isUnauthorizedAuthError: () => false,
  unauthorizedResponse: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));

vi.mock('@/lib/env', () => ({
  blobConfigured: true,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

vi.mock('@/lib/runtime-gates', () => ({
  getRuntimeGate: () => ({
    name: 'uploads',
    enabled: mocks.uploadGateEnabled,
    code: 'uploads_disabled',
    message: 'Uploads are temporarily paused',
  }),
  runtimeGateResponse: () => Response.json({
    error: 'Uploads are temporarily paused',
    code: 'uploads_disabled',
    retryable: true,
  }, { status: 503 }),
}));

vi.mock('@/lib/quota/storage-quota-policy', () => ({
  reserveUploadBytes: mocks.reserveUploadBytes,
  releaseStorageQuotaReservation: vi.fn(),
  storageQuotaError: (snapshot: any) => ({
    success: false,
    error: 'Storage quota exceeded',
    code: 'quota_exceeded',
    quota: snapshot,
  }),
  StorageQuotaExceededError: mocks.StorageQuotaExceededError,
}));

vi.mock('@/lib/upload/validation-service', () => ({
  UploadValidationService: vi.fn(function () {
    return {
    validateUpload: mocks.validateUpload,
    };
  }),
}));

vi.mock('@/lib/upload/image-processor-service', () => ({
  ImageProcessorService: vi.fn(function () {
    return {
    processImage: mocks.processImage,
    };
  }),
}));

vi.mock('@/lib/upload/deduplication-service', () => ({
  DeduplicationService: vi.fn(function () {
    return {
    checkDuplicate: mocks.checkDuplicate,
    };
  }),
}));

vi.mock('@/lib/upload/blob-uploader-service', () => ({
  BlobUploaderService: vi.fn(function () {
    return {
    upload: mocks.upload,
    cleanup: vi.fn(),
    };
  }),
}));

vi.mock('@/lib/upload/asset-recorder-service', () => ({
  AssetRecorderService: vi.fn(function () {
    return {
    recordAsset: mocks.recordAsset,
    };
  }),
}));

vi.mock('@/lib/upload/embedding-scheduler-service', () => ({
  EmbeddingSchedulerService: vi.fn(function () {
    return {
    scheduleEmbedding: mocks.scheduleEmbedding,
    };
  }),
}));

import { GET, POST } from '@/app/api/upload/route';
import { StorageQuotaExceededError } from '@/lib/quota/storage-quota-policy';

function uploadRequest(): NextRequest {
  const form = new FormData();
  form.append('file', new File(['image-bytes'], 'asset.jpg', { type: 'image/jpeg' }));
  return new NextRequest('http://localhost:3000/api/upload', {
    method: 'POST',
    body: form,
  });
}

describe('POST /api/upload quota and runtime gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadGateEnabled = true;
    mocks.verifyBearerOrThrow.mockResolvedValue('user-1');
    mocks.validateUpload.mockReturnValue({ valid: true });
    mocks.checkDuplicate.mockResolvedValue({ isDuplicate: false, checksum: 'checksum-1' });
    mocks.reserveUploadBytes.mockResolvedValue({ id: 'reservation-1', snapshot: {} });
  });

  it('returns a typed 503 before Blob upload when uploads are disabled', async () => {
    mocks.uploadGateEnabled = false;

    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe('uploads_disabled');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.reserveUploadBytes).not.toHaveBeenCalled();
  });

  it('returns a typed 403 before Blob upload when quota is exceeded', async () => {
    mocks.reserveUploadBytes.mockRejectedValue(new StorageQuotaExceededError({
      usedBytes: 900,
      limitBytes: 1000,
      remainingBytes: 0,
      incomingBytes: 200,
    }));

    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('quota_exceeded');
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe('GET /api/upload policy status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyBearerOrThrow.mockResolvedValue('user-1');
  });

  it('returns upload limits from shared common policy', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/upload', { method: 'GET' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.limits.maxFileSize).toBe(UPLOAD.maxSize);
    expect(body.limits.allowedTypes).toEqual([...UPLOAD.allowedTypes]);
  });
});

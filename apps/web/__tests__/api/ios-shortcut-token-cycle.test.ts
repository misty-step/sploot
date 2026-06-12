import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createQaLocalAuthToken, getQaLocalAuthHeader } from '@/lib/auth/qa-local';

const mocks = vi.hoisted(() => {
  const tokenRows = new Map<string, any>();
  return {
    tokenRows,
    uploadGateEnabled: true,
    reserveUploadBytes: vi.fn(),
    upload: vi.fn(),
    validateUpload: vi.fn(),
    processImage: vi.fn(),
    checkDuplicate: vi.fn(),
    recordAsset: vi.fn(),
    scheduleEmbedding: vi.fn(),
    verifyBearerOrThrow: vi.fn(),
    prisma: {
      personalUploadToken: {
        create: vi.fn(async ({ data, select }: any) => {
          const row = {
            id: `token-${tokenRows.size + 1}`,
            userId: data.userId,
            name: data.name,
            tokenHash: data.tokenHash,
            createdAt: new Date('2026-06-12T00:00:00Z'),
            lastUsedAt: null,
            revokedAt: null,
          };
          tokenRows.set(data.tokenHash, row);
          return pick(row, select);
        }),
        findUnique: vi.fn(async ({ where, select }: any) => {
          const row = tokenRows.get(where.tokenHash);
          return row ? pick(row, select) : null;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const row = Array.from(tokenRows.values()).find((candidate) => candidate.id === where.id);
          if (row) {
            Object.assign(row, data);
          }
          return row;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const row of tokenRows.values()) {
            if (row.id === where.id && row.userId === where.userId && row.revokedAt === where.revokedAt) {
              Object.assign(row, data);
              count += 1;
            }
          }
          return { count };
        }),
        findMany: vi.fn(async ({ where, select }: any) => (
          Array.from(tokenRows.values())
            .filter((row) => row.userId === where.userId)
            .map((row) => pick(row, select))
        )),
      },
    },
  };

  function pick(row: any, select: Record<string, boolean>) {
    return Object.fromEntries(
      Object.entries(select)
        .filter(([, enabled]) => enabled)
        .map(([key]) => [key, row[key]])
    );
  }
});

vi.mock('next/navigation', () => ({
  unstable_rethrow: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}));

vi.mock('@/lib/auth/verify-bearer', () => ({
  verifyBearerOrThrow: mocks.verifyBearerOrThrow,
}));

vi.mock('@/lib/env', () => ({
  blobConfigured: true,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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
  StorageQuotaExceededError: class StorageQuotaExceededError extends Error {
    constructor(public readonly snapshot: any) {
      super('Storage quota exceeded');
    }
  },
}));

vi.mock('@/lib/upload/validation-service', () => ({
  UploadValidationService: vi.fn(function () {
    return { validateUpload: mocks.validateUpload };
  }),
}));

vi.mock('@/lib/upload/image-processor-service', () => ({
  ImageProcessorService: vi.fn(function () {
    return { processImage: mocks.processImage };
  }),
}));

vi.mock('@/lib/upload/deduplication-service', () => ({
  DeduplicationService: vi.fn(function () {
    return { checkDuplicate: mocks.checkDuplicate };
  }),
}));

vi.mock('@/lib/upload/blob-uploader-service', () => ({
  BlobUploaderService: vi.fn(function () {
    return { upload: mocks.upload, cleanup: vi.fn() };
  }),
}));

vi.mock('@/lib/upload/asset-recorder-service', () => ({
  AssetRecorderService: vi.fn(function () {
    return { recordAsset: mocks.recordAsset };
  }),
}));

vi.mock('@/lib/upload/embedding-scheduler-service', () => ({
  EmbeddingSchedulerService: vi.fn(function () {
    return { scheduleEmbedding: mocks.scheduleEmbedding };
  }),
}));

import { POST as createUploadToken } from '@/app/api/upload-tokens/route';
import { DELETE as revokeUploadToken } from '@/app/api/upload-tokens/[id]/route';
import { POST as upload } from '@/app/api/upload/route';

const QA_SECRET = 'test-secret-with-enough-entropy';

function uploadRequest(token: string): NextRequest {
  const form = new FormData();
  form.append('file', new File(['image-bytes'], 'shortcut.jpg', { type: 'image/jpeg' }));
  return new NextRequest('http://localhost:3000/api/upload', {
    method: 'POST',
    body: form,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('iOS Shortcut upload token cycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tokenRows.clear();
    process.env.SPLOOT_QA_AUTH_MODE = 'enabled';
    process.env.SPLOOT_QA_AUTH_SECRET = QA_SECRET;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    mocks.verifyBearerOrThrow.mockRejectedValue(new Error('Unauthorized'));
    mocks.validateUpload.mockReturnValue({ valid: true });
    mocks.checkDuplicate.mockResolvedValue({ isDuplicate: false, checksum: 'checksum-1' });
    mocks.reserveUploadBytes.mockResolvedValue({ id: 'reservation-1', snapshot: {} });
    mocks.processImage.mockResolvedValue({
      success: true,
      processed: {},
      metadata: { width: 100, height: 100 },
    });
    mocks.upload.mockResolvedValue({
      mainUrl: 'https://blob.test/shortcut.jpg',
      thumbnailUrl: null,
      mainPathname: 'user-1/shortcut.jpg',
      thumbnailPathname: null,
    });
    mocks.recordAsset.mockResolvedValue({
      asset: {
        id: 'asset-1',
        createdAt: new Date('2026-06-12T00:00:00Z'),
      },
      tagsCreated: 0,
      tagsAssociated: 0,
    });
    mocks.scheduleEmbedding.mockResolvedValue({});
  });

  it('mints, uses, revokes, then rejects an upload-only Shortcut token', async () => {
    const qaToken = await createQaLocalAuthToken({
      userId: 'user-1',
      secret: QA_SECRET,
      expiresInSeconds: 60,
    });

    const createResponse = await createUploadToken(new NextRequest('http://localhost:3000/api/upload-tokens', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [getQaLocalAuthHeader()]: qaToken,
      },
      body: JSON.stringify({ name: 'Save to Sploot Shortcut' }),
    }));
    const created = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(created.token).toMatch(/^sploot_upload_/);
    expect(created.record.id).toBe('token-1');

    const uploadResponse = await upload(uploadRequest(created.token));
    const uploaded = await uploadResponse.json();

    expect(uploadResponse.status).toBe(201);
    expect(uploaded).toMatchObject({
      success: true,
      isDuplicate: false,
      asset: { id: 'asset-1' },
    });
    expect(mocks.recordAsset).toHaveBeenCalled();

    const revokeResponse = await revokeUploadToken(
      new NextRequest('http://localhost:3000/api/upload-tokens/token-1', {
        method: 'DELETE',
        headers: { [getQaLocalAuthHeader()]: qaToken },
      }),
      { params: Promise.resolve({ id: 'token-1' }) }
    );
    expect(revokeResponse.status).toBe(200);

    const rejectedResponse = await upload(uploadRequest(created.token));

    expect(rejectedResponse.status).toBe(401);
    await expect(rejectedResponse.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});

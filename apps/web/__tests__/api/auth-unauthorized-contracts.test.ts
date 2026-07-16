import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireUserIdWithSync: vi.fn(),
  getAuthWithUser: vi.fn(),
  getAuth: vi.fn(),
  clerkAuth: vi.fn(),
  verifyBearerOrThrow: vi.fn(),
  logError: vi.fn(),
  createErrorResponse: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  requireUserIdWithSync: mocks.requireUserIdWithSync,
  getAuthWithUser: mocks.getAuthWithUser,
  getAuth: mocks.getAuth,
}));

vi.mock('@/lib/auth/verify-bearer', () => ({
  verifyBearerOrThrow: mocks.verifyBearerOrThrow,
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.clerkAuth,
}));

vi.mock('@/lib/observability-logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/observability-logger')>();

  return {
    ...actual,
    logError: mocks.logError,
    withTraceId: vi.fn(() => ({
      logInfo: vi.fn(),
      logError: vi.fn(),
      logTiming: vi.fn(),
    })),
  };
});

vi.mock('@/lib/error-response', () => ({
  createErrorResponse: (...args: any[]) => mocks.createErrorResponse(...args),
}));

vi.mock('@/lib/cache', () => ({
  getCacheService: () => ({
    clear: vi.fn(),
  }),
}));

vi.mock('@/lib/embeddings', () => ({
  createEmbeddingService: vi.fn(),
  EmbeddingError: class EmbeddingError extends Error {
    statusCode?: number;
  },
  EmbeddingAdmissionError: class EmbeddingAdmissionError extends Error {
    statusCode = 429;
    reason = 'daily_budget';
    retryAfterSec = 60;
  },
}));

vi.mock('@/lib/analytics', () => ({
  trackTiming: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/db-fingerprint', () => ({
  getDbFingerprint: vi.fn(() => ({ host: 'test-host', hash: 'test-hash' })),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    asset: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    tag: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    assetTag: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    assetEmbedding: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  upsertAssetEmbedding: vi.fn(),
  vectorSearch: vi.fn(),
  logSearch: vi.fn(),
}));

import { GET as getStats } from '@/app/api/stats/route';
import { GET as getTags, POST as postTags } from '@/app/api/tags/route';
import { PATCH as patchTag, DELETE as deleteTag } from '@/app/api/tags/[tagId]/route';
import { GET as getAssetsAudit } from '@/app/api/assets/audit/route';
import { GET as getAssetTags, POST as postAssetTags, DELETE as deleteAssetTags } from '@/app/api/assets/[id]/tags/route';
import { GET as getAssets, POST as postAsset } from '@/app/api/assets/route';
import { GET as getAsset, PATCH as patchAsset, DELETE as deleteAsset } from '@/app/api/assets/[id]/route';
import { POST as shareAsset } from '@/app/api/assets/[id]/share/route';
import { GET as getSimilarAssets } from '@/app/api/assets/[id]/similar/route';
import { GET as getEmbeddingStatus } from '@/app/api/assets/[id]/embedding-status/route';
import { POST as generateEmbedding } from '@/app/api/assets/[id]/generate-embedding/route';
import { POST as getBatchEmbeddingStatus } from '@/app/api/assets/batch/embedding-status/route';
import { POST as searchAssets } from '@/app/api/search/route';
import { POST as advancedSearch } from '@/app/api/search/advanced/route';
import { GET as getUploadStatus, POST as directUpload } from '@/app/api/upload/route';
import { POST as checkUpload } from '@/app/api/upload/check/route';
import { GET as getUsageAnalytics } from '@/app/api/analytics/usage/route';
import { POST as postTelemetry } from '@/app/api/telemetry/route';

function makeRequest(pathname: string, method: string): NextRequest {
  return new NextRequest(`http://localhost:3000${pathname}`, { method });
}

function makeTokenRequest(pathname: string, method: string): NextRequest {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    method,
    headers: { authorization: 'Bearer splt_smoke_token' },
  });
}

describe('auth error contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserIdWithSync.mockRejectedValue(new Error('Unauthorized'));
    mocks.getAuthWithUser.mockResolvedValue({
      userId: null,
      sessionId: null,
      getToken: vi.fn(),
      syncStatus: 'skipped',
    });
    mocks.getAuth.mockResolvedValue({
      userId: null,
      sessionId: null,
      getToken: vi.fn(),
    });
    mocks.clerkAuth.mockResolvedValue({
      userId: null,
      sessionId: null,
      getToken: vi.fn(),
    });
    mocks.verifyBearerOrThrow.mockRejectedValue(new Error('Unauthorized'));
    mocks.createErrorResponse.mockImplementation(() =>
      new Response(
        JSON.stringify({ error: 'Failed to create asset' }),
        {
          status: 500,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    );
  });

  it('returns 401 json for unauthenticated GET /api/stats', async () => {
    const response = await getStats(makeRequest('/api/stats', 'GET'));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 json for unauthenticated GET/POST /api/tags', async () => {
    const listResponse = await getTags(makeRequest('/api/tags', 'GET'));
    expect(listResponse.status).toBe(401);
    await expect(listResponse.json()).resolves.toEqual({ error: 'Unauthorized' });

    const createResponse = await postTags(makeRequest('/api/tags', 'POST'));
    expect(createResponse.status).toBe(401);
    await expect(createResponse.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 json for unauthenticated PATCH/DELETE /api/tags/[tagId]', async () => {
    const context = { params: Promise.resolve({ tagId: 'tag-123' }) };

    const patchResponse = await patchTag(makeRequest('/api/tags/tag-123', 'PATCH'), context);
    expect(patchResponse.status).toBe(401);
    await expect(patchResponse.json()).resolves.toEqual({ error: 'Unauthorized' });

    const deleteResponse = await deleteTag(makeRequest('/api/tags/tag-123', 'DELETE'), context);
    expect(deleteResponse.status).toBe(401);
    await expect(deleteResponse.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 json for unauthenticated GET /api/assets/audit', async () => {
    const response = await getAssetsAudit(makeRequest('/api/assets/audit', 'GET'));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 json for unauthenticated asset tag routes', async () => {
    const context = { params: Promise.resolve({ id: 'asset-123' }) };

    const listResponse = await getAssetTags(makeRequest('/api/assets/asset-123/tags', 'GET'), context);
    expect(listResponse.status).toBe(401);
    await expect(listResponse.json()).resolves.toEqual({ error: 'Unauthorized' });

    const addResponse = await postAssetTags(makeRequest('/api/assets/asset-123/tags', 'POST'), context);
    expect(addResponse.status).toBe(401);
    await expect(addResponse.json()).resolves.toEqual({ error: 'Unauthorized' });

    const removeResponse = await deleteAssetTags(makeRequest('/api/assets/asset-123/tags', 'DELETE'), context);
    expect(removeResponse.status).toBe(401);
    await expect(removeResponse.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 410 json for the disabled legacy POST /api/assets', async () => {
    const response = await postAsset(makeRequest('/api/assets', 'POST'));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('/api/upload') });
  });

  it('returns 401 json for unauthenticated GET /api/assets before query validation', async () => {
    const response = await getAssets(makeRequest('/api/assets?sortBy=shuffle', 'GET'));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 json for formerly middleware-protected unauthenticated routes', async () => {
    const assetContext = { params: Promise.resolve({ id: 'asset-123' }) };

    const cases = [
      () => getAsset(makeRequest('/api/assets/asset-123', 'GET'), assetContext),
      () => patchAsset(makeRequest('/api/assets/asset-123', 'PATCH'), assetContext),
      () => deleteAsset(makeRequest('/api/assets/asset-123', 'DELETE'), assetContext),
      () => shareAsset(makeRequest('/api/assets/asset-123/share', 'POST'), assetContext),
      () => getSimilarAssets(makeRequest('/api/assets/asset-123/similar', 'GET'), assetContext),
      () => getEmbeddingStatus(makeRequest('/api/assets/asset-123/embedding-status', 'GET'), assetContext),
      () => generateEmbedding(makeRequest('/api/assets/asset-123/generate-embedding', 'POST'), assetContext),
      () => getBatchEmbeddingStatus(makeRequest('/api/assets/batch/embedding-status', 'POST')),
      () => searchAssets(makeRequest('/api/search', 'POST')),
      () => advancedSearch(makeRequest('/api/search/advanced', 'POST')),
      () => getUploadStatus(makeRequest('/api/upload', 'GET')),
      () => directUpload(makeRequest('/api/upload', 'POST')),
      () => checkUpload(makeRequest('/api/upload/check', 'POST')),
      () => getUsageAnalytics(makeRequest('/api/analytics/usage', 'GET')),
      () => postTelemetry(makeRequest('/api/telemetry', 'POST')),
    ];

    for (const request of cases) {
      const response = await request();
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    }
  });
});

// End-to-end confirmation of the upload-only guarantee proven at the unit level
// in upload-token-scope.test.ts: a personal upload token is inert on every route
// that did not opt in with `allowUploadToken`. A `splt_` bearer presented to a
// door-2 route (server.ts, which never reaches the verifier) and to an
// upload-adjacent route that stayed Clerk-only must still return the stable 401.
describe('personal upload tokens authenticate only on opt-in routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuth.mockResolvedValue({ userId: null, sessionId: null, getToken: vi.fn() });
    mocks.getAuthWithUser.mockResolvedValue({
      userId: null,
      sessionId: null,
      getToken: vi.fn(),
      syncStatus: 'skipped',
    });
    mocks.requireUserIdWithSync.mockRejectedValue(new Error('Unauthorized'));
    mocks.verifyBearerOrThrow.mockRejectedValue(new Error('Unauthorized'));
  });

  it('rejects a splt_ token on the door-2 route DELETE /api/assets/[id]', async () => {
    const context = { params: Promise.resolve({ id: 'asset-123' }) };
    const response = await deleteAsset(makeTokenRequest('/api/assets/asset-123', 'DELETE'), context);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects a splt_ token on the Clerk-only route POST /api/upload/check', async () => {
    const response = await checkUpload(makeTokenRequest('/api/upload/check', 'POST'));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});

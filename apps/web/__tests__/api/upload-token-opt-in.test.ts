import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Wiring proof: /api/upload must actually opt into upload-token auth, otherwise
 * the whole feature is inert. The resolver-level scope test
 * (upload-token-scope.test.ts) proves the gate; this proves the route passes
 * allowUploadToken: true through it.
 */

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  ingestImage: vi.fn(),
}));

vi.mock('next/navigation', () => ({ unstable_rethrow: vi.fn() }));
vi.mock('@/lib/auth/request-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/auth/api', () => ({
  isUnauthorizedAuthError: () => false,
  unauthorizedResponse: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));
vi.mock('@/lib/env', () => ({ blobConfigured: true }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/with-observability', () => ({ withObservability: (handler: any) => handler }));
vi.mock('@/lib/runtime-gates', () => ({
  getRuntimeGate: () => ({ name: 'uploads', enabled: true }),
  runtimeGateResponse: () => Response.json({ error: 'disabled' }, { status: 503 }),
}));
vi.mock('@/lib/upload/ingest-image', () => ({ ingestImage: mocks.ingestImage }));
vi.mock('@/lib/quota/storage-quota-policy', () => ({
  StorageQuotaExceededError: class StorageQuotaExceededError extends Error {},
  storageQuotaError: () => ({ error: 'quota' }),
}));

import { POST } from '@/app/api/upload/route';

function multipartReq(): NextRequest {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'meme.png', { type: 'image/png' }));
  return new NextRequest('http://localhost:3000/api/upload', { method: 'POST', body: form });
}

beforeEach(() => {
  mocks.authenticateRequest.mockReset();
  mocks.ingestImage.mockReset();
});

describe('/api/upload opts into upload-token auth', () => {
  it('calls authenticateRequest with { allowUploadToken: true }', async () => {
    mocks.authenticateRequest.mockResolvedValue({
      status: 'authenticated',
      principal: { userId: 'u1' },
      syncStatus: 'skipped',
    });
    mocks.ingestImage.mockResolvedValue({
      kind: 'created',
      asset: {
        id: 'a1',
        blobUrl: 'https://blob.test/a1.png',
        thumbnailUrl: null,
        pathname: 'memes/a1.png',
        filename: 'meme.png',
        mime: 'image/png',
        mimeType: 'image/png',
        size: 3,
        width: 1,
        height: 1,
        favorite: false,
        checksum: 'checksum-a1',
        createdAt: new Date('2026-07-14T12:00:00.000Z'),
        needsEmbedding: true,
      },
    });

    const res = await POST(multipartReq(), {} as any);

    expect(res.status).toBe(201);
    expect(mocks.authenticateRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowUploadToken: true })
    );
  });

  it('returns the stable 401 when the token is rejected', async () => {
    mocks.authenticateRequest.mockResolvedValue({ status: 'unauthenticated', reason: 'upload-token-invalid' });

    const res = await POST(multipartReq(), {} as any);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.ingestImage).not.toHaveBeenCalled();
  });
});

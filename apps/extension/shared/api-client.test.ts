import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SplootApiUploadResponse } from '@sploot/common';

vi.mock('../entrypoints/background/auth-manager', () => ({
  getAuthToken: vi.fn(async () => 'spld_test-device'),
  invalidateAuthToken: vi.fn(async () => undefined),
}));
vi.mock('./env', () => ({ getInstanceUrl: async () => 'https://sploot.test' }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', 'https://sploot.test');
});

describe('SplootApiClient token provider', () => {
  it('uses an injected token provider for upload authorization', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        success: true,
        isDuplicate: false,
        asset: {
          id: 'asset_123',
          blobUrl: 'https://blob.vercel-storage.com/u/asset.jpg',
          pathname: 'u/asset.jpg',
          filename: 'asset.jpg',
          mimeType: 'image/jpeg',
          size: 2048,
          checksum: 'sha256:abc123',
          createdAt: '2026-05-14T12:00:00.000Z',
          needsEmbedding: true,
        },
      } satisfies SplootApiUploadResponse), { status: 201 }))
    );

    const { createSplootApiClient } = await import('./api-client');
    const client = createSplootApiClient({
      getToken: vi.fn(async () => 'injected-token'),
    });

    await expect(
      client.uploadImage(new Blob(['image'], { type: 'image/jpeg' }), 'asset.jpg')
    ).resolves.toMatchObject({
      assetId: 'asset_123',
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://sploot.test/api/upload',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer injected-token',
        },
      })
    );
  });

  it('makes an expired-session notification actionable with the web sign-in route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));

    const { createSplootApiClient } = await import('./api-client');
    const client = createSplootApiClient({
      getToken: vi.fn(async () => 'injected-token'),
    });

    await expect(
      client.uploadImage(new Blob(['image'], { type: 'image/jpeg' }), 'asset.jpg')
    ).rejects.toMatchObject({
      code: 'unauthorized',
      actionHref: '/sign-in',
    });
  });
});

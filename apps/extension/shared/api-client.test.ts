import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SplootApiUploadResponse } from '@sploot/common';

vi.mock('@clerk/chrome-extension/background', () => ({
  createClerkClient: vi.fn(async () => ({
    session: {
      id: 'session_123',
      user: { id: 'user_123' },
      expireAt: new Date('2026-05-14T12:00:00.000Z'),
      getToken: vi.fn(async () => 'session-token'),
    },
  })),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_contract');
  vi.stubEnv('VITE_CLERK_SYNC_HOST', 'https://sploot.test');
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
});

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

// Re-import the client after setting each test's build-time environment;
// env.ts captures these values when the module is first evaluated.
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_contract');
  vi.stubEnv('VITE_CLERK_SYNC_HOST', 'https://sploot.test');
  vi.stubEnv('VITE_API_BASE_URL', 'https://sploot.test');
});


describe('uploadImage', () => {

  it('maps duplicate upload responses into a successful duplicate result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        success: true,
        isDuplicate: true,
        asset: {
          id: 'asset_existing',
          blobUrl: 'https://blob.vercel-storage.com/u/existing.jpg',
          pathname: 'u/existing.jpg',
          filename: 'asset.jpg',
          mimeType: 'image/jpeg',
          size: 2048,
          checksum: 'sha256:abc123',
          createdAt: '2026-05-14T12:00:00.000Z',
          needsEmbedding: false,
        },
        message: 'This image already exists in your library',
      } satisfies SplootApiUploadResponse), { status: 409 }))
    );

    const { uploadImage } = await import('./api-client');

    await expect(
      uploadImage(new Blob(['image'], { type: 'image/jpeg' }), 'asset.jpg')
    ).resolves.toEqual({
      assetId: 'asset_existing',
      blobUrl: 'https://blob.vercel-storage.com/u/existing.jpg',
      thumbnailUrl: 'https://blob.vercel-storage.com/u/existing.jpg',
      isDuplicate: true,
    });
  });

  it('maps typed quota errors into actionable extension copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        success: false,
        error: 'Storage quota exceeded',
        code: 'quota_exceeded',
        retryable: false,
        action: {
          type: 'manage_storage',
          label: 'Manage storage',
          href: '/app/settings',
        },
      }), { status: 403 }))
    );

    const { uploadImage, SplootApiClientError } = await import('./api-client');

    await expect(
      uploadImage(new Blob(['image'], { type: 'image/jpeg' }), 'asset.jpg')
    ).rejects.toMatchObject({
      name: 'SplootApiClientError',
      message: 'Storage quota exceeded. Open Sploot settings to manage storage.',
      status: 403,
      code: 'quota_exceeded',
      retryable: false,
      actionHref: '/app/settings',
    });

    await expect(
      uploadImage(new Blob(['image'], { type: 'image/jpeg' }), 'asset.jpg')
    ).rejects.toBeInstanceOf(SplootApiClientError);
  });

  it('maps typed upload gates into retryable extension copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        error: 'Uploads are temporarily paused',
        code: 'uploads_disabled',
        retryable: true,
      }), { status: 503 }))
    );

    const { uploadImage } = await import('./api-client');

    await expect(
      uploadImage(new Blob(['image'], { type: 'image/jpeg' }), 'asset.jpg')
    ).rejects.toMatchObject({
      message: 'Uploads are temporarily paused. Please try again later.',
      status: 503,
      code: 'uploads_disabled',
      retryable: true,
    });
  });
  it('does not turn an in-progress conflict into a duplicate receipt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'Upload is still in progress',
      code: 'UPLOAD_IN_PROGRESS',
      retryable: true,
    }), { status: 409 })));
    const { uploadImage } = await import('./api-client');

    await expect(uploadImage(new Blob(['image'], { type: 'image/png' })))
      .rejects.toMatchObject({ status: 409, retryable: true });
  });

  it('refuses a success-shaped response without a usable asset receipt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      isDuplicate: false,
      asset: {},
    }), { status: 201 })));
    const { uploadImage } = await import('./api-client');

    await expect(uploadImage(new Blob(['image'], { type: 'image/png' })))
      .rejects.toBeInstanceOf(Error);
  });

  it('preserves HTTP authentication errors when an ingress returns HTML instead of JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Unauthorized</html>', {
      status: 401,
      headers: { 'content-type': 'text/html' },
    })));
    const { uploadImage } = await import('./api-client');

    await expect(uploadImage(new Blob(['image'], { type: 'image/png' })))
      .rejects.toMatchObject({ status: 401, actionHref: '/sign-in' });
  });
});

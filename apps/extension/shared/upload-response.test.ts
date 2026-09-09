import { describe, expect, it, vi } from 'vitest';
import type { SplootApiUploadResponse } from '@sploot/common';
import { uploadImage } from './api-client';

vi.mock('../entrypoints/background/auth-manager', () => ({
  getAuthToken: vi.fn(async () => 'spld_test-device'),
  invalidateAuthToken: vi.fn(async () => undefined),
}));
vi.mock('./env', () => ({ getInstanceUrl: async () => 'https://sploot.test' }));



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


    await expect(
      uploadImage(new Blob(['image'], { type: 'image/jpeg' }), 'asset.jpg')
    ).rejects.toMatchObject({
      name: 'SplootApiClientError',
      status: 403,
      code: 'quota_exceeded',
      retryable: false,
      actionHref: '/app/settings',
    });

  });

  it('requires storage management instead of retrying an insufficient-space response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'The instance is preserving its disk reserve',
      code: 'storage_reserve_exceeded',
      action: { type: 'manage_storage', label: 'Manage storage', href: '/app/settings' },
    }), { status: 507 })));

    await expect(uploadImage(new Blob(['image'], { type: 'image/png' }))).rejects.toMatchObject({
      status: 507,
      code: 'storage_reserve_exceeded',
      retryable: false,
      actionHref: '/app/settings',
    });
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

    await expect(uploadImage(new Blob(['image'], { type: 'image/png' })))
      .rejects.toMatchObject({ status: 409, retryable: true });
  });

  it('refuses a success-shaped response without a usable asset receipt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      isDuplicate: false,
      asset: {},
    }), { status: 201 })));

    await expect(uploadImage(new Blob(['image'], { type: 'image/png' })))
      .rejects.toBeInstanceOf(Error);
  });

  it('preserves HTTP authentication errors when an ingress returns HTML instead of JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Unauthorized</html>', {
      status: 401,
      headers: { 'content-type': 'text/html' },
    })));

    await expect(uploadImage(new Blob(['image'], { type: 'image/png' })))
      .rejects.toMatchObject({ status: 401, actionHref: '/sign-in' });
  });
});

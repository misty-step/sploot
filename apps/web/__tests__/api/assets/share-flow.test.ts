import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createQaLocalAuthToken,
  getQaLocalAuthHeader,
  QA_LOCAL_AUDIENCE,
  QA_LOCAL_DEPLOYMENT_ENV,
  QA_LOCAL_DEPLOYMENT_ID,
} from '@/lib/auth/qa-local';
import { POST, DELETE } from '@/app/api/assets/[id]/share/route';
import { generateMetadata } from '@/app/m/[id]/page';
import ShareSlugPage from '@/app/s/[slug]/page';

// Mock lib/db
const mockPrisma = {
  asset: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

let mockDatabaseAvailable = true;

vi.mock('@/lib/db', () => ({
  get prisma() {
    return mockDatabaseAvailable ? mockPrisma : null;
  },
}));

// Mock lib/share
const mockGetOrCreateShareSlug = vi.fn();
const mockRevokeShareSlug = vi.fn();
vi.mock('@/lib/share', () => ({
  getOrCreateShareSlug: (assetId: string) => mockGetOrCreateShareSlug(assetId),
  revokeShareSlug: (assetId: string) => mockRevokeShareSlug(assetId),
}));

// Mock lib/slug-cache
const mockResolveShareSlug = vi.fn();
const mockInvalidateSlugCache = vi.fn();
vi.mock('@/lib/slug-cache', () => ({
  resolveShareSlug: (slug: string) => mockResolveShareSlug(slug),
  invalidateSlugCache: (slug: string) => mockInvalidateSlugCache(slug),
}));

describe('Share flow', () => {
  const mockUserId = 'qa-user-123';
  const mockAssetId = 'asset_123';
  const mockSlug = 'aB3dF9Gh12';
  const mockBlobUrl = 'https://example.public.blob.vercel-storage.com/test.jpg';

  beforeEach(() => {
    vi.clearAllMocks();
    mockDatabaseAvailable = true;
    process.env.NEXT_PUBLIC_BASE_URL = 'https://sploot.app';
    process.env.NODE_ENV = 'test';
    process.env.SPLOOT_QA_AUTH_MODE = 'enabled';
    process.env.SPLOOT_QA_AUTH_SECRET = 'test-secret-with-enough-entropy';
    process.env.SPLOOT_DEPLOYMENT_ENV = 'test';
    process.env.SPLOOT_QA_DEPLOYMENT_ID = QA_LOCAL_DEPLOYMENT_ID;
    process.env.SPLOOT_QA_DEPLOYMENT_ENV = QA_LOCAL_DEPLOYMENT_ENV;
    process.env.SPLOOT_QA_AUDIENCE = QA_LOCAL_AUDIENCE;
    process.env.CLERK_SECRET_KEY = '';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = '';
    mockPrisma.user.findUnique.mockResolvedValue({ id: mockUserId });
  });

  async function authenticatedRequest(method: 'POST' | 'DELETE' = 'POST'): Promise<NextRequest> {
    const token = await createQaLocalAuthToken({
      userId: mockUserId,
      secret: 'test-secret-with-enough-entropy',
      expiresInSeconds: 60,
    });
    return new NextRequest('http://localhost:3000/api/assets/asset_123/share', {
      method,
      headers: { [getQaLocalAuthHeader()]: token, 'x-forwarded-for': '127.0.0.1' },
    });
  }

  describe('POST /api/assets/[id]/share', () => {
    it('generates share link for asset owner', async () => {
      // Mock asset lookup - owner matches
      mockPrisma.asset.findFirst.mockResolvedValue({
        id: mockAssetId,
        ownerUserId: mockUserId,
        deletedAt: null,
      });

      // Mock share slug generation
      mockGetOrCreateShareSlug.mockResolvedValue(mockSlug);

      const response = await POST(
        await authenticatedRequest(),
        { params: Promise.resolve({ id: mockAssetId }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.shareUrl).toBe(`https://sploot.app/s/${mockSlug}`);
      expect(mockGetOrCreateShareSlug).toHaveBeenCalledWith(mockAssetId);
    });

    it('returns same URL on repeated shares (idempotency)', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue({
        id: mockAssetId,
        ownerUserId: mockUserId,
        deletedAt: null,
      });
      mockGetOrCreateShareSlug.mockResolvedValue(mockSlug);

      // First share
      const response1 = await POST(
        await authenticatedRequest(),
        { params: Promise.resolve({ id: mockAssetId }) }
      );
      const data1 = await response1.json();

      // Second share
      const response2 = await POST(
        await authenticatedRequest(),
        { params: Promise.resolve({ id: mockAssetId }) }
      );
      const data2 = await response2.json();

      expect(data1.shareUrl).toBe(data2.shareUrl);
      expect(mockGetOrCreateShareSlug).toHaveBeenCalledTimes(2);
    });

    it('rejects non-owner share attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'different_user' });

      // Asset belongs to different user
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      const response = await POST(
        await authenticatedRequest(),
        { params: Promise.resolve({ id: mockAssetId }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Asset not found');
      expect(mockGetOrCreateShareSlug).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated share attempts', async () => {
      const response = await POST(
        new NextRequest('http://localhost:3000/api/assets/asset_123/share', { method: 'POST' }),
        { params: Promise.resolve({ id: mockAssetId }) }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('rejects sharing soft-deleted assets', async () => {

      // Asset is soft-deleted
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      const response = await POST(
        await authenticatedRequest(),
        { params: Promise.resolve({ id: mockAssetId }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Asset not found');
    });

    it('handles database unavailable gracefully', async () => {
      mockDatabaseAvailable = false;

      const response = await POST(
        await authenticatedRequest(),
        { params: Promise.resolve({ id: mockAssetId }) }
      );

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.code).toBe('enrollment_unavailable');
    });
  });

  describe('DELETE /api/assets/[id]/share', () => {
    it('revokes an active share link for the asset owner', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue({
        id: mockAssetId,
        ownerUserId: mockUserId,
        deletedAt: null,
      });
      mockRevokeShareSlug.mockResolvedValue(mockSlug);

      const response = await DELETE(
        await authenticatedRequest('DELETE'),
        { params: Promise.resolve({ id: mockAssetId }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.revoked).toBe(true);
      expect(mockRevokeShareSlug).toHaveBeenCalledWith(mockAssetId);
      expect(mockInvalidateSlugCache).toHaveBeenCalledWith(mockSlug);
    });

    it('is idempotent when the asset has no active share link', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue({
        id: mockAssetId,
        ownerUserId: mockUserId,
        deletedAt: null,
      });
      mockRevokeShareSlug.mockResolvedValue(null);

      const response = await DELETE(
        await authenticatedRequest('DELETE'),
        { params: Promise.resolve({ id: mockAssetId }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.revoked).toBe(false);
      expect(mockInvalidateSlugCache).not.toHaveBeenCalled();
    });

    it('rejects non-owner revoke attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'different_user' });
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      const response = await DELETE(
        await authenticatedRequest('DELETE'),
        { params: Promise.resolve({ id: mockAssetId }) }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Asset not found');
      expect(mockRevokeShareSlug).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated revoke attempts', async () => {
      const response = await DELETE(
        new NextRequest('http://localhost:3000/api/assets/asset_123/share', { method: 'DELETE' }),
        { params: Promise.resolve({ id: mockAssetId }) }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
      expect(mockRevokeShareSlug).not.toHaveBeenCalled();
    });

    it('handles database unavailable gracefully', async () => {
      mockDatabaseAvailable = false;

      const response = await DELETE(
        await authenticatedRequest('DELETE'),
        { params: Promise.resolve({ id: mockAssetId }) }
      );

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.code).toBe('enrollment_unavailable');
    });
  });

  describe('Share lifecycle: create -> public read -> revoke -> denied read', () => {
    it('serves the meme after sharing and 404s the same id once revoked', async () => {
      // 1. Create: owner shares the asset, gets a slug back.
      mockPrisma.asset.findFirst.mockResolvedValue({
        id: mockAssetId,
        ownerUserId: mockUserId,
        deletedAt: null,
      });
      mockGetOrCreateShareSlug.mockResolvedValue(mockSlug);

      const createResponse = await POST(
        await authenticatedRequest('POST'),
        { params: Promise.resolve({ id: mockAssetId }) }
      );
      expect(createResponse.status).toBe(200);
      const { shareUrl } = await createResponse.json();
      expect(shareUrl).toBe(`https://sploot.app/s/${mockSlug}`);

      // 2. Public read: /m/[id] resolves metadata for the now-shared asset
      // (the real `where: { shareSlug: { not: null } }` clause is exercised
      // against Postgres in production; this mock stands in for "asset is
      // currently shared" by returning a row).
      mockPrisma.asset.findFirst.mockResolvedValue({
        id: mockAssetId,
        blobUrl: mockBlobUrl,
        mime: 'image/jpeg',
        width: 1200,
        height: 630,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        size: 1024000,
      });
      const liveMetadata = await generateMetadata({ params: Promise.resolve({ id: mockAssetId }) });
      expect(liveMetadata.title).toBe('a banger from the pile | sploot');
      expect(liveMetadata.openGraph).toBeDefined();

      // 3. Revoke: owner nulls the share link.
      mockPrisma.asset.findFirst.mockResolvedValue({
        id: mockAssetId,
        ownerUserId: mockUserId,
        deletedAt: null,
      });
      mockRevokeShareSlug.mockResolvedValue(mockSlug);

      const revokeResponse = await DELETE(
        await authenticatedRequest('DELETE'),
        { params: Promise.resolve({ id: mockAssetId }) }
      );
      expect(revokeResponse.status).toBe(200);
      expect((await revokeResponse.json()).revoked).toBe(true);
      expect(mockInvalidateSlugCache).toHaveBeenCalledWith(mockSlug);

      // 4. Denied read: the id's `shareSlug` is now null, so the
      // `shareSlug: { not: null }` filter excludes the row and the query
      // returns nothing — same as the never-shared and soft-deleted cases.
      mockPrisma.asset.findFirst.mockResolvedValue(null);
      const deadMetadata = await generateMetadata({ params: Promise.resolve({ id: mockAssetId }) });
      expect(deadMetadata.title).toBe('dead meme link | sploot');
      expect(deadMetadata.openGraph).toBeUndefined();

      // 5. Denied read via slug: the cache was invalidated, so the real
      // `/s/[slug]` page's `resolveShareSlug` call hits the authoritative
      // (now `shareSlug = NULL`) row and finds nothing — no redirect fires,
      // just the dead-link state.
      mockResolveShareSlug.mockResolvedValue(null);
      const deniedShareUi = await ShareSlugPage({
        params: Promise.resolve({ slug: mockSlug }),
        searchParams: Promise.resolve({}),
      });
      expect(mockResolveShareSlug).toHaveBeenCalledWith(mockSlug);
      expect(deniedShareUi.props.kind).toBe('slug');
    });
  });

  describe('Public meme page metadata', () => {
    it('generates valid OG tags for existing asset', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue({
        id: mockAssetId,
        blobUrl: mockBlobUrl,
        mime: 'image/jpeg',
        width: 1200,
        height: 630,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        size: 1024000,
      });

      const metadata = await generateMetadata({
        params: Promise.resolve({ id: mockAssetId }),
      });

      expect(metadata.title).toBe('a banger from the pile | sploot');
      expect(metadata.description).toBe(
        'no folders. just vibes. sploot sorts your camera roll into a pile you can actually search.'
      );
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.openGraph?.title).toBe('a banger from the pile | sploot');
      expect(metadata.openGraph?.description).toBe(
        'no folders. just vibes. sploot sorts your camera roll into a pile you can actually search.'
      );
      expect(metadata.openGraph?.images).toHaveLength(1);
      expect(metadata.openGraph?.images?.[0]).toMatchObject({
        url: mockBlobUrl,
        width: 1200,
        height: 630,
        alt: 'Shared meme from Sploot',
      });
      expect(metadata.openGraph?.siteName).toBe('Sploot');
      expect(metadata.openGraph?.type).toBe('website');
      expect(metadata.openGraph).not.toHaveProperty('videos');

      expect(metadata.twitter).toBeDefined();
      expect(metadata.twitter?.card).toBe('summary_large_image');
      expect(metadata.twitter?.title).toBe('a banger from the pile | sploot');
      expect(metadata.twitter?.description).toBe(
        'no folders. just vibes. sploot sorts your camera roll into a pile you can actually search.'
      );
      expect(metadata.twitter?.images).toEqual([mockBlobUrl]);
    });

    it('unfurls video shares with the poster thumbnail, not the video file', async () => {
      const mockThumbnailUrl = 'https://example.public.blob.vercel-storage.com/test-thumb.jpg';
      mockPrisma.asset.findFirst.mockResolvedValue({
        id: mockAssetId,
        blobUrl: mockBlobUrl,
        thumbnailUrl: mockThumbnailUrl,
        mime: 'video/mp4',
        width: 1280,
        height: 720,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        size: 4096000,
      });

      const metadata = await generateMetadata({
        params: Promise.resolve({ id: mockAssetId }),
      });

      expect(metadata.openGraph?.images?.[0]).toMatchObject({ url: mockThumbnailUrl });
      expect(metadata.twitter?.images).toEqual([mockThumbnailUrl]);
      expect(metadata.openGraph?.videos).toEqual([
        { url: mockBlobUrl, width: 1280, height: 720, type: 'video/mp4' },
      ]);

      const structuredData = JSON.parse(metadata.other?.['application/ld+json'] as string);
      expect(structuredData['@type']).toBe('VideoObject');
      expect(structuredData.contentUrl).toBe(mockBlobUrl);
      expect(structuredData.thumbnailUrl).toBe(mockThumbnailUrl);
    });

    it('falls back to the video file for og:image when a video has no thumbnail yet', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue({
        id: mockAssetId,
        blobUrl: mockBlobUrl,
        thumbnailUrl: null,
        mime: 'video/webm',
        width: 1280,
        height: 720,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        size: 4096000,
      });

      const metadata = await generateMetadata({
        params: Promise.resolve({ id: mockAssetId }),
      });

      expect(metadata.openGraph?.images?.[0]).toMatchObject({ url: mockBlobUrl });
    });

    it('returns dead-link metadata for non-existent asset', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      const metadata = await generateMetadata({
        params: Promise.resolve({ id: 'invalid-id' }),
      });

      expect(metadata.title).toBe('dead meme link | sploot');
      expect(metadata.openGraph).toBeUndefined();
    });

    it('returns dead-link metadata for soft-deleted asset', async () => {
      // Prisma query filters deletedAt, returns null
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      const metadata = await generateMetadata({
        params: Promise.resolve({ id: 'deleted-asset' }),
      });

      expect(metadata.title).toBe('dead meme link | sploot');
      expect(metadata.openGraph).toBeUndefined();
    });

    it('uses default dimensions when width/height missing', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue({
        id: mockAssetId,
        blobUrl: mockBlobUrl,
        mime: 'image/jpeg',
        width: null,
        height: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        size: 512000,
      });

      const metadata = await generateMetadata({
        params: Promise.resolve({ id: mockAssetId }),
      });

      expect(metadata.openGraph?.images?.[0]).toMatchObject({
        url: mockBlobUrl,
        width: 1200,
        height: 630,
      });
    });

    it('handles database unavailable gracefully', async () => {
      mockDatabaseAvailable = false;

      const metadata = await generateMetadata({
        params: Promise.resolve({ id: mockAssetId }),
      });

      expect(metadata.title).toBe('dead meme link | sploot');
    });
  });
});

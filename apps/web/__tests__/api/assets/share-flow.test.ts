import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createQaLocalAuthToken, getQaLocalAuthHeader, getQaLocalRemoteAddressHeader } from '@/lib/auth/qa-local';
import { POST } from '@/app/api/assets/[id]/share/route';
import { generateMetadata } from '@/app/m/[id]/page';

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
vi.mock('@/lib/share', () => ({
  getOrCreateShareSlug: (assetId: string) => mockGetOrCreateShareSlug(assetId),
}));

// Mock lib/slug-cache
const mockResolveShareSlug = vi.fn();
vi.mock('@/lib/slug-cache', () => ({
  resolveShareSlug: (slug: string) => mockResolveShareSlug(slug),
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
    process.env.SPLOOT_QA_EVIDENCE_MODE = 'enabled';
    process.env.SPLOOT_QA_DEPLOYMENT_ID = 'sploot-gallery-qa-local';
    process.env.SPLOOT_QA_DEPLOYMENT_AUDIENCE = 'sploot-gallery-evidence';
    process.env.SPLOOT_QA_AUTH_SECRET = 'test-secret-with-enough-entropy';
    process.env.SPLOOT_DEPLOYMENT_ENV = 'test';
    process.env.DEPLOYMENT_ENV = 'qa-local';
    process.env.CLERK_SECRET_KEY = '';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = '';
    mockPrisma.user.findUnique.mockResolvedValue({ id: mockUserId });
  });

  async function authenticatedRequest(): Promise<NextRequest> {
    const token = await createQaLocalAuthToken({
      userId: mockUserId,
      secret: 'test-secret-with-enough-entropy',
      expiresInSeconds: 60,
    });
    return new NextRequest('http://localhost:3000/api/assets/asset_123/share', {
      method: 'POST',
      headers: {
        [getQaLocalAuthHeader()]: token,
        [getQaLocalRemoteAddressHeader()]: '127.0.0.1',
      },
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

      expect(metadata.title).toBe('From Sploot - Your personal meme library');
      expect(metadata.description).toBe('Discover and curate your meme collection with lightning-fast semantic search. Save, organize, and share memes that matter.');
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.openGraph?.title).toBe('From Sploot - Your personal meme library');
      expect(metadata.openGraph?.description).toBe('Discover and curate your meme collection with lightning-fast semantic search. Save, organize, and share memes that matter.');
      expect(metadata.openGraph?.images).toHaveLength(1);
      expect(metadata.openGraph?.images?.[0]).toMatchObject({
        url: mockBlobUrl,
        width: 1200,
        height: 630,
        alt: 'Shared meme from Sploot',
      });
      expect(metadata.openGraph?.siteName).toBe('Sploot');
      expect(metadata.openGraph?.type).toBe('website');

      expect(metadata.twitter).toBeDefined();
      expect(metadata.twitter?.card).toBe('summary_large_image');
      expect(metadata.twitter?.title).toBe('From Sploot - Your personal meme library');
      expect(metadata.twitter?.description).toBe('Discover and curate your meme collection with lightning-fast semantic search. Save, organize, and share memes that matter.');
      expect(metadata.twitter?.images).toEqual([mockBlobUrl]);
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

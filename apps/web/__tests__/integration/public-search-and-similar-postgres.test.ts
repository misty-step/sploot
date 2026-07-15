import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { EMBEDDING_DIMENSION } from '@sploot/common';

const AUTH_USER_ID = 'public-vector-route-user';

vi.mock('@/lib/auth/with-authenticated-api', () => ({
  withAuthenticatedApi: (handler: (request: NextRequest, context: any, auth: any) => Promise<Response>) =>
    (request: NextRequest, context: any = {}) => handler(request, context, {
      principal: { userId: AUTH_USER_ID, credentialKind: 'upload-token' },
      auth: { status: 'authenticated' },
    }),
}));

import { GET as similarAssets } from '@/app/api/assets/[id]/similar/route';
import { POST as publicSearch } from '@/app/api/search/route';
import { CLIP_MODEL } from '@/lib/embeddings';
import { getCacheService } from '@/lib/cache';
import { prisma, upsertAssetEmbedding } from '@/lib/db';

const describeWithDatabase = process.env.DATABASE_URL && prisma
  ? describe.sequential
  : describe.skip;

const sourceId = `${AUTH_USER_ID}-a-source`;
const neighborId = `${AUTH_USER_ID}-b-neighbor`;
const query = 'public-route-search-fixture';
const embedding = Array(EMBEDDING_DIMENSION).fill(0.1);

describeWithDatabase('pgvector public route seams', () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { id: AUTH_USER_ID } });
    await prisma.user.create({ data: { id: AUTH_USER_ID, email: `${AUTH_USER_ID}@example.test` } });
    await prisma.asset.createMany({
      data: [sourceId, neighborId].map((id) => ({
        id,
        ownerUserId: AUTH_USER_ID,
        blobUrl: `https://public-route.public.blob.vercel-storage.com/${id}.png`,
        pathname: `${id}.png`,
        mime: 'image/png',
        size: 1,
        checksumSha256: `${id}-checksum`,
      })),
    });
    await upsertAssetEmbedding({
      assetId: sourceId,
      modelName: CLIP_MODEL,
      modelVersion: CLIP_MODEL,
      dim: EMBEDDING_DIMENSION,
      embedding,
    });
    await upsertAssetEmbedding({
      assetId: neighborId,
      modelName: CLIP_MODEL,
      modelVersion: CLIP_MODEL,
      dim: EMBEDDING_DIMENSION,
      embedding,
    });
    await getCacheService().setTextEmbedding(query, embedding, CLIP_MODEL);
  }, 30_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: AUTH_USER_ID } });
  });

  it('serves the public search route from real pgvector results and preserves its page contract', async () => {
    const response = await publicSearch(new NextRequest('http://localhost/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, limit: 1, threshold: 0.99 }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe(sourceId);
    expect(body.results[0].relevance).toBeGreaterThanOrEqual(99);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toEqual(expect.any(String));
  });

  it('serves similar assets through the direct pgvector path', async () => {
    const response = await similarAssets(
      new NextRequest(`http://localhost/api/assets/${sourceId}/similar?limit=1`),
      { params: Promise.resolve({ id: sourceId }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reason).toBeNull();
    expect(body.results.map((result: { id: string }) => result.id)).toEqual([neighborId]);
  });
});

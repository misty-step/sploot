import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { prisma, vectorSearch, type VectorSearchRow } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import type { AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import type { RouteContext } from '@/lib/with-observability';
import { DEFAULT_NEAR_DUPLICATE_DISTANCE, hammingDistanceHex } from '@/lib/upload/perceptual-hash-service';

async function getHandler(
  req: NextRequest,
  context: RouteContext,
  { principal }: AuthenticatedApiContext,
) {
  try {
    const userId = principal.userId;

    const params = await context.params;
    const id = params?.id;

    if (!id || !prisma) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const sourceAsset = await prisma.asset.findFirst({
      where: { id, ownerUserId: userId, deletedAt: null },
      select: { phash: true },
    });

    if (!sourceAsset) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Get the asset's embedding vector
    const embedding = await prisma.$queryRaw<
      Array<{ image_embedding: string }>
    >`
      SELECT image_embedding::text
      FROM "asset_embeddings"
      WHERE "asset_id" = ${id}
        AND "status" = 'ready'
      LIMIT 1
    `;

    if (!embedding.length) {
      // The source asset exists but has no ready vector yet (still embedding,
      // or embedding failed). This is not an error and not an empty library —
      // the client renders a quiet "still embedding" note so the section never
      // looks broken.
      return NextResponse.json({ results: [], reason: 'source-unembedded' });
    }

    // Parse the vector string back to number array
    const vectorStr = embedding[0].image_embedding;
    const vector = vectorStr
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map(Number);

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '12', 10), 30);

    // Search for similar assets
    const results = await vectorSearch(userId, vector, { limit: limit + 1 });

    // Filter out the current asset
    const withoutSource = results.filter((r: { id: string }) => r.id !== id);
    const phashes = await prisma.asset.findMany({
      where: { id: { in: withoutSource.map((result) => result.id) } },
      select: { id: true, phash: true },
    });
    const phashById = new Map(phashes.map((asset) => [asset.id, asset.phash]));

    const filtered = withoutSource
      .filter((result) => {
        const candidatePhash = phashById.get(result.id);
        if (!sourceAsset.phash || !candidatePhash) return true;
        return hammingDistanceHex(sourceAsset.phash, candidatePhash) > DEFAULT_NEAR_DUPLICATE_DISTANCE;
      })
      .slice(0, limit);

    const formattedResults = filtered.map((result: VectorSearchRow) => ({
      id: result.id,
      blobUrl: result.blob_url,
      thumbnailUrl: result.thumbnail_url,
      pathname: result.pathname,
      filename: result.pathname.split('/').pop() || result.pathname,
      mime: result.mime,
      width: result.width,
      height: result.height,
      favorite: result.favorite,
      size: result.size,
      createdAt: result.created_at,
      embedding: { assetId: result.id },
      embeddingStatus: 'ready' as const,
      similarity: result.distance,
      relevance: Math.round(result.distance * 100),
    }));

    // Source is embedded but the library has nothing else near it. Distinct
    // from source-unembedded so the client can explain why the grid is empty.
    const reason = formattedResults.length === 0 ? 'no-neighbors' : null;

    return NextResponse.json({ results: formattedResults, reason });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json(
      { error: 'Failed to fetch similar assets' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(withAuthenticatedApi(getHandler), { operation: 'assets:similar' });

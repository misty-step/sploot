import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { prisma, vectorSearch } from '@/lib/db';
import { getAuth } from '@/lib/auth/server';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';
import { DEFAULT_NEAR_DUPLICATE_DISTANCE, hammingDistanceHex } from '@/lib/upload/perceptual-hash-service';
import { normalizeAssetToGridDto } from '@/lib/asset-grid-dto';
import type { SimilarAssetsResponse } from '@/lib/types';

async function getHandler(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { userId } = await getAuth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    const rawLimit = searchParams.get('limit');
    const limit = rawLimit === null ? 12 : Number(rawLimit);
    if (!/^\d+$/.test(rawLimit ?? '12') || !Number.isSafeInteger(limit) || limit < 1 || limit > 30) {
      return NextResponse.json(
        { error: 'Invalid limit parameter', code: 'invalid_search_parameter' },
        { status: 400 },
      );
    }

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

    const resultTags = await prisma.assetTag.findMany({
      where: { assetId: { in: filtered.map((result) => result.id) } },
      include: { tag: true },
    });
    const tagsByAsset = new Map<string, Array<{ id: string; name: string }>>();
    for (const row of resultTags) {
      const tags = tagsByAsset.get(row.assetId) ?? [];
      tags.push({ id: row.tag.id, name: row.tag.name });
      tagsByAsset.set(row.assetId, tags);
    }

    const formattedResults = filtered.map((result) =>
      normalizeAssetToGridDto(result, {
        embeddingStatus: 'ready',
        tags: {
          tags: tagsByAsset.get(result.id) ?? [],
        },
        similarity: {
          similarity: result.distance,
          relevance: Math.round(result.distance * 100),
        },
      }),
    );

    // Source is embedded but the library has nothing else near it. Distinct
    // from source-unembedded so the client can explain why the grid is empty.
    const reason = formattedResults.length === 0 ? 'no-neighbors' : null;

    const responseBody: SimilarAssetsResponse = { results: formattedResults, reason };
    return NextResponse.json(responseBody);
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json(
      { error: 'Failed to fetch similar assets' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, { operation: 'assets:similar' });

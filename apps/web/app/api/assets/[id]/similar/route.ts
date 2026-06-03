import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { prisma, vectorSearch } from '@/lib/db';
import { getAuth } from '@/lib/auth/server';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';

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
      return NextResponse.json({ results: [] });
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
    const filtered = results
      .filter((r: { id: string }) => r.id !== id)
      .slice(0, limit);

    const formattedResults = filtered.map((result: { id: string; blob_url: string; pathname: string; mime: string; width: number | null; height: number | null; favorite: boolean; size: number; created_at: Date; distance: number }) => ({
      id: result.id,
      blobUrl: result.blob_url,
      thumbnailUrl: null,
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

    return NextResponse.json({ results: formattedResults });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json(
      { error: 'Failed to fetch similar assets' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, { operation: 'assets:similar' });

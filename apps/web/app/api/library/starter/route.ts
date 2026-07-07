import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import {
  withAuthenticatedApi,
  type AuthenticatedApiContext,
} from '@/lib/auth/with-authenticated-api';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import { getCacheService } from '@/lib/cache';
import { CLIP_MODEL } from '@/lib/embeddings';
import { ingestImage } from '@/lib/upload/ingest-image';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import { withObservability } from '@/lib/with-observability';
import { logger } from '@/lib/logger';
import { STARTER_IMAGES, STARTER_QUERIES, STARTER_PILE_TAG } from '@/lib/starter-pile';

/**
 * Seed the signed-in user's library with the starter pile: 8 bundled,
 * license-safe meme images ingested through the normal upload pipeline
 * (blob + record + tags), with their precomputed CLIP embeddings written
 * directly so semantic search works immediately — no embedding provider on
 * the path. Idempotent: the pipeline's checksum dedupe makes re-seeding a
 * no-op, and the embedding upsert repairs any half-seeded state.
 *
 * Opt-in only (the first-run empty state offers it); every asset is tagged
 * `starter-pile` so the whole pile is one tag-filter + delete away.
 */
export const maxDuration = 60;

async function postHandler(
  req: NextRequest,
  _context: unknown,
  { principal }: AuthenticatedApiContext
) {
  const startTime = Date.now();

  try {
    const userId = principal.userId;

    const uploadGate = getRuntimeGate('uploads');
    if (!uploadGate.enabled) {
      return runtimeGateResponse(uploadGate);
    }

    if (!prisma) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // The starter images ship in public/starter-pile/; fetch them from this
    // deployment's own static origin (works locally and on Vercel, where
    // public/ files are not on the function's filesystem).
    const origin = new URL(req.url).origin;

    let seeded = 0;
    let already = 0;
    const failed: string[] = [];

    for (const item of STARTER_IMAGES) {
      try {
        const res = await fetch(`${origin}/starter-pile/${item.file}`);
        if (!res.ok) {
          logger.warn('Starter image fetch failed', { file: item.file, status: res.status });
          failed.push(item.file);
          continue;
        }
        const bytes = await res.arrayBuffer();
        const file = new File([bytes], item.file, { type: 'image/jpeg' });

        const result = await ingestImage({
          userId,
          file,
          tags: [STARTER_PILE_TAG],
          // The real vector is upserted directly below — never spend a
          // Replicate call, rate-limit lease, or budget slot on these.
          scheduleEmbeddings: false,
        });

        if (result.kind === 'invalid') {
          logger.warn('Starter image rejected by ingest', {
            file: item.file,
            error: result.error.userMessage,
          });
          failed.push(item.file);
          continue;
        }

        // Write the precomputed vector. For duplicates this is the repair
        // path if a previous seed died between record and embedding.
        await upsertAssetEmbedding({
          assetId: result.asset.id,
          modelName: CLIP_MODEL,
          modelVersion: CLIP_MODEL,
          dim: item.dim,
          embedding: item.embedding,
        });

        if (result.kind === 'created') seeded += 1;
        else already += 1;
      } catch (error) {
        unstable_rethrow(error);
        logger.error('Starter image seed failed', {
          file: item.file,
          error: error instanceof Error ? error.message : String(error),
        });
        failed.push(item.file);
      }
    }

    // Warm the persistent text-embedding cache for the suggested first
    // queries, so the user's first search is deterministic and instant too.
    const cache = getCacheService();
    for (const query of STARTER_QUERIES) {
      await cache.setTextEmbedding(query.text, query.embedding, CLIP_MODEL);
    }

    logger.info('Starter pile seeded', {
      userId,
      seeded,
      already,
      failed: failed.length,
      duration: Date.now() - startTime,
    });

    return NextResponse.json({
      seeded,
      already,
      failed,
      total: STARTER_IMAGES.length,
      suggestedQueries: STARTER_QUERIES.map((q) => q.text),
    });
  } catch (error) {
    unstable_rethrow(error);
    logger.error('Starter pile seeding failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to seed starter pile' }, { status: 500 });
  }
}

export const POST = withObservability(withAuthenticatedApi(postHandler), {
  operation: 'library:starter-seed',
});

import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import {
  withAuthenticatedApi,
  type AuthenticatedApiContext,
} from '@/lib/auth/with-authenticated-api';
import { prisma } from '@/lib/db';
import { enrollmentUnavailableResponse } from '@/lib/enrollment/enrollment-policy';
import { openExportObject } from '@/lib/export/export-objects';
import { partFileName } from '@/lib/export/export-policy';
import {
  accessExportForDownload,
  entriesForPart,
  isEgressExhausted,
  recordPartOutcome,
} from '@/lib/export/export-service';
import { streamExportPartZip } from '@/lib/export/export-zip';
import type { RouteContext } from '@/lib/with-observability';
import { withObservability } from '@/lib/with-observability';
import logger from '@/lib/logger';

/**
 * Streams one byte-bounded zip part of a library export.
 *
 * Idempotent by design: a part is a pure function of the frozen snapshot,
 * so an interrupted download is retried by simply requesting the same part
 * again. The server marks a part "served" (and records any missing or
 * corrupt objects) only after the final byte has been handed to the
 * response stream. Total egress per export is capped; the capability dies
 * with the export's expiry or cancellation.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Streaming a 256 MB part over a slow link can take a while; inert on
// DigitalOcean, honored where platforms enforce function duration.
export const maxDuration = 300;

const PART_INDEX_PATTERN = /^\d+$/;

async function getHandler(
  _req: NextRequest,
  context: RouteContext,
  { principal }: AuthenticatedApiContext,
) {
  try {
    if (!prisma) return enrollmentUnavailableResponse();
    const params = await context.params;
    const exportId = params.exportId ?? '';
    const rawIndex = params.partIndex ?? '';

    const access = await accessExportForDownload(principal.userId, exportId);
    if (access.kind === 'not_found') {
      return NextResponse.json({ error: 'Export not found' }, { status: 404 });
    }
    if (access.kind === 'gone') {
      return NextResponse.json(
        {
          error:
            access.code === 'export_expired'
              ? 'This export has expired. Start a new export from Settings.'
              : 'This export is no longer available. Start a new export from Settings.',
          code: access.code,
          retryable: false,
        },
        { status: 410 },
      );
    }

    const row = access.row;
    if (!PART_INDEX_PATTERN.test(rawIndex)) {
      return NextResponse.json({ error: 'Export part not found' }, { status: 404 });
    }
    const partIndex = Number(rawIndex);
    if (!Number.isSafeInteger(partIndex) || partIndex >= row.partBoundaries.length) {
      return NextResponse.json({ error: 'Export part not found' }, { status: 404 });
    }

    if (isEgressExhausted(row)) {
      return NextResponse.json(
        {
          error: 'This export hit its download budget. Start a new export from Settings.',
          code: 'export_egress_exhausted',
          retryable: false,
        },
        { status: 429 },
      );
    }

    const entries = await entriesForPart(row, partIndex);
    const stream = streamExportPartZip({
      entries,
      reader: openExportObject,
      onComplete: async ({ failures, bytesStreamed }) => {
        try {
          await recordPartOutcome(row.id, partIndex, failures, bytesStreamed);
        } catch (error) {
          // The bytes were delivered; losing the bookkeeping must not break
          // the download. The part simply stays un-served for retry.
          logger.error('library-export:part-outcome-failed', error);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${partFileName(
          row.id,
          partIndex,
          row.partBoundaries.length,
        )}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logger.error('library-export:part-failed', error);
    return NextResponse.json({ error: 'Failed to stream export part' }, { status: 500 });
  }
}

export const GET = withObservability(withAuthenticatedApi(getHandler), {
  operation: 'library-export:part',
});

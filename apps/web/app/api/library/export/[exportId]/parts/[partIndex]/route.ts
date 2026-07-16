import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import {
  withAuthenticatedApi,
  type AuthenticatedApiContext,
} from '@/lib/auth/with-authenticated-api';
import { prisma } from '@/lib/db';
import {
  acquireEnrollmentIdentityWriterLock,
  enrollmentUnavailableResponse,
} from '@/lib/enrollment/enrollment-policy';
import { exportAdmissionErrorResponse } from '@/lib/export/export-http';
import { openExportObject } from '@/lib/export/export-objects';
import { estimatePartEgressBytes, partFileName } from '@/lib/export/export-policy';
import {
  accessExportForDownload,
  entriesForPart,
  recordPartOutcome,
  refundExportEgress,
  reserveExportEgress,
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
 * response stream. The capability dies with the export's expiry or
 * cancellation.
 *
 * Egress bound: a conservative reservation for the whole part is atomically
 * charged BEFORE the first byte streams (no bytes otherwise), the stream
 * hard-caps at that reservation, and only a cleanly completed stream settles
 * the charge down to the actual bytes. Aborted or interrupted deliveries
 * stay charged in full — that is what keeps the advertised cap true under
 * concurrency, aborts, and process death.
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

    // Serialize admission with permanent deletion. The transaction ends before
    // any network streaming begins: it only fences snapshot membership and
    // reserves egress, then the immutable entry list is streamed afterward.
    const reserve = estimatePartEgressBytes(row.partBoundaries[partIndex]);
    const { admission, entries } = await prisma.$transaction(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, row.ownerUserId);
      const admission = await reserveExportEgress(row, reserve, new Date(), tx);
      if (admission.kind !== 'reserved') return { admission, entries: null };
      return { admission, entries: await entriesForPart(row, partIndex, tx) };
    });
    if (admission.kind === 'gone') {
      return NextResponse.json(
        { error: 'This export is no longer available.', code: 'export_unavailable', retryable: false },
        { status: 410 },
      );
    }
    if (admission.kind !== 'reserved') return exportAdmissionErrorResponse(admission);
    if (!entries) throw new Error('reserved export part has no entries');
    const stream = streamExportPartZip({
      entries,
      reader: openExportObject,
      maxBytes: reserve,
      onComplete: async ({ failures, bytesStreamed }) => {
        try {
          await recordPartOutcome(row.id, partIndex, failures);
          // Clean completion: settle the conservative reservation down to the
          // bytes actually streamed. If this is lost (crash, DB blip), the
          // full charge simply stands — conservative, never unbounded.
          await refundExportEgress(row.id, reserve - BigInt(bytesStreamed));
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

import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import {
  withAuthenticatedApi,
  type AuthenticatedApiContext,
} from '@/lib/auth/with-authenticated-api';
import { prisma } from '@/lib/db';
import { enrollmentUnavailableResponse } from '@/lib/enrollment/enrollment-policy';
import { exportAdmissionErrorResponse } from '@/lib/export/export-http';
import {
  estimateManifestEgressBytesForExport,
  streamExportManifest,
} from '@/lib/export/export-manifest';
import { manifestFileName } from '@/lib/export/export-policy';
import {
  accessExportForDownload,
  refundExportEgress,
  reserveExportEgress,
} from '@/lib/export/export-service';
import type { RouteContext } from '@/lib/with-observability';
import { withObservability } from '@/lib/with-observability';
import logger from '@/lib/logger';

/**
 * Streams the export's versioned manifest.json — the integrity record that
 * lists every snapshot asset with portable metadata and explicitly states
 * completeness, unserved parts, and failed/missing objects. Download it
 * after the parts so it reflects everything the server actually served.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function getHandler(
  _req: NextRequest,
  context: RouteContext,
  { principal }: AuthenticatedApiContext,
) {
  try {
    if (!prisma) return enrollmentUnavailableResponse();
    const { exportId } = await context.params;

    const access = await accessExportForDownload(principal.userId, exportId ?? '');
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

    // Durable pre-stream admission: the manifest shares the export's egress
    // budget, so its conservative reservation must fit before any byte
    // streams; the stream hard-caps at the reservation and a clean completion
    // settles the charge down to actual bytes (aborts stay charged).
    const reserve = await estimateManifestEgressBytesForExport(row);
    const admission = await reserveExportEgress(row, reserve);
    if (admission.kind !== 'reserved') {
      return exportAdmissionErrorResponse(admission);
    }

    const stream = streamExportManifest({
      row,
      maxBytes: reserve,
      onComplete: async (bytesStreamed) => {
        try {
          await refundExportEgress(row.id, reserve - BigInt(bytesStreamed));
        } catch (error) {
          logger.error('library-export:manifest-egress-failed', error);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${manifestFileName(row.id)}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logger.error('library-export:manifest-failed', error);
    return NextResponse.json({ error: 'Failed to stream export manifest' }, { status: 500 });
  }
}

export const GET = withObservability(withAuthenticatedApi(getHandler), {
  operation: 'library-export:manifest',
});

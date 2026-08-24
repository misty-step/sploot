import { NextResponse } from 'next/server';
import type { IngestImageResult } from '@/lib/upload/ingest-image';

/**
 * Published save-verb JSON for a completed ingest.
 *
 * `POST /api/upload` and `POST /api/upload/url` share this 201 / 409 /
 * invalid contract (`docs/PUBLIC_API.md`). Catch-path errors stay
 * per-route: they differ on LeaseLostError, 500 body shape, and
 * EmbeddingError vs enrollment order.
 */
export function ingestResultToUploadResponse(result: IngestImageResult): NextResponse {
  if (result.kind === 'invalid') {
    return NextResponse.json(
      { success: false, error: result.error.userMessage },
      { status: result.error.statusCode },
    );
  }

  if (result.kind === 'duplicate') {
    return NextResponse.json(
      {
        success: true,
        isDuplicate: true,
        asset: result.asset,
        message: 'This image already exists in your library',
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      isDuplicate: false,
      asset: result.asset,
      message: 'Upload successful',
    },
    { status: 201 },
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { authenticateRequest } from '@/lib/auth/request-auth';
import { ingestImage } from '@/lib/upload/ingest-image';
import { getRuntimeGate } from '@/lib/runtime-gates';
import { StorageQuotaExceededError } from '@/lib/quota/storage-quota-policy';
import { logger } from '@/lib/logger';
import { withObservability } from '@/lib/with-observability';

/**
 * PWA share-target receiver (manifest.json `share_target`).
 *
 * The OS share sheet issues a navigation POST with multipart files to this
 * route when the user shares an image to the installed Sploot app. Unlike
 * /api/* routes this is a browser navigation, so failures redirect instead
 * of returning JSON. Middleware does not protect this path; auth is owned
 * here (Clerk cookies or the qa-local harness).
 */

export const maxDuration = 60;

function redirectTo(req: NextRequest, path: string, status = 303): NextResponse {
  return NextResponse.redirect(new URL(path, req.url), status);
}

async function postHandler(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.status !== 'authenticated') {
    return redirectTo(req, '/sign-in');
  }
  const userId = auth.principal.userId;

  const uploadGate = getRuntimeGate('uploads');
  if (!uploadGate.enabled) {
    return redirectTo(req, '/app?share=paused');
  }

  const formData = await req.formData();
  const files = formData
    .getAll('images')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) {
    return redirectTo(req, '/app');
  }

  let shared = 0;
  let duplicates = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const result = await ingestImage({ userId, file });
      if (result.kind === 'created') shared++;
      else if (result.kind === 'duplicate') duplicates++;
      else failed++;
    } catch (error) {
      unstable_rethrow(error);
      failed++;
      if (error instanceof StorageQuotaExceededError) {
        logger.warn('Share-target ingest hit storage quota', { userId });
        break;
      }
      logger.error('Share-target ingest failed', {
        userId,
        filename: file.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const params = new URLSearchParams();
  if (shared > 0) params.set('shared', String(shared));
  if (duplicates > 0) params.set('duplicates', String(duplicates));
  if (failed > 0) params.set('failed', String(failed));
  const query = params.toString();

  return redirectTo(req, query ? `/app?${query}` : '/app');
}

async function getHandler(req: NextRequest) {
  // Direct navigation (or a share the OS downgraded to GET) lands in the app.
  return redirectTo(req, '/app', 307);
}

export const POST = withObservability(postHandler, { operation: 'share-target' });
export const GET = withObservability(getHandler, {
  operation: 'share-target:get',
  skipTiming: true,
});

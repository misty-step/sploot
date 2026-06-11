import { NextResponse } from 'next/server';
import { getLatestVersion } from '@/lib/releases';
import { withObservability } from '@/lib/with-observability';

/**
 * Public version endpoint: the latest landfall release tag. The repo is
 * public, so this exposes nothing new; it exists so client surfaces
 * (settings) show the real released version instead of a stale
 * package.json constant, with server-side caching.
 */

export const revalidate = 3600;

async function getHandler() {
  const version = await getLatestVersion();
  return NextResponse.json(
    { version },
    { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } }
  );
}

export const GET = withObservability(getHandler, {
  operation: 'version',
  skipTiming: true,
});

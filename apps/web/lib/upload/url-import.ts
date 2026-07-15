import { UPLOAD, isValidMimeType } from '@sploot/common';
// Marker-free enablement check only: importing the full qa-local module here
// would pull its header/cookie/secret markers into production upload chunks.
import { isQaLocalAuthEnabled } from '@/lib/auth/qa-local-enabled';

/**
 * Server-side fetch of a user-supplied media URL for ingestion.
 *
 * SSRF stance: only http(s), and never private/internal hosts — checked on
 * the requested URL and re-checked on the post-redirect response URL.
 * Hostname checks cover IP literals and well-known internal names; DNS
 * rebinding is out of scope for this single-user app (documented residual).
 * The QA harness may opt localhost back in via
 * SPLOOT_QA_ALLOW_LOCAL_URL_IMPORT=1, which is inert in production because
 * it additionally requires the qa-local auth mode to be active.
 */

const PRIVATE_V4_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
];

export type ValidateImportUrlResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }
  if (host === '::1' || host === '::' || host.startsWith('fd') || host.startsWith('fe80')) {
    return true;
  }
  return PRIVATE_V4_PATTERNS.some((pattern) => pattern.test(host));
}

// The QA escape hatch only re-admits loopback (the dev server itself),
// never the rest of the private ranges.
function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || /^127\./.test(host);
}

function qaLocalImportAllowed(hostname: string): boolean {
  return (
    process.env.SPLOOT_QA_ALLOW_LOCAL_URL_IMPORT === '1' &&
    isQaLocalAuthEnabled() &&
    isLoopbackHostname(hostname)
  );
}

export function validateImportUrl(rawUrl: string): ValidateImportUrlResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'not a valid url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'only http(s) urls can be imported' };
  }

  if (isPrivateHostname(url.hostname) && !qaLocalImportAllowed(url.hostname)) {
    return { ok: false, reason: 'that host is not importable' };
  }

  return { ok: true, url };
}

export type FetchRemoteImageResult =
  | { ok: true; file: File }
  | { ok: false; reason: string };

export interface FetchRemoteImageOptions {
  maxBytes?: number;
  timeoutMs?: number;
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const basename = pathname.split('/').filter(Boolean).pop();
    if (basename) return decodeURIComponent(basename);
  } catch {
    // fall through
  }
  return 'imported-meme';
}

export async function fetchRemoteImage(
  url: URL,
  { maxBytes = UPLOAD.maxSize, timeoutMs = 15_000 }: FetchRemoteImageOptions = {}
): Promise<FetchRemoteImageResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'image/*,video/mp4,video/webm' },
    });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error && error.name === 'TimeoutError'
        ? 'fetching that url timed out'
        : 'could not fetch that url',
    };
  }

  // Redirects may have moved us; re-check the final host.
  if (response.url) {
    const finalHost = new URL(response.url).hostname;
    if (isPrivateHostname(finalHost) && !qaLocalImportAllowed(finalHost)) {
      return { ok: false, reason: 'that host is not importable' };
    }
  }

  if (!response.ok) {
    return { ok: false, reason: `that url answered ${response.status}` };
  }

  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!isValidMimeType(contentType)) {
    return { ok: false, reason: 'that url is not a meme we can save' };
  }

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) {
    return { ok: false, reason: 'that meme is too big' };
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    return { ok: false, reason: 'that meme is too big' };
  }
  if (buffer.byteLength === 0) {
    return { ok: false, reason: 'that url returned an empty meme' };
  }

  const file = new File([buffer], filenameFromUrl(response.url || url.href), {
    type: contentType,
  });

  return { ok: true, file };
}

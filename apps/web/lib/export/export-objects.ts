/**
 * Provider-neutral object reader for library exports.
 *
 * The export pipeline only ever needs "open this stored object as a byte
 * stream". Keeping that behind `ExportObjectReader` means the blob provider
 * can change (see the storage-portability work on
 * `agent/sploot-blob-portability-v2`) by swapping this one function — the
 * zip/manifest/route layers never learn provider details, and no signed
 * provider URLs ever reach the client.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { isQaLocalAuthEnabled } from '@/lib/auth/qa-local';
import { QA_SEED_BLOB_HOST } from '@/lib/qa/qa-image-loader';

export type ExportObjectFailureReason =
  | 'object_missing'
  | 'object_fetch_failed'
  | 'object_url_rejected';

export type OpenExportObjectResult =
  | { ok: true; body: ReadableStream<Uint8Array> }
  | { ok: false; reason: ExportObjectFailureReason };

export type ExportObjectReader = (url: string) => Promise<OpenExportObjectResult>;

/**
 * Defense in depth against SSRF: stored object URLs are already constrained
 * by a database CHECK (`assets_blob_url_format_check`), but the export path
 * re-validates before fetching so a corrupted or migrated row can never
 * point this server at an internal or attacker-controlled host.
 */
const ALLOWED_OBJECT_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/;

export function isAllowedExportObjectUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && ALLOWED_OBJECT_HOST.test(url.hostname);
}

/**
 * QA-only mapping mirroring `lib/qa/qa-image-loader.ts`: seed rows point at
 * the reserved QA_SEED_BLOB_HOST while their bytes live in `public/`. Active
 * only when qa-local auth mode is on (never in production); path-traversal
 * guarded. Returns null on every non-QA path.
 */
export function resolveQaSeedObjectPath(
  url: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.NODE_ENV === 'production' || !isQaLocalAuthEnabled(env)) return null;
  if (!url.startsWith(`${QA_SEED_BLOB_HOST}/`)) return null;
  const relativePath = url.slice(`${QA_SEED_BLOB_HOST}/`.length);
  const root = resolve(process.cwd(), 'public');
  const full = resolve(root, relativePath);
  if (!full.startsWith(`${root}${sep}`)) return null;
  return full;
}

export const openExportObject: ExportObjectReader = async (url) => {
  if (!isAllowedExportObjectUrl(url)) {
    return { ok: false, reason: 'object_url_rejected' };
  }

  const qaSeedPath = resolveQaSeedObjectPath(url);
  if (qaSeedPath) {
    try {
      await stat(qaSeedPath);
    } catch {
      return { ok: false, reason: 'object_missing' };
    }
    return {
      ok: true,
      body: Readable.toWeb(createReadStream(qaSeedPath)) as ReadableStream<Uint8Array>,
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      // Bounded: a stalled provider must not pin the part stream forever.
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { ok: false, reason: 'object_fetch_failed' };
  }

  if (response.status === 404 || response.status === 410) {
    return { ok: false, reason: 'object_missing' };
  }
  if (!response.ok || !response.body) {
    return { ok: false, reason: 'object_fetch_failed' };
  }

  return { ok: true, body: response.body };
};

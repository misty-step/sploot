/**
 * Provider-neutral object reader for library exports.
 *
 * The export pipeline only ever needs "open this stored object as a byte
 * stream". Keeping that behind ExportObjectReader means the blob provider
 * can change by swapping this one function — the zip/manifest/route layers
 * never learn provider details, and no signed provider URLs reach the client.
 */


export type ExportObjectFailureReason =
  | 'object_missing'
  | 'object_fetch_failed'
  | 'object_url_rejected';

export type OpenExportObjectResult =
  | { ok: true; body: ReadableStream<Uint8Array> }
  | { ok: false; reason: ExportObjectFailureReason };

export type ExportObjectReader = (
  url: string,
  signal?: AbortSignal,
) => Promise<OpenExportObjectResult>;

export const EXPORT_OBJECT_HEADER_TIMEOUT_MS = 60_000;
export const EXPORT_OBJECT_READ_IDLE_TIMEOUT_MS = 60_000;
export const EXPORT_OBJECT_MAX_REDIRECTS = 3;

export interface ExportObjectReaderOptions {
  headerTimeoutMs?: number;
  readIdleTimeoutMs?: number;
  maxRedirects?: number;
}

/**
 * Defense in depth against SSRF: stored object URLs are already constrained
 * by a database CHECK, but the export path re-validates every redirect hop so
 * a corrupted or migrated row can never point this server at an internal or
 * attacker-controlled host.
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

function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return Promise.resolve();
  return body.cancel().catch(() => undefined);
}

function linkAbortSignal(external: AbortSignal | undefined, controller: AbortController): () => void {
  if (!external) return () => undefined;
  const abort = () => controller.abort(external.reason);
  if (external.aborted) abort();
  else external.addEventListener('abort', abort, { once: true });
  return () => external.removeEventListener('abort', abort);
}

function readWithIdleTimeout<T>(
  read: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  return new Promise<T>((resolveRead, rejectRead) => {
    const timer = setTimeout(() => {
      onTimeout();
      rejectRead(new Error('export object provider read timed out'));
    }, timeoutMs);
    read.then(
      (value) => {
        clearTimeout(timer);
        resolveRead(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        rejectRead(error);
      },
    );
  });
}

/** Wrap a provider body so idle timeout covers only provider reads, never client backpressure. */
function streamProviderBody(
  body: ReadableStream<Uint8Array>,
  controller: AbortController,
  readIdleTimeoutMs: number,
  unlinkAbort: () => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    controller.signal.removeEventListener('abort', onAbort);
    unlinkAbort();
  };
  const onAbort = () => {
    void reader.cancel(controller.signal.reason).catch(() => undefined);
  };
  controller.signal.addEventListener('abort', onAbort, { once: true });
  return new ReadableStream<Uint8Array>({
    async pull(streamController) {
      try {
        const result = await readWithIdleTimeout(
          reader.read(),
          readIdleTimeoutMs,
          () => controller.abort(),
        );
        if (result.done) {
          cleanup();
          streamController.close();
        }
        else if (result.value) streamController.enqueue(result.value);
      } catch (error) {
        controller.abort();
        await reader.cancel().catch(() => undefined);
        cleanup();
        streamController.error(error);
      }
    },
    async cancel(reason) {
      controller.abort(reason);
      await reader.cancel(reason).catch(() => undefined);
      cleanup();
    },
  });
}

async function fetchHeaders(
  url: string,
  controller: AbortController,
  timeoutMs: number,
): Promise<Response> {
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { redirect: 'manual', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function createExportObjectReader(
  options: ExportObjectReaderOptions = {},
): ExportObjectReader {
  const headerTimeoutMs = options.headerTimeoutMs ?? EXPORT_OBJECT_HEADER_TIMEOUT_MS;
  const readIdleTimeoutMs = options.readIdleTimeoutMs ?? EXPORT_OBJECT_READ_IDLE_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? EXPORT_OBJECT_MAX_REDIRECTS;

  return async (url, externalSignal) => {
    if (!isAllowedExportObjectUrl(url)) {
      return { ok: false, reason: 'object_url_rejected' };
    }

    const controller = new AbortController();
    const unlinkAbort = linkAbortSignal(externalSignal, controller);
    let currentUrl = url;
    let redirects = 0;
    let handedOff = false;

    try {
      for (;;) {
        if (controller.signal.aborted) return { ok: false, reason: 'object_fetch_failed' };
        let response: Response;
        try {
          response = await fetchHeaders(currentUrl, controller, headerTimeoutMs);
        } catch {
          return { ok: false, reason: 'object_fetch_failed' };
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          await cancelBody(response.body);
          if (!location) return { ok: false, reason: 'object_fetch_failed' };
          if (redirects >= maxRedirects) return { ok: false, reason: 'object_fetch_failed' };
          let nextUrl: string;
          try {
            nextUrl = new URL(location, currentUrl).toString();
          } catch {
            return { ok: false, reason: 'object_url_rejected' };
          }
          if (!isAllowedExportObjectUrl(nextUrl)) {
            return { ok: false, reason: 'object_url_rejected' };
          }
          currentUrl = nextUrl;
          redirects += 1;
          continue;
        }

        if (response.status === 404 || response.status === 410) {
          await cancelBody(response.body);
          return { ok: false, reason: 'object_missing' };
        }
        if (!response.ok || !response.body) {
          await cancelBody(response.body);
          return { ok: false, reason: 'object_fetch_failed' };
        }

        handedOff = true;
        return {
          ok: true,
          body: streamProviderBody(response.body, controller, readIdleTimeoutMs, unlinkAbort),
        };
      }
    } finally {
      if (!handedOff) unlinkAbort();
    }
  };
}

export const openExportObject: ExportObjectReader = createExportObjectReader();

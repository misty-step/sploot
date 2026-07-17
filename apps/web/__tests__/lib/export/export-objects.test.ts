import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isAllowedExportObjectUrl,
  createExportObjectReader,
  openExportObject,
} from '@/lib/export/export-objects';
import { EXPORT_STREAM_CHUNK_BYTES } from '@/lib/export/export-backpressure';
import { QA_SEED_BLOB_HOST } from '@/lib/qa/qa-image-loader';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('export object reader', () => {
  describe('isAllowedExportObjectUrl (SSRF defense in depth)', () => {
    it('accepts only https URLs on the managed blob host', () => {
      expect(
        isAllowedExportObjectUrl('https://abc123.public.blob.vercel-storage.com/u/file.png'),
      ).toBe(true);
    });

    it('rejects other hosts, schemes, and lookalike suffixes', () => {
      expect(isAllowedExportObjectUrl('http://abc.public.blob.vercel-storage.com/a')).toBe(false);
      expect(isAllowedExportObjectUrl('https://evil.com/a.png')).toBe(false);
      expect(isAllowedExportObjectUrl('https://127.0.0.1/a.png')).toBe(false);
      expect(isAllowedExportObjectUrl('https://localhost/a.png')).toBe(false);
      expect(
        isAllowedExportObjectUrl('https://x.public.blob.vercel-storage.com.evil.com/a.png'),
      ).toBe(false);
      expect(isAllowedExportObjectUrl('file:///etc/passwd')).toBe(false);
      expect(isAllowedExportObjectUrl('not a url')).toBe(false);
    });
  });

  it('refuses to fetch a rejected URL at all', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await openExportObject('https://evil.com/a.png');
    expect(result).toEqual({ ok: false, reason: 'object_url_rejected' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('streams an allowed object', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, { status: 200 })),
    );

    const result = await openExportObject(
      'https://abc.public.blob.vercel-storage.com/u/file.png',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const buffer = new Uint8Array(await new Response(result.body).arrayBuffer());
      expect(buffer).toEqual(bytes);
    }
  });

  it('rejects an oversized provider response chunk without retaining it', async () => {
    let fetchSignal: AbortSignal | undefined;
    const bytes = new Uint8Array(256 * 1024).fill(9);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
      cancel() {},
    });
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      fetchSignal = init.signal as AbortSignal;
      return new Response(body, { status: 200 });
    }));
    const opened = await openExportObject(
      'https://abc.public.blob.vercel-storage.com/u/file.png',
    );
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      await expect(opened.body.getReader().read()).rejects.toThrow(/bounded ingress/i);
    }
    expect(fetchSignal?.aborted).toBe(true);
  });

  it('rejects an off-allowlist redirect without fetching the destination', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example/private' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await openExportObject(
      'https://abc.public.blob.vercel-storage.com/u/file.png',
    );
    expect(result).toEqual({ ok: false, reason: 'object_url_rejected' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('bounds same-host redirect hops', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://abc.public.blob.vercel-storage.com/u/next' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await createExportObjectReader({ maxRedirects: 2 })(
      'https://abc.public.blob.vercel-storage.com/u/file.png',
    );
    expect(result).toEqual({ ok: false, reason: 'object_fetch_failed' });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('times out an idle provider read but not slow client backpressure', async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array([pulls]));
        if (pulls === 2) controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));
    const reader = createExportObjectReader({ readIdleTimeoutMs: 20 });
    const opened = await reader('https://abc.public.blob.vercel-storage.com/u/file.png');
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      const streamReader = opened.body.getReader();
      expect((await streamReader.read()).value).toEqual(new Uint8Array([1]));
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect((await streamReader.read()).value).toEqual(new Uint8Array([2]));
      await streamReader.cancel();
    }
  });

  it('cancels the provider body when an idle read times out', async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => undefined);
      },
      cancel() {
        canceled = true;
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));
    const opened = await createExportObjectReader({ readIdleTimeoutMs: 10 })(
      'https://abc.public.blob.vercel-storage.com/u/file.png',
    );
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      await expect(opened.body.getReader().read()).rejects.toThrow('timed out');
    }
    expect(canceled).toBe(true);
  });

  it('aborts the provider fetch and body when downstream cancels', async () => {
    let signal: AbortSignal | undefined;
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => undefined);
      },
      cancel() {
        canceled = true;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        signal = init.signal;
        return new Response(body, { status: 200 });
      }),
    );
    const opened = await openExportObject(
      'https://abc.public.blob.vercel-storage.com/u/file.png',
    );
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      const streamReader = opened.body.getReader();
      await streamReader.cancel();
    }
    expect(signal?.aborted).toBe(true);
    expect(canceled).toBe(true);
  });

  it('reports a missing object distinctly from a fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect(
      await openExportObject('https://abc.public.blob.vercel-storage.com/u/gone.png'),
    ).toEqual({ ok: false, reason: 'object_missing' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    expect(
      await openExportObject('https://abc.public.blob.vercel-storage.com/u/file.png'),
    ).toEqual({ ok: false, reason: 'object_fetch_failed' });
  });
});


describe('QA seed object mapping', () => {
  const seedDir = join(process.cwd(), 'public', 'qa-blob-seed');
  const seedFile = '__test-export-objects-qa-seed.bin';
  const seedPath = join(seedDir, seedFile);
  const seedUrl = `${QA_SEED_BLOB_HOST}/qa-blob-seed/${seedFile}`;
  const seedBytes = new Uint8Array([9, 8, 7, 6, 5]);

  afterEach(() => {
    rmSync(seedPath, { force: true });
  });

  function enableQaMode() {
    vi.stubEnv('SPLOOT_QA_AUTH_MODE', 'enabled');
    vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', 'test');
  }

  it('reads a seeded fixture from disk without any network fetch', async () => {
    mkdirSync(seedDir, { recursive: true });
    writeFileSync(seedPath, seedBytes);
    enableQaMode();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await openExportObject(seedUrl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const buffer = new Uint8Array(await new Response(result.body).arrayBuffer());
      expect(buffer).toEqual(seedBytes);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports object_missing for a seed URL with no backing file', async () => {
    enableQaMode();
    const result = await openExportObject(
      `${QA_SEED_BLOB_HOST}/qa-blob-seed/does-not-exist.bin`,
    );
    expect(result).toEqual({ ok: false, reason: 'object_missing' });
  });

  it('rejects path traversal outside the seed directory', async () => {
    enableQaMode();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await openExportObject(
      `${QA_SEED_BLOB_HOST}/qa-blob-seed/../../lib/export/export-objects.ts`,
    );
    expect(result).toEqual({ ok: false, reason: 'object_url_rejected' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to a real network fetch for the seed host outside QA mode', async () => {
    // No env stubbed: isQaLocalAuthEnabled() is false by default in this
    // suite's environment, so the reserved host must go through the normal
    // (and here, failing) network path rather than ever touching disk.
    const fetchSpy = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const result = await openExportObject(seedUrl);
    expect(result).toEqual({ ok: false, reason: 'object_fetch_failed' });
    expect(fetchSpy).toHaveBeenCalled();
  });
});
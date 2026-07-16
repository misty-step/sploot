import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isAllowedExportObjectUrl,
  createExportObjectReader,
  openExportObject,
  resolveQaSeedObjectPath,
} from '@/lib/export/export-objects';
import { QA_SEED_BLOB_HOST } from '@/lib/qa/qa-image-loader';

afterEach(() => {
  vi.unstubAllGlobals();
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

  describe('resolveQaSeedObjectPath (QA seed mapping)', () => {
    const qaEnv = {
      NODE_ENV: 'test',
      SPLOOT_QA_AUTH_MODE: 'enabled',
      SPLOOT_DEPLOYMENT_ENV: 'test',
    };

    it('maps QA seed URLs onto public/ only when qa-local mode is active', () => {
      const url = `${QA_SEED_BLOB_HOST}/qa-blob-seed/meme.png`;
      const mapped = resolveQaSeedObjectPath(url, qaEnv);
      expect(mapped).toContain('/public/');
      expect(mapped!.endsWith('qa-blob-seed/meme.png')).toBe(true);

      expect(resolveQaSeedObjectPath(url, { NODE_ENV: 'test' })).toBeNull();
      expect(
        resolveQaSeedObjectPath(url, { ...qaEnv, NODE_ENV: 'production' }),
      ).toBeNull();
    });

    it('never maps non-QA hosts and never escapes public/', () => {
      expect(
        resolveQaSeedObjectPath('https://abc.public.blob.vercel-storage.com/u/a.png', qaEnv),
      ).toBeNull();
      expect(
        resolveQaSeedObjectPath(`${QA_SEED_BLOB_HOST}/../../etc/passwd`, qaEnv),
      ).toBeNull();
      expect(
        resolveQaSeedObjectPath(`${QA_SEED_BLOB_HOST}/qa-blob-seed/../../secret.env`, qaEnv),
      ).toBeNull();
    });
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

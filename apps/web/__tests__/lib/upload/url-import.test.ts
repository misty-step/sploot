import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateImportUrl, fetchRemoteImage } from '@/lib/upload/url-import';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('validateImportUrl', () => {
  it.each([
    'https://i.imgur.com/abc123.png',
    'http://example.com/meme.gif',
  ])('accepts public http(s) URL %s', (url) => {
    expect(validateImportUrl(url)).toEqual({ ok: true, url: new URL(url) });
  });

  it.each([
    'ftp://example.com/meme.png',
    'file:///etc/passwd',
    'data:image/png;base64,xxxx',
    'not a url at all',
    '',
  ])('rejects non-http scheme or garbage: %s', (url) => {
    expect(validateImportUrl(url)).toMatchObject({ ok: false });
  });

  it.each([
    'http://localhost:3000/api/health',
    'http://127.0.0.1/x.png',
    'http://[::1]/x.png',
    'http://10.0.0.5/x.png',
    'http://172.16.1.1/x.png',
    'http://192.168.1.10/x.png',
    'http://169.254.169.254/latest/meta-data',
    'http://server.local/x.png',
  ])('rejects private/internal target %s', (url) => {
    expect(validateImportUrl(url)).toMatchObject({ ok: false });
  });

  it('allows localhost only under the QA harness escape hatch', () => {
    vi.stubEnv('SPLOOT_QA_ALLOW_LOCAL_URL_IMPORT', '1');
    vi.stubEnv('SPLOOT_QA_AUTH_MODE', 'enabled');
    vi.stubEnv('NODE_ENV', 'test');

    expect(validateImportUrl('http://localhost:3000/qa-blob-seed/x.png')).toMatchObject({
      ok: true,
    });
  });

  it('keeps non-loopback private hosts blocked even under the QA escape hatch', () => {
    vi.stubEnv('SPLOOT_QA_ALLOW_LOCAL_URL_IMPORT', '1');
    vi.stubEnv('SPLOOT_QA_AUTH_MODE', 'enabled');
    vi.stubEnv('NODE_ENV', 'test');

    expect(validateImportUrl('http://169.254.169.254/latest/meta-data')).toMatchObject({
      ok: false,
    });
    expect(validateImportUrl('http://10.0.0.5/x.png')).toMatchObject({ ok: false });
  });

  it('keeps localhost blocked in production even with the QA flag set', () => {
    vi.stubEnv('SPLOOT_QA_ALLOW_LOCAL_URL_IMPORT', '1');
    vi.stubEnv('SPLOOT_QA_AUTH_MODE', 'enabled');
    vi.stubEnv('NODE_ENV', 'production');

    expect(validateImportUrl('http://localhost:3000/x.png')).toMatchObject({ ok: false });
  });
});

describe('fetchRemoteImage', () => {
  function imageResponse(bytes: Uint8Array, contentType = 'image/png', url = 'https://cdn.example.com/meme.png') {
    const response = new Response(bytes, {
      status: 200,
      headers: { 'content-type': contentType },
    });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  }

  it('returns a File named after the URL path with the response MIME type', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse(bytes)));

    const result = await fetchRemoteImage(new URL('https://cdn.example.com/meme.png'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.name).toBe('meme.png');
      expect(result.file.type).toBe('image/png');
      expect(result.file.size).toBe(4);
    }
  });

  it('requests images and short videos from remote URLs', async () => {
    const fetch = vi.fn().mockResolvedValue(imageResponse(new Uint8Array([1])));
    vi.stubGlobal('fetch', fetch);

    await fetchRemoteImage(new URL('https://cdn.example.com/meme.png'));

    expect(fetch).toHaveBeenCalledWith(
      new URL('https://cdn.example.com/meme.png'),
      expect.objectContaining({
        headers: { accept: 'image/*,video/mp4,video/webm' },
      })
    );
  });

  it('accepts video content types', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        imageResponse(new Uint8Array([0, 0, 0, 1]), 'video/mp4', 'https://cdn.example.com/meme.mp4')
      )
    );

    const result = await fetchRemoteImage(new URL('https://cdn.example.com/meme.mp4'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.name).toBe('meme.mp4');
      expect(result.file.type).toBe('video/mp4');
    }
  });

  it('rejects non-media content types', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(imageResponse(new Uint8Array([1]), 'text/html'))
    );

    const result = await fetchRemoteImage(new URL('https://example.com/page'));

    expect(result).toMatchObject({ ok: false });
  });

  it('rejects bodies larger than the size cap', async () => {
    const big = new Uint8Array(64);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse(big)));

    const result = await fetchRemoteImage(new URL('https://example.com/huge.png'), {
      maxBytes: 16,
    });

    expect(result).toMatchObject({ ok: false });
  });

  it('rejects redirects that land on a private host', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        imageResponse(new Uint8Array([1]), 'image/png', 'http://169.254.169.254/meta')
      )
    );

    const result = await fetchRemoteImage(new URL('https://bit.ly/short'));

    expect(result).toMatchObject({ ok: false });
  });

  it('rejects non-2xx responses', async () => {
    const response = new Response('nope', { status: 404 });
    Object.defineProperty(response, 'url', { value: 'https://example.com/gone.png' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const result = await fetchRemoteImage(new URL('https://example.com/gone.png'));

    expect(result).toMatchObject({ ok: false });
  });
});

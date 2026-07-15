import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UPLOAD } from '@sploot/common';

async function importImageFetcher() {
  vi.resetModules();
  return await import('./image-fetcher');
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchImage', () => {
  it('rejects non-http image URLs before making a request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const { fetchImage } = await importImageFetcher();

    await expect(fetchImage('file:///private/image.png')).rejects.toThrow(
      'Only HTTP/HTTPS URLs are supported'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches with privacy-preserving options and returns a valid image blob', async () => {
    const blob = new Blob(['image-bytes'], { type: 'image/jpeg' });
    const fetch = vi.fn(async () => new Response(blob, {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }));
    vi.stubGlobal('fetch', fetch);

    const { fetchImage } = await importImageFetcher();

    await expect(fetchImage('https://example.com/image.jpg')).resolves.toMatchObject({
      type: 'image/jpeg',
      size: blob.size,
    });
    expect(fetch).toHaveBeenCalledWith('https://example.com/image.jpg', {
      credentials: 'omit',
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
  });

  it('fails oversized non-compressible images instead of falling back to canvas fetch', async () => {
    const oversizedGif = new Blob(
      [new Uint8Array(UPLOAD.multipartSafeSize + 1)],
      { type: 'image/gif' }
    );
    const fetch = vi.fn(async () => new Response(oversizedGif, {
      status: 200,
      headers: { 'content-type': 'image/gif' },
    }));
    const imageConstructor = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('Image', imageConstructor);

    const { fetchImage } = await importImageFetcher();

    await expect(fetchImage('https://example.com/huge.gif')).rejects.toThrow(
      'Image too large after compression'
    );
    expect(imageConstructor).not.toHaveBeenCalled();
  });

  it('aborts and rejects a fetch that ignores AbortSignal', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const { fetchImage } = await importImageFetcher();
    const pending = fetchImage('https://example.com/hung.png');
    vi.advanceTimersByTime(UPLOAD.timeout);
    await expect(pending).rejects.toThrow('timed out');
    vi.useRealTimers();
  });
});

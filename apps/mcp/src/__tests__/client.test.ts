import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SplootApiError, SplootClient } from '../client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function uploadAsset(id: string) {
  return {
    id,
    blobUrl: `https://blob.test/${id}.png`,
    thumbnailUrl: null,
  };
}

function searchAsset(id: string) {
  return {
    id,
    blobUrl: `https://blob.test/${id}.png`,
    thumbnailUrl: `https://blob.test/${id}-thumb.png`,
    similarity: 0.95,
    relevance: 95,
    belowThreshold: false,
  };
}

describe('SplootClient', () => {
  const config = { baseUrl: 'https://sploot.test/api', token: 'splt_test_token' };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  describe('search', () => {
    it('POSTs to /search with a bearer token and the query body', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ results: [], query: 'cat', total: 0, limit: 10, requestedLimit: 10, threshold: 0.2, requestedThreshold: 0.2, processingTime: 5 })
      );
      const client = new SplootClient(config, fetchMock as unknown as typeof fetch);

      const result = await client.search('cat', { limit: 10, threshold: 0.5 });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://sploot.test/api/search');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer splt_test_token');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual({ query: 'cat', limit: 10, threshold: 0.5 });
      expect(result.total).toBe(0);
    });

    it('accepts the complete documented response variant and optional fields', async () => {
      fetchMock.mockResolvedValue(jsonResponse({
        results: [searchAsset('s1')],
        query: 'cat',
        total: 1,
        limit: 1,
        requestedLimit: 1,
        threshold: 0.2,
        requestedThreshold: 0.2,
        processingTime: 5,
        cached: true,
        thresholdFallback: false,
      }));
      const client = new SplootClient(config, fetchMock as unknown as typeof fetch);

      await expect(client.search('cat')).resolves.toMatchObject({ total: 1, cached: true });
    });

    it.each([
      ['unknown top-level field', { extra: true }],
      ['unknown asset field', { assetExtra: { unknown: true } }],
      ['nested private object', { assetExtra: { provider: 'secret' } }],
      ['negative similarity', { similarity: -1 }],
      ['NaN relevance', { relevance: Number.NaN }],
      ['infinite processing time', { processingTime: Number.POSITIVE_INFINITY }],
      ['malformed timestamp', { assetExtra: { createdAt: '2026-07-07T00:00:00Z' } }],
    ])('rejects %s in a search response', async (_reason, poison) => {
      const result = searchAsset('poison');
      if ('assetExtra' in poison) {
        Object.assign(result, poison.assetExtra);
      } else {
        Object.assign(result, poison);
      }
      const body = {
        results: [result],
        query: 'cat',
        total: 1,
        limit: 1,
        requestedLimit: 1,
        threshold: 0.2,
        requestedThreshold: 0.2,
        processingTime: 5,
        ...('extra' in poison ? poison : {}),
      };
      fetchMock.mockResolvedValue(jsonResponse(body));
      const client = new SplootClient(config, fetchMock as unknown as typeof fetch);

      await expect(client.search('cat')).rejects.toMatchObject({ message: 'Invalid search response' });
    });

    it.each([
      ['negative total', { total: -1 }],
      ['negative limit', { limit: -1 }],
      ['negative requested limit', { requestedLimit: -1 }],
      ['limit greater than requested limit', { limit: 2, requestedLimit: 1 }],
      ['total less than returned results', { total: 0 }],
      ['threshold below range', { threshold: -0.1 }],
      ['requested threshold above range', { requestedThreshold: 1.1 }],
      ['negative processing time', { processingTime: -1 }],
      ['non-boolean cached flag', { cached: 'yes' }],
      ['unknown envelope field', { extra: true }],
    ])('rejects invalid search envelope: %s', async (_reason, poison) => {
      const body = {
        results: [searchAsset('s1')],
        query: 'cat',
        total: 1,
        limit: 1,
        requestedLimit: 1,
        threshold: 0.2,
        requestedThreshold: 0.2,
        processingTime: 5,
        ...poison,
      };
      fetchMock.mockResolvedValue(jsonResponse(body));
      const client = new SplootClient(config, fetchMock as unknown as typeof fetch);

      await expect(client.search('cat')).rejects.toMatchObject({ message: 'Invalid search response' });
    });

    it('throws SplootApiError with the server error message on 401', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401));
      const client = new SplootClient(config, fetchMock as unknown as typeof fetch);

      await expect(client.search('cat')).rejects.toMatchObject({
        name: 'SplootApiError',
        status: 401,
        message: 'Unauthorized',
      });
      await expect(client.search('cat')).rejects.toBeInstanceOf(SplootApiError);
    });

    it('throws SplootApiError on 503 when embeddings are unavailable', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: 'Search is temporarily unavailable: embedding service is not configured.' }, 503)
      );
      const client = new SplootClient(config, fetchMock as unknown as typeof fetch);

      await expect(client.search('cat')).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('saveUrl', () => {
    it('POSTs to /upload/url with the bearer token and url body', async () => {
      const asset = uploadAsset('a1');
      fetchMock.mockResolvedValue(
        jsonResponse({ success: true, isDuplicate: false, asset, message: 'Upload successful' }, 201)
      );
      const client = new SplootClient(config, fetchMock as unknown as typeof fetch);

      const result = await client.saveUrl('https://example.com/a.png');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://sploot.test/api/upload/url');
      expect(JSON.parse(init.body)).toEqual({ url: 'https://example.com/a.png' });
      expect(result.asset.id).toBe('a1');
    });

    it('resolves (does not throw) on a 409 duplicate', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          { success: true, isDuplicate: true, asset: uploadAsset('a1'), message: 'This image already exists in your library' },
          409
        )
      );
      const client = new SplootClient(config, fetchMock as unknown as typeof fetch);

      const result = await client.saveUrl('https://example.com/a.png');
      expect(result.isDuplicate).toBe(true);
    });
  });

  describe('saveBytes', () => {
    it('POSTs multipart form data to /upload with the bearer token, no Content-Type override', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          { success: true, isDuplicate: false, asset: uploadAsset('a2'), message: 'Upload successful' },
          201
        )
      );
      const client = new SplootClient(config, fetchMock as unknown as typeof fetch);

      const result = await client.saveBytes(new Uint8Array([1, 2, 3]), 'meme.png', 'image/png', ['reaction']);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://sploot.test/api/upload');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer splt_test_token');
      // Content-Type is left to FormData/undici to set (with boundary) — an
      // explicit override would break multipart parsing.
      expect(init.headers['Content-Type']).toBeUndefined();
      const form = init.body as FormData;
      expect(form.get('file')).toBeInstanceOf(Blob);
      expect(form.get('tags')).toBe(JSON.stringify(['reaction']));
      expect(result.asset.id).toBe('a2');
    });
  });

  it('rejects a successful response containing a private embedding field', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      success: true,
      isDuplicate: false,
      asset: { ...uploadAsset('poison'), embedding: { dim: 768 } },
      message: 'Upload successful',
    }, 201));
    const client = new SplootClient(config, fetchMock as unknown as typeof fetch);
    await expect(client.saveUrl('https://example.com/poison.png')).rejects.toMatchObject({
      message: 'Invalid upload response',
    });
  });

  it.each([
    ['unknown response field', { responseExtra: true }],
    ['unknown asset field', { assetExtra: { unknown: true } }],
    ['nested private object', { assetExtra: { metadata: { provider: 'secret' } } }],
    ['negative asset field', { assetExtra: { size: -1 } }],
    ['invalid asset field type', { assetExtra: { thumbnailUrl: 42 } }],
  ])('rejects %s in a duplicate upload response', async (_reason, poison) => {
    const asset = uploadAsset('poison') as Record<string, unknown>;
    if ('assetExtra' in poison) {
      Object.assign(asset, poison.assetExtra);
    } else {
      Object.assign(asset, poison);
    }
    const response: Record<string, unknown> = {
      success: true,
      isDuplicate: true,
      asset,
      message: 'This image already exists in your library',
    };
    if ('responseExtra' in poison) response.extra = true;
    fetchMock.mockResolvedValue(jsonResponse(response, 409));
    const client = new SplootClient(config, fetchMock as unknown as typeof fetch);

    await expect(client.saveUrl('https://example.com/poison.png')).rejects.toMatchObject({
      message: 'Invalid upload response',
    });
  });
});

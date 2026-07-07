import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SplootApiError, SplootClient } from '../client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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
        jsonResponse({ results: [], query: 'cat', total: 0, limit: 30, threshold: 0.2, processingTime: 5 })
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
      const asset = {
        id: 'a1',
        blobUrl: 'https://blob.test/a.png',
        filename: 'a.png',
        mimeType: 'image/png',
        size: 10,
        createdAt: '2026-07-07T00:00:00.000Z',
        needsEmbedding: true,
      };
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
          { success: true, isDuplicate: true, asset: { id: 'a1' }, message: 'This image already exists in your library' },
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
          { success: true, isDuplicate: false, asset: { id: 'a2' }, message: 'Upload successful' },
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
});

import { describe, expect, it } from 'vitest';
import { ingestResultToUploadResponse } from '@/lib/upload/ingest-http';
import type { IngestedAsset, IngestImageResult } from '@/lib/upload/ingest-image';

const asset: IngestedAsset = {
  id: 'asset-1',
  blobUrl: 'https://blob.example.test/meme.png',
  thumbnailUrl: 'https://blob.example.test/meme-thumb.png',
  pathname: 'user/meme.png',
  filename: 'meme.png',
  mimeType: 'image/png',
  size: 2048,
  checksum: 'abc123',
  phash: null,
  nearDuplicate: null,
  createdAt: new Date('2026-08-24T12:00:00.000Z'),
  needsEmbedding: true,
};

async function parse(result: IngestImageResult) {
  const response = ingestResultToUploadResponse(result);
  return { status: response.status, body: JSON.parse(await response.text()) };
}

describe('ingestResultToUploadResponse', () => {
  it('maps invalid ingest to the published save-verb error JSON', async () => {
    const { status, body } = await parse({
      kind: 'invalid',
      error: { userMessage: 'file too large', statusCode: 413 },
    });

    expect(status).toBe(413);
    expect(body).toEqual({ success: false, error: 'file too large' });
  });

  it('maps duplicate ingest to 409 without dropping asset fields', async () => {
    const { status, body } = await parse({ kind: 'duplicate', asset });

    expect(status).toBe(409);
    expect(body).toEqual({
      success: true,
      isDuplicate: true,
      asset: {
        ...asset,
        createdAt: '2026-08-24T12:00:00.000Z',
      },
      message: 'This image already exists in your library',
    });
  });

  it('maps created ingest to 201 without dropping asset fields', async () => {
    const { status, body } = await parse({ kind: 'created', asset });

    expect(status).toBe(201);
    expect(body).toEqual({
      success: true,
      isDuplicate: false,
      asset: {
        ...asset,
        createdAt: '2026-08-24T12:00:00.000Z',
      },
      message: 'Upload successful',
    });
  });
});

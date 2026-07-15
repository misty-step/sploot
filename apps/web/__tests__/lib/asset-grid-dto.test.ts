import { describe, expect, it } from 'vitest';
import {
  normalizeAssetToGridDto,
  normalizeCachedGridResults,
  normalizeCachedSearchPage,
} from '@/lib/asset-grid-dto';

function cachedResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cached',
    blobUrl: 'https://blob.test/cached.png',
    thumbnailUrl: 'https://blob.test/thumb.png',
    similarity: 0.8,
    relevance: 80,
    ...overrides,
  };
}

describe('normalizeAssetToGridDto', () => {
  it('maps poisoned database embedding state to an internal grid DTO', () => {
    const gridDto = normalizeAssetToGridDto({
      id: 'asset-public',
      blobUrl: 'https://blob.test/public.png',
      thumbnailUrl: 'https://blob.test/public-thumb.png',
      pathname: 'memes/public.png',
      mime: 'image/png',
      size: 10,
      width: 1,
      height: 1,
      favorite: false,
      createdAt: new Date('2026-07-14T12:00:00.000Z'),
      updatedAt: new Date('2026-07-15T12:00:00.000Z'),
      embedding: {
        assetId: 'asset-public',
        modelName: 'provider-private',
        modelVersion: 'billing-private',
        dim: 768,
        status: 'ready',
        error: 'raw-provider-error',
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }, { embeddingStatus: 'ready', tags: { tags: [] } });

    expect(gridDto).toEqual(expect.objectContaining({
      id: 'asset-public',
      thumbnailUrl: 'https://blob.test/public-thumb.png',
      createdAt: '2026-07-14T12:00:00.000Z',
      embeddingStatus: 'ready',
      tags: [],
    }));
    expect(gridDto).not.toHaveProperty('embedding');
    expect(gridDto).not.toHaveProperty('embeddingError');
  });

  it.each([
    ['unknown page key', { results: [cachedResult()], total: 1, seed: null, page: 1 }],
  ])('rejects %s', (_label, page) => {
    expect(normalizeCachedSearchPage(page)).toBeNull();
  });

  it('rejects a cached page missing a required key', () => {
    const page = { results: [cachedResult()], total: 1, seed: null } as Record<string, unknown>;
    delete page.seed;
    expect(normalizeCachedSearchPage(page)).toBeNull();
  });

  it.each([
    ['unknown row key', { extra: true }],
    ['unknown nested tag key via row spill', { tags: [{ id: 'tag-1', name: 'funny', color: 'purple' }] }],
    ['negative similarity', { similarity: -1 }],
    ['too-large similarity', { similarity: 1.01 }],
    ['negative relevance', { relevance: -1 }],
    ['non-finite relevance', { relevance: Number.NaN }],
  ])('rejects cached result poison: %s', (_label, change) => {
    expect(normalizeCachedGridResults([cachedResult(change)])).toBeNull();
  });

  it('rejects a cached result missing a required key', () => {
    const row = cachedResult() as Record<string, unknown>;
    delete row.thumbnailUrl;
    expect(normalizeCachedGridResults([row])).toBeNull();
  });

  it.each([
    { thumbnailUrl: undefined },
    { similarity: undefined },
    { relevance: undefined },
    { similarity: Number.NaN },
    { belowThreshold: 'yes' },
    { similarity: 1.01 },
    { relevance: -1 },
  ])('rejects incomplete or non-finite cached public fields: %o', (change) => {
    expect(normalizeCachedGridResults([cachedResult(change)])).toBeNull();
  });

  it('accepts a fully documented cached result with optional fields present', () => {
    const result = cachedResult({
      thumbnailUrl: null,
      belowThreshold: false,
    });

    expect(normalizeCachedGridResults([result])).toEqual([{
      ...result,
    }]);
  });

  it('normalizes camelCase Prisma and taste rows while preserving explicit extensions', () => {
    const createdAt = new Date('2026-07-14T12:00:00.000Z');
    const updatedAt = new Date('2026-07-14T12:01:00.000Z');

    expect(
      normalizeAssetToGridDto(
        {
          id: 'asset-1',
          blobUrl: 'https://blob.test/asset-1.png',
          thumbnailUrl: null,
          pathname: 'uploads/asset-1.png',
          mime: 'image/png',
          size: 123,
          width: 640,
          height: 480,
          favorite: true,
          createdAt,
          updatedAt,
          embeddingId: 'asset-1',
          embeddingModelName: 'clip',
          embeddingModelVersion: 'v1',
          embeddingStatus: 'ready',
          embeddingCreatedAt: createdAt,
        },
        {
          filename: 'uploads/asset-1.png',
          tasteScore: { tasteScore: 0.9123 },
          tags: { tags: [{ id: 'tag-1', name: 'funny' }] },
        },
      ),
    ).toEqual({
      id: 'asset-1',
      blobUrl: 'https://blob.test/asset-1.png',
      thumbnailUrl: null,
      pathname: 'uploads/asset-1.png',
      filename: 'uploads/asset-1.png',
      mime: 'image/png',
      size: 123,
      width: 640,
      height: 480,
      favorite: true,
      createdAt: '2026-07-14T12:00:00.000Z',
      embeddingStatus: 'ready',
      tasteScore: 0.9123,
      tags: [{ id: 'tag-1', name: 'funny' }],
    });
  });

  it('normalizes snake_case vector rows and adds similarity extensions', () => {
    const createdAt = new Date('2026-07-14T12:00:00.000Z');

    expect(
      normalizeAssetToGridDto(
        {
          id: 'asset-2',
          blob_url: 'https://blob.test/asset-2.jpg',
          thumbnail_url: 'https://blob.test/asset-2-thumb.jpg',
          pathname: 'uploads/asset-2.jpg',
          mime: 'image/jpeg',
          size: 456,
          width: null,
          height: null,
          favorite: false,
          created_at: createdAt,
          distance: 0.42,
        },
        {
          embeddingStatus: 'ready',
          similarity: { similarity: 0.42, relevance: 42, belowThreshold: false },
          tags: { tags: [] },
        },
      ),
    ).toEqual({
      id: 'asset-2',
      blobUrl: 'https://blob.test/asset-2.jpg',
      thumbnailUrl: 'https://blob.test/asset-2-thumb.jpg',
      pathname: 'uploads/asset-2.jpg',
      filename: 'asset-2.jpg',
      mime: 'image/jpeg',
      size: 456,
      width: null,
      height: null,
      favorite: false,
      createdAt: '2026-07-14T12:00:00.000Z',
      embeddingStatus: 'ready',
      similarity: 0.42,
      relevance: 42,
      belowThreshold: false,
      tags: [],
    });
  });
});

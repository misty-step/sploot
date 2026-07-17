import { describe, expect, it } from 'vitest';
import { mapAssetTags, toGridAsset } from '@/lib/asset-dto';

describe('toGridAsset', () => {
  it('normalizes a camelCase Prisma select row (GET /api/assets normal-list path)', () => {
    const asset = toGridAsset({
      id: 'asset-1',
      blobUrl: 'https://blob/a.png',
      thumbnailUrl: 'https://blob/thumb-a.png',
      pathname: 'memes/a.png',
      filename: 'memes/a.png',
      mime: 'image/png',
      size: 1024,
      width: 320,
      height: 240,
      favorite: true,
      createdAt: new Date('2026-05-14T12:00:00.000Z'),
      embedding: {
        status: 'ready',
        modelName: 'clip',
        modelVersion: 'v1',
        createdAt: new Date('2026-05-14T12:00:00.000Z'),
      },
    });

    // sploot-048: thumbnailUrl must survive every read path.
    expect(asset.thumbnailUrl).toBe('https://blob/thumb-a.png');
    expect(asset.embedding).toEqual({
      assetId: 'asset-1',
      modelName: 'clip',
      modelVersion: 'v1',
      status: 'ready',
      createdAt: new Date('2026-05-14T12:00:00.000Z'),
    });
    expect(asset.embeddingStatus).toBe('ready');
  });

  it('normalizes the flat raw-SQL shuffle/taste row shape and omits embedding when absent', () => {
    const asset = toGridAsset({
      id: 'asset-2',
      blobUrl: 'https://blob/b.png',
      thumbnailUrl: null,
      pathname: 'memes/b.png',
      filename: 'memes/b.png',
      mime: 'image/png',
      size: 2048,
      width: 640,
      height: 480,
      favorite: false,
      createdAt: new Date('2026-05-15T12:00:00.000Z'),
      updatedAt: new Date('2026-05-15T12:00:00.000Z'),
      embeddingId: null,
      embeddingModelName: null,
      embeddingModelVersion: null,
      embeddingStatus: null,
      embeddingCreatedAt: null,
    });

    expect(asset.thumbnailUrl).toBeNull();
    expect(asset.embedding).toBeUndefined();
    expect(asset.embeddingStatus).toBeUndefined();
  });

  it('rounds tasteScore to 3 decimals like the taste-ranked read path', () => {
    const asset = toGridAsset({
      id: 'asset-near',
      blobUrl: 'https://blob/near.png',
      pathname: 'memes/near.png',
      mime: 'image/png',
      size: 2048,
      width: 640,
      height: 480,
      favorite: false,
      createdAt: new Date('2026-05-15T12:00:00.000Z'),
      tasteScore: 0.8764,
      embeddingId: 'asset-near',
      embeddingModelName: 'clip',
      embeddingModelVersion: 'v1',
      embeddingStatus: 'ready',
      embeddingCreatedAt: new Date('2026-05-15T12:00:00.000Z'),
    });

    expect(asset.tasteScore).toBe(0.876);
    expect(asset.embeddingStatus).toBe('ready');
  });

  it('normalizes a snake_case vectorSearch row, deriving filename and relevance from distance', () => {
    const asset = toGridAsset({
      id: 'asset-3',
      blob_url: 'https://blob/c.png',
      thumbnail_url: null,
      pathname: 'pile/deeply/nested/c.png',
      mime: 'image/png',
      size: 512,
      width: 100,
      height: 100,
      favorite: false,
      created_at: new Date('2026-07-01T00:00:00Z'),
      distance: 0.01,
    });

    // sploot-049: search/similar rows never carried a filename column;
    // toGridAsset derives the basename so every path agrees on the shape.
    expect(asset.filename).toBe('c.png');
    expect(asset.similarity).toBeCloseTo(0.01);
    expect(asset.relevance).toBe(1);
    expect(asset.embeddingStatus).toBe('ready');
    // Vector-search rows are always matched via an inner join on
    // asset_embeddings, so a ready embedding is always present.
    expect(asset.embedding).toEqual({
      assetId: 'asset-3',
      modelName: '',
      createdAt: new Date('2026-07-01T00:00:00Z'),
    });
  });

  it('prefers an explicit similarity field over distance (advanced-search raw SQL row)', () => {
    const asset = toGridAsset({
      id: 'asset-4',
      blob_url: 'https://blob/d.png',
      thumbnail_url: 'https://blob/thumb-d.png',
      pathname: 'memes/d.png',
      mime: 'image/png',
      size: 512,
      width: 100,
      height: 100,
      favorite: false,
      created_at: new Date('2026-07-01T00:00:00Z'),
      updated_at: new Date('2026-07-02T00:00:00Z'),
      similarity: 0.42,
    });

    // sploot-049: the advanced-search SQL never selected thumbnail_url; a
    // real per-path field drop of the exact 048 shape.
    expect(asset.thumbnailUrl).toBe('https://blob/thumb-d.png');
    expect(asset.similarity).toBeCloseTo(0.42);
    expect(asset.relevance).toBe(42);
    expect(asset.updatedAt).toEqual(new Date('2026-07-02T00:00:00Z'));
  });

  it('applies extensions.similarity for a metadata-only fallback row with no vector score', () => {
    const asset = toGridAsset(
      {
        id: 'asset-5',
        blobUrl: 'https://blob/e.png',
        thumbnailUrl: null,
        pathname: 'memes/e.png',
        mime: 'image/png',
        size: 100,
        width: 10,
        height: 10,
        favorite: false,
        createdAt: new Date('2026-07-01T00:00:00Z'),
      },
      { similarity: 0, relevance: 0 },
    );

    expect(asset.similarity).toBe(0);
    expect(asset.relevance).toBe(0);
  });

  it('sanitizes the embedding sub-object to the public shape, never leaking internal Prisma fields', () => {
    const asset = toGridAsset({
      id: 'asset-6',
      blobUrl: 'https://blob/f.png',
      pathname: 'memes/f.png',
      mime: 'image/png',
      size: 100,
      width: 10,
      height: 10,
      favorite: false,
      createdAt: new Date('2026-07-01T00:00:00Z'),
      embedding: {
        status: 'failed',
        modelName: 'clip',
        modelVersion: 'v1',
        createdAt: new Date('2026-07-01T00:00:00Z'),
        // Extra internal fields a full Prisma embedding relation carries
        // (processingClaimToken, attemptCount, error, ...) must never reach
        // toGridAsset's output even if the caller forwards the raw row.
        ...({ processingClaimToken: 'secret-token', attemptCount: 3, error: 'boom' } as any),
      },
    });

    expect(asset.embedding).toEqual({
      assetId: 'asset-6',
      modelName: 'clip',
      modelVersion: 'v1',
      status: 'failed',
      createdAt: new Date('2026-07-01T00:00:00Z'),
    });
    expect(asset.embedding).not.toHaveProperty('processingClaimToken');
    expect(asset.embedding).not.toHaveProperty('attemptCount');
    expect(asset.embedding).not.toHaveProperty('error');
  });

  it('applies tags and belowThreshold extensions uniformly', () => {
    const asset = toGridAsset(
      {
        id: 'asset-7',
        blob_url: 'https://blob/g.png',
        pathname: 'memes/g.png',
        mime: 'image/png',
        size: 100,
        width: 10,
        height: 10,
        favorite: false,
        created_at: new Date('2026-07-01T00:00:00Z'),
        distance: 0.2,
      },
      { tags: [{ id: 'tag-1', name: 'reaction' }], belowThreshold: false },
    );

    expect(asset.tags).toEqual([{ id: 'tag-1', name: 'reaction' }]);
    expect(asset.belowThreshold).toBe(false);
  });
});

describe('mapAssetTags', () => {
  it('maps { tag: { id, name } } join rows to the flat AssetTag DTO', () => {
    const tags = mapAssetTags([
      { tag: { id: 'tag-1', name: 'reaction' } },
      { tag: { id: 'tag-2', name: 'og' } },
    ]);

    expect(tags).toEqual([
      { id: 'tag-1', name: 'reaction' },
      { id: 'tag-2', name: 'og' },
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(mapAssetTags([])).toEqual([]);
  });
});

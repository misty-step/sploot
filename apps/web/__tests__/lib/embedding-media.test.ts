import { describe, expect, it } from 'vitest';

import { resolveEmbeddingMediaSource } from '@/lib/embedding-media';

describe('resolveEmbeddingMediaSource', () => {
  it('uses a generated poster or thumbnail for video and terminal-skips video without one', () => {
    expect(
      resolveEmbeddingMediaSource({
        mime: 'video/mp4',
        blobUrl: 'https://blob.example/raw.mp4',
        thumbnailUrl: 'https://blob.example/poster.jpg',
      }),
    ).toEqual({
      sourceUrl: 'https://blob.example/poster.jpg',
      sourceKind: 'thumbnail',
    });

    expect(
      resolveEmbeddingMediaSource({
        mime: 'video/webm',
        blobUrl: 'https://blob.example/raw.webm',
        thumbnailUrl: null,
      }),
    ).toEqual({
      sourceUrl: null,
      sourceKind: 'unsupported',
      skipReason: 'video_without_poster',
    });
  });

  it('falls back to the blob for non-video assets and prefers thumbnails when present', () => {
    expect(
      resolveEmbeddingMediaSource({
        mime: 'image/jpeg',
        blobUrl: 'https://blob.example/image.jpg',
        thumbnailUrl: 'https://blob.example/thumb.jpg',
      }),
    ).toEqual({
      sourceUrl: 'https://blob.example/thumb.jpg',
      sourceKind: 'thumbnail',
    });

    expect(
      resolveEmbeddingMediaSource({
        mime: 'image/jpeg',
        blobUrl: 'https://blob.example/image.jpg',
        thumbnailUrl: null,
      }),
    ).toEqual({
      sourceUrl: 'https://blob.example/image.jpg',
      sourceKind: 'blob',
    });
  });

  it.each(['', '   ', 'not-a-url', 'ftp://blob.example/poster.jpg'])
    ('terminal-skips a video with an unusable poster (%j)', (thumbnailUrl) => {
      expect(
        resolveEmbeddingMediaSource({
          mime: 'video/mp4',
          blobUrl: 'https://blob.example/raw.mp4',
          thumbnailUrl,
        }),
      ).toEqual({
        sourceUrl: null,
        sourceKind: 'unsupported',
        skipReason: 'video_without_poster',
      });
    });

  it('trims a valid poster before handing it to the provider', () => {
    expect(
      resolveEmbeddingMediaSource({
        mime: 'video/mp4',
        blobUrl: 'https://blob.example/raw.mp4',
        thumbnailUrl: '  https://blob.example/poster.jpg  ',
      }),
    ).toEqual({
      sourceUrl: 'https://blob.example/poster.jpg',
      sourceKind: 'thumbnail',
    });
  });
});

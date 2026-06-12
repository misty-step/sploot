import { describe, expect, it } from 'vitest';

import {
  buildSemanticPiles,
  type EmbeddedPileAsset,
  type PileAnchorEmbedding,
} from '@/lib/piles/semantic-piles';

const reactionAnchor: PileAnchorEmbedding = {
  id: 'reaction-faces',
  label: 'reaction faces',
  embedding: [1, 0, 0],
};

const petAnchor: PileAnchorEmbedding = {
  id: 'pets',
  label: 'pets',
  embedding: [0, 1, 0],
};

function asset(id: string, embedding: number[], favorite = false): EmbeddedPileAsset {
  return {
    id,
    blobUrl: `https://blob.test/${id}.png`,
    thumbnailUrl: null,
    pathname: `memes/${id}.png`,
    mime: 'image/png',
    width: 320,
    height: 240,
    favorite,
    size: 1024,
    createdAt: new Date('2026-06-11T00:00:00.000Z'),
    embedding,
  };
}

describe('buildSemanticPiles', () => {
  it('groups embedded assets by nearest text anchor and labels by pile centroid', () => {
    const piles = buildSemanticPiles({
      assets: [
        asset('reaction-1', [0.99, 0.02, 0], true),
        asset('reaction-2', [0.9, 0.1, 0]),
        asset('pet-1', [0.03, 0.98, 0]),
        asset('pet-2', [0.12, 0.88, 0]),
      ],
      anchors: [reactionAnchor, petAnchor],
      maxPiles: 4,
      minPileSize: 2,
    });

    expect(piles).toHaveLength(2);
    expect(piles[0]).toMatchObject({
      id: 'reaction-faces',
      label: 'reaction faces',
      count: 2,
      bangers: 1,
      assetIds: ['reaction-1', 'reaction-2'],
    });
    expect(piles[0].thumbnailAssets.map((item) => item.id)).toEqual([
      'reaction-1',
      'reaction-2',
    ]);
    expect(piles[1]).toMatchObject({
      id: 'pets',
      label: 'pets',
      count: 2,
      bangers: 0,
      assetIds: ['pet-1', 'pet-2'],
    });
  });

  it('drops singleton piles and keeps deterministic ordering for ties', () => {
    const piles = buildSemanticPiles({
      assets: [
        asset('zeta', [1, 0, 0]),
        asset('alpha', [1, 0, 0]),
        asset('lonely', [0, 1, 0]),
      ],
      anchors: [reactionAnchor, petAnchor],
      maxPiles: 4,
      minPileSize: 2,
    });

    expect(piles).toHaveLength(1);
    expect(piles[0].label).toBe('reaction faces');
    expect(piles[0].thumbnailAssets.map((item) => item.id)).toEqual([
      'alpha',
      'zeta',
    ]);
  });
});

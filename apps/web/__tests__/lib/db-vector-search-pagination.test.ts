import { describe, expect, it } from 'vitest';
import { paginateSeededSearchResults } from '@/lib/db';

describe('seeded vector-search pagination', () => {
  it('slices one deterministic candidate pool without overlap or omission', () => {
    const candidates = Array.from({ length: 100 }, (_, index) => `asset-${index}`);
    const pages = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((offset) =>
      paginateSeededSearchResults(candidates, 4242, offset, 10)
    );

    expect(new Set(pages.flat()).size).toBe(100);
    expect(pages.flat()).toEqual(
      paginateSeededSearchResults(candidates, 4242, 0, 100)
    );
    expect(pages).toEqual(
      [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((offset) =>
        paginateSeededSearchResults(candidates, 4242, offset, 10)
      )
    );
  });
});

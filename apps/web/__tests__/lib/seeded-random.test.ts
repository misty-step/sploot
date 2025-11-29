import { describe, test, expect } from 'vitest';
import { createSeededRandom, shuffleWithSeed } from '@/lib/seeded-random';

describe('createSeededRandom', () => {
  test('same seed produces identical sequence', () => {
    const rng1 = createSeededRandom(12345);
    const rng2 = createSeededRandom(12345);

    const sequence1 = [rng1(), rng1(), rng1()];
    const sequence2 = [rng2(), rng2(), rng2()];

    expect(sequence1).toEqual(sequence2);
  });

  test('different seeds produce different sequences', () => {
    const rng1 = createSeededRandom(12345);
    const rng2 = createSeededRandom(54321);

    const sequence1 = [rng1(), rng1()];
    const sequence2 = [rng2(), rng2()];

    expect(sequence1).not.toEqual(sequence2);
  });

  test('generates numbers in [0, 1) range', () => {
    const rng = createSeededRandom(42);

    for (let i = 0; i < 100; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test('seed 0 is valid', () => {
    const rng = createSeededRandom(0);
    const value = rng();

    expect(typeof value).toBe('number');
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  test('max seed (1000000) is valid', () => {
    const rng = createSeededRandom(1000000);
    const value = rng();

    expect(typeof value).toBe('number');
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });
});

describe('shuffleWithSeed', () => {
  test('produces deterministic shuffle', () => {
    const array = [1, 2, 3, 4, 5];
    const result1 = shuffleWithSeed(array, 12345);
    const result2 = shuffleWithSeed(array, 12345);

    expect(result1).toEqual(result2);
  });

  test('different seeds produce different orders', () => {
    const array = [1, 2, 3, 4, 5];
    const result1 = shuffleWithSeed(array, 12345);
    const result2 = shuffleWithSeed(array, 54321);

    expect(result1).not.toEqual(result2);
  });

  test('does not mutate input array', () => {
    const array = [1, 2, 3, 4, 5];
    const original = [...array];

    shuffleWithSeed(array, 42);

    expect(array).toEqual(original);
  });

  test('preserves all elements', () => {
    const array = [1, 2, 3, 4, 5];
    const result = shuffleWithSeed(array, 42);

    expect(result).toHaveLength(array.length);
    expect(result.sort()).toEqual(array.sort());
  });

  test('handles single element array', () => {
    const array = [42];
    const result = shuffleWithSeed(array, 123);

    expect(result).toEqual([42]);
  });

  test('handles empty array', () => {
    const array: number[] = [];
    const result = shuffleWithSeed(array, 123);

    expect(result).toEqual([]);
  });

  test('works with object arrays', () => {
    const array = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: 'c' },
    ];
    const result1 = shuffleWithSeed(array, 999);
    const result2 = shuffleWithSeed(array, 999);

    expect(result1).toEqual(result2);
    expect(result1).toHaveLength(3);
  });
});

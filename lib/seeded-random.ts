/**
 * Mulberry32 seeded PRNG - deterministic random number generator
 *
 * This is a simple, fast, and high-quality pseudo-random number generator
 * suitable for non-cryptographic applications like UI shuffling. The same
 * seed always produces the same sequence of random numbers, enabling
 * deterministic behavior for pagination stability.
 *
 * @param seed - Integer seed value (0-1000000)
 * @returns Function that generates random numbers in [0, 1)
 *
 * @example
 * const rng = createSeededRandom(12345);
 * console.log(rng()); // 0.6011037230491638
 * console.log(rng()); // 0.6764709055423737
 *
 * @see https://stackoverflow.com/a/47593316 - Mulberry32 algorithm
 */
export function createSeededRandom(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates shuffle using seeded PRNG
 *
 * Shuffles an array deterministically based on the provided seed. The same
 * seed and input array always produce the same shuffled output, enabling
 * stable pagination in shuffle mode. Does not mutate the input array.
 *
 * @param array - Array to shuffle (not mutated)
 * @param seed - Integer seed value for deterministic shuffle
 * @returns New shuffled array (same seed = same order)
 *
 * @example
 * shuffleWithSeed([1,2,3], 42); // [2,1,3]
 * shuffleWithSeed([1,2,3], 42); // [2,1,3] (identical)
 * shuffleWithSeed([1,2,3], 99); // [3,2,1] (different seed)
 */
export function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  const random = createSeededRandom(seed);

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * Pure metric math for the retrieval-quality eval (sploot-073).
 *
 * Everything here is deterministic given its inputs — the eval's quality
 * metrics carry a zero noise floor because both the fixture image embeddings
 * and the golden query embeddings are committed to the repo.
 */

/** 1-indexed rank of the first expected id in a ranked result list, or null on a miss. */
export function rankOfFirstExpected(
  rankedIds: string[],
  expected: Set<string>
): number | null {
  for (let i = 0; i < rankedIds.length; i++) {
    if (expected.has(rankedIds[i])) return i + 1;
  }
  return null;
}

export interface RetrievalMetrics {
  top1: number;
  top5: number;
  mrr: number;
  total: number;
}

/** Aggregate top-1 / top-5 hit rates and mean reciprocal rank over per-query ranks. */
export function computeRetrievalMetrics(
  results: Array<{ rank: number | null }>
): RetrievalMetrics {
  const total = results.length;
  if (total === 0) return { top1: 0, top5: 0, mrr: 0, total: 0 };
  let top1 = 0;
  let top5 = 0;
  let rrSum = 0;
  for (const { rank } of results) {
    if (rank === null) continue;
    if (rank === 1) top1++;
    if (rank <= 5) top5++;
    rrSum += 1 / rank;
  }
  return { top1: top1 / total, top5: top5 / total, mrr: rrSum / total, total };
}

/** Linear-interpolated percentile (p in [0, 100]) of a numeric sample. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface DerivedThresholds {
  /** Similarity floor for the search path: keeps every golden correct hit. */
  floor: number;
  /** UI "match" boundary: the strong half of golden correct-hit similarities. */
  match: number;
  /** UI "near" boundary: the bottom of the golden correct-hit distribution. */
  near: number;
  /** Distribution stats the derivation is based on, for the report. */
  stats: {
    correctMin: number;
    correctP25: number;
    correctP50: number;
    correctMax: number;
    irrelevantP50: number;
    irrelevantP95: number;
  };
}

/**
 * Derive the search similarity floor and the UI match/near boundaries from
 * observed score distributions.
 *
 * - `correct` — similarity of the first expected (correct) hit per golden query.
 * - `irrelevant` — similarity of ranked results that are NOT expected for the
 *   query that returned them (the noise the floor should suppress).
 *
 * Rules (documented in eval/README.md):
 * - floor: 90% of the minimum correct-hit similarity, rounded down to 2
 *   decimals — never filters a known-good hit, with a safety margin for
 *   queries slightly weaker than the golden set.
 * - near: p25 of correct-hit similarities — below this a result still ranks
 *   but reads as a weak neighbor.
 * - match: p50 (median) of correct-hit similarities — at or above this a
 *   result scores like a typical verified correct hit.
 */
export function deriveThresholds(
  correct: number[],
  irrelevant: number[]
): DerivedThresholds {
  const correctMin = correct.length ? Math.min(...correct) : 0;
  const floor = Math.floor(correctMin * 0.9 * 100) / 100;
  const near = Math.round(percentile(correct, 25) * 100) / 100;
  const match = Math.round(percentile(correct, 50) * 100) / 100;
  return {
    floor,
    match,
    near,
    stats: {
      correctMin,
      correctP25: percentile(correct, 25),
      correctP50: percentile(correct, 50),
      correctMax: correct.length ? Math.max(...correct) : 0,
      irrelevantP50: percentile(irrelevant, 50),
      irrelevantP95: percentile(irrelevant, 95),
    },
  };
}

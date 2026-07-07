import { describe, it, expect } from 'vitest';
import {
  rankOfFirstExpected,
  computeRetrievalMetrics,
  percentile,
  deriveThresholds,
} from '@/lib/eval/metrics';

describe('rankOfFirstExpected', () => {
  it('returns 1-indexed rank of the first expected id', () => {
    expect(rankOfFirstExpected(['a', 'b', 'c'], new Set(['b']))).toBe(2);
    expect(rankOfFirstExpected(['a', 'b', 'c'], new Set(['a', 'c']))).toBe(1);
  });

  it('returns null when no expected id is ranked', () => {
    expect(rankOfFirstExpected(['a', 'b'], new Set(['z']))).toBeNull();
    expect(rankOfFirstExpected([], new Set(['z']))).toBeNull();
  });
});

describe('computeRetrievalMetrics', () => {
  it('computes top-1, top-5 hit rates and MRR', () => {
    const metrics = computeRetrievalMetrics([
      { rank: 1 }, // top1 hit, RR 1
      { rank: 2 }, // top5 hit, RR 0.5
      { rank: 7 }, // beyond top5, RR 1/7
      { rank: null }, // miss, RR 0
    ]);
    expect(metrics.top1).toBeCloseTo(1 / 4);
    expect(metrics.top5).toBeCloseTo(2 / 4);
    expect(metrics.mrr).toBeCloseTo((1 + 0.5 + 1 / 7 + 0) / 4);
    expect(metrics.total).toBe(4);
  });

  it('handles empty input without NaN', () => {
    const metrics = computeRetrievalMetrics([]);
    expect(metrics.top1).toBe(0);
    expect(metrics.top5).toBe(0);
    expect(metrics.mrr).toBe(0);
    expect(metrics.total).toBe(0);
  });
});

describe('percentile', () => {
  it('computes interpolated percentiles', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
  });

  it('returns 0 for empty input', () => {
    expect(percentile([], 95)).toBe(0);
  });
});

describe('deriveThresholds', () => {
  it('derives a floor below every correct-hit similarity and boundaries from the hit distribution', () => {
    // Correct hits cluster ~0.20-0.30; irrelevant results cluster ~0.08-0.15.
    const correct = [0.2, 0.22, 0.24, 0.26, 0.28, 0.3];
    const irrelevant = [0.08, 0.1, 0.12, 0.14, 0.15];
    const t = deriveThresholds(correct, irrelevant);
    // Floor must not filter any correct hit.
    expect(t.floor).toBeLessThan(Math.min(...correct));
    // ...but should sit above the bulk of irrelevant scores.
    expect(t.floor).toBeGreaterThan(percentile(irrelevant, 50));
    // Boundaries are ordered: match > near > floor.
    expect(t.match).toBeGreaterThan(t.near);
    expect(t.near).toBeGreaterThanOrEqual(t.floor);
  });
});

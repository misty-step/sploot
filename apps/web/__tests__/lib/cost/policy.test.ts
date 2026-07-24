import { describe, expect, it } from 'vitest';
import { getPlanFileSizeCapBytes, getPlanInferenceBudget } from '@/lib/cost/policy';
import economicsPolicy from '../../../../../economics/policy.json';

describe('cost admission policy', () => {
  it('projects per-plan inference budgets from economics/policy.json', () => {
    for (const plan of ['free', 'collector', 'archive'] as const) {
      expect(getPlanInferenceBudget(plan)).toEqual({
        dailyAttempts: economicsPolicy.planBudgets[plan].dailyInferenceAttempts,
        monthlyAttempts: economicsPolicy.planBudgets[plan].monthlyInferenceAttempts,
      });
    }
  });

  it('projects the versioned free-tier per-file cap', () => {
    expect(getPlanFileSizeCapBytes('free')).toBe(economicsPolicy.planFileSizeCapBytes.free);
    expect(getPlanFileSizeCapBytes('free')).toBe(1_073_741_824);
  });

  it('gives every plan tier a positive daily and monthly attempt ceiling', () => {
    for (const plan of ['free', 'collector', 'archive'] as const) {
      const budget = getPlanInferenceBudget(plan);
      expect(budget.dailyAttempts).toBeGreaterThan(0);
      expect(budget.monthlyAttempts).toBeGreaterThan(0);
      expect(getPlanFileSizeCapBytes(plan)).toBeGreaterThan(0);
    }
  });
});

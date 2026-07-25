import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: null }));

import { admitCost, isCostAdmissionHalted } from '@/lib/cost/kernel';
import { CostAdmissionError, costAdmissionSeverity } from '@/lib/cost/errors';
import { getPlanFileSizeCapBytes } from '@/lib/cost/policy';

describe('cost admission kernel fail-closed behavior', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('denies inference admission when its Postgres counter store is unavailable', async () => {
    await expect(admitCost({ capability: 'embedding_query', userId: 'user-1' })).rejects.toMatchObject({
      name: 'CostAdmissionError',
      reason: 'limiter_unavailable',
      severity: 'outage',
      statusCode: 503,
    } satisfies Partial<CostAdmissionError>);
  });

  it('denies image-indexing admission the same way as query admission', async () => {
    await expect(admitCost({ capability: 'embedding_index', userId: 'user-1' })).rejects.toMatchObject({
      name: 'CostAdmissionError',
      reason: 'limiter_unavailable',
      severity: 'outage',
    });
  });

  it('admits an upload within the plan file-size cap without touching Postgres', async () => {
    const lease = await admitCost({ capability: 'upload', userId: 'user-1', bytes: 1024 });
    expect(lease.capability).toBe('upload');
    expect(lease.warn).toBe(false);
    await expect(lease.commit()).resolves.toBeUndefined();
    await expect(lease.refund()).resolves.toBeUndefined();
  });

  it('denies an upload over the plan file-size cap regardless of Postgres availability', async () => {
    const cap = getPlanFileSizeCapBytes('free');
    await expect(
      admitCost({ capability: 'upload', userId: 'user-1', bytes: cap + 1 })
    ).rejects.toMatchObject({
      name: 'CostAdmissionError',
      reason: 'file_too_large',
      severity: 'hard_limit',
      statusCode: 413,
      retryable: false,
    });
  });

  it('admits an upload at exactly the cap boundary', async () => {
    const cap = getPlanFileSizeCapBytes('free');
    await expect(admitCost({ capability: 'upload', userId: 'user-1', bytes: cap })).resolves.toMatchObject({
      capability: 'upload',
    });
  });

  it('rejects a malformed upload admission request instead of silently admitting it', async () => {
    await expect(admitCost({ capability: 'upload', userId: 'user-1' })).rejects.toThrow(
      /requires a non-negative bytes estimate/
    );
    await expect(admitCost({ capability: 'upload', userId: 'user-1', bytes: -1 })).rejects.toThrow(
      /requires a non-negative bytes estimate/
    );
  });

  it('admits a system blob_write with no Postgres dependency', async () => {
    const lease = await admitCost({ capability: 'blob_write', userId: 'system:cron' });
    expect(lease.capability).toBe('blob_write');
  });

  describe('emergency stop', () => {
    it('is off by default', () => {
      expect(isCostAdmissionHalted()).toBe(false);
    });

    it.each(['1', 'true', 'TRUE', 'on', 'enabled', 'yes'])(
      'halts every capability when SPLOOT_COST_ADMISSION_HALT=%s',
      async (value) => {
        vi.stubEnv('SPLOOT_COST_ADMISSION_HALT', value);
        expect(isCostAdmissionHalted()).toBe(true);

        await expect(
          admitCost({ capability: 'upload', userId: 'user-1', bytes: 1 })
        ).rejects.toMatchObject({
          name: 'CostAdmissionError',
          reason: 'emergency_stop',
          severity: 'emergency_stop',
          statusCode: 503,
        });
      }
    );

    it.each(['0', 'false', 'off', 'disabled', 'no', ''])(
      'does not halt for %s',
      (value) => {
        vi.stubEnv('SPLOOT_COST_ADMISSION_HALT', value);
        expect(isCostAdmissionHalted()).toBe(false);
      }
    );
  });

  describe('costAdmissionSeverity', () => {
    it('classifies every reason into exactly one policy state', () => {
      expect(costAdmissionSeverity('file_too_large')).toBe('hard_limit');
      expect(costAdmissionSeverity('user_daily_budget')).toBe('hard_limit');
      expect(costAdmissionSeverity('user_monthly_budget')).toBe('hard_limit');
      expect(costAdmissionSeverity('limiter_unavailable')).toBe('outage');
      expect(costAdmissionSeverity('emergency_stop')).toBe('emergency_stop');
    });
  });
});

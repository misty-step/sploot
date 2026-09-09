import { describe, expect, it } from 'vitest';
import { readPublicEnrollmentState } from '@/lib/enrollment/enrollment-policy';
import {
  assertPublicTruthE2EBuildAllowed,
  isCompiledPublicTruthE2EBuild,
  isPublicTruthE2EBuild,
} from '@/lib/public-truth-e2e';

describe('public truth contracts', () => {
  it('projects the server enrollment policy into a public-safe closed/open state', async () => {
    expect((await readPublicEnrollmentState({
      env: {
        NODE_ENV: 'production',
        SPLOOT_DEPLOYMENT_ENV: 'production',
        SPLOOT_ENROLLMENT_MODE: 'closed',
        SPLOOT_DEPLOYMENT_APP_ID: 'app',
        SPLOOT_DEPLOYMENT_CHANGE_ID: 'change',
        SPLOOT_DEPLOYMENT_COMMIT: '3e258ec5',
      },
      prisma: null,
    })).state).toEqual({ status: 'paused', mode: 'closed', configuration: 'valid' });

    expect((await readPublicEnrollmentState({
      env: {
        NODE_ENV: 'production',
        SPLOOT_DEPLOYMENT_ENV: 'production',
        SPLOOT_ENROLLMENT_MODE: 'ga',
        SPLOOT_DEPLOYMENT_APP_ID: 'app',
        SPLOOT_DEPLOYMENT_CHANGE_ID: 'change',
        SPLOOT_DEPLOYMENT_COMMIT: '3e258ec5',
      },
      prisma: { user: { count: async () => 0 } },
    })).state).toEqual({ status: 'open', mode: 'ga', configuration: 'valid' });
  });

  it('cannot enable the provider omission in a production build', () => {
    expect(isPublicTruthE2EBuild({ NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'test', SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true' })).toBe(true);
    expect(isPublicTruthE2EBuild({ NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'production', SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true' })).toBe(false);
    expect(() => assertPublicTruthE2EBuildAllowed({ NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'production', SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true' })).toThrow(/test-only/);
    expect(() => assertPublicTruthE2EBuildAllowed({ NODE_ENV: 'production', SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true' })).toThrow(/requires/);
    expect(isPublicTruthE2EBuild({ NODE_ENV: 'production' })).toBe(false);
    expect(isCompiledPublicTruthE2EBuild({ NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'evidence', NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E: 'true' })).toBe(true);
    expect(isCompiledPublicTruthE2EBuild({ NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'production', NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E: 'true' })).toBe(false);
  });

});

import { describe, expect, it } from 'vitest';
import {
  ENROLLMENT_DENIAL_CODE,
  getEnrollmentStatus,
  getEnrollmentReadback,
  readPublicEnrollmentState,
  enrollmentDeniedResponse,
  enrollmentDeniedResponseBody,
  assertNewEnrollmentAllowed,
  assertEnrolledUser,
} from '@/lib/enrollment/enrollment-policy';

describe('enrollment policy', () => {
  const productionEnv = {
    NODE_ENV: 'production',
    SPLOOT_DEPLOYMENT_ENV: 'production',
    SPLOOT_DEPLOYMENT_APP_ID: 'app-1',
    SPLOOT_DEPLOYMENT_COMMIT: 'deadbeef',
    SPLOOT_DEPLOYMENT_CHANGE_ID: 'change-1',
  };

  it('counts capped accounts and pauses at the exact limit', async () => {
    const count = async () => 12;
    const result = await readPublicEnrollmentState({
      env: { ...productionEnv, SPLOOT_ENROLLMENT_MODE: 'capped', SPLOOT_ENROLLMENT_MAX_ACCOUNTS: '12' },
      prisma: { user: { count } },
    });

    expect(result).toEqual({
      state: { status: 'paused', mode: 'capped', configuration: 'valid' },
      available: true,
    });
  });

  it('changes the public state when the capped runtime count crosses the limit', async () => {
    let accountCount = 11;
    const prisma = { user: { count: async () => accountCount } };
    const env = { ...productionEnv, SPLOOT_ENROLLMENT_MODE: 'capped', SPLOOT_ENROLLMENT_MAX_ACCOUNTS: '12' };

    await expect(readPublicEnrollmentState({ env, prisma })).resolves.toMatchObject({
      state: { status: 'open', mode: 'capped', configuration: 'valid' },
      available: true,
    });

    accountCount = 12;
    await expect(readPublicEnrollmentState({ env, prisma })).resolves.toMatchObject({
      state: { status: 'paused', mode: 'capped', configuration: 'valid' },
      available: true,
    });
  });

  it('reports unknown, not paused, when the enrollment database is unavailable', async () => {
    const result = await readPublicEnrollmentState({
      env: { ...productionEnv, SPLOOT_ENROLLMENT_MODE: 'ga' },
      prisma: { user: { count: async () => { throw new Error('database down'); } } },
    });

    expect(result).toEqual({
      state: { status: 'unknown', mode: 'ga', configuration: 'valid' },
      available: false,
    });
  });

  it('reports unknown for a capped configuration without a database seam', async () => {
    const result = await readPublicEnrollmentState({
      env: { ...productionEnv, SPLOOT_ENROLLMENT_MODE: 'capped', SPLOOT_ENROLLMENT_MAX_ACCOUNTS: '12' },
      prisma: null,
    });

    expect(result).toEqual({
      state: { status: 'unknown', mode: 'capped', configuration: 'valid' },
      available: false,
    });
  });

  it('keeps closed mode an ordinary pause that never needs the database', async () => {
    const result = await readPublicEnrollmentState({
      env: { ...productionEnv, SPLOOT_ENROLLMENT_MODE: 'closed' },
      prisma: null,
    });

    expect(result).toEqual({
      state: { status: 'paused', mode: 'closed', configuration: 'valid' },
      available: true,
    });
  });

  it('pauses malformed configuration without attempting a database read', async () => {
    const count = async () => 0;
    const result = await readPublicEnrollmentState({
      env: { ...productionEnv, SPLOOT_ENROLLMENT_MODE: 'capped' },
      prisma: { user: { count } },
    });

    expect(result).toEqual({
      state: { status: 'paused', mode: 'closed', configuration: 'invalid' },
      available: false,
    });
  });

  it('fails closed for an incomplete production configuration', () => {
    expect(getEnrollmentStatus({ NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'production' })).toMatchObject({
      mode: 'closed',
      acceptingNewAccounts: false,
      configuration: 'invalid',
    });
  });

  it('allows only the explicit test deployment authority for the production-shaped browser artifact', () => {
    expect(getEnrollmentStatus({
      NODE_ENV: 'production',
      SPLOOT_DEPLOYMENT_ENV: 'test',
      SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true',
      SPLOOT_ENROLLMENT_MODE: 'closed',
    })).toMatchObject({ mode: 'closed', configuration: 'valid' });
    expect(getEnrollmentStatus({
      NODE_ENV: 'production',
      SPLOOT_DEPLOYMENT_ENV: 'test',
      SPLOOT_ENROLLMENT_MODE: 'closed',
    })).toMatchObject({ mode: 'closed', configuration: 'invalid' });
  });

  it('fails closed when the production marker is missing or ambiguous', () => {
    expect(getEnrollmentStatus({ NODE_ENV: 'production', SPLOOT_ENROLLMENT_MODE: 'ga' })).toMatchObject({
      mode: 'closed',
      configurationReason: 'missing_deployment_marker',
    });
    expect(getEnrollmentStatus({
      NODE_ENV: 'production',
      SPLOOT_DEPLOYMENT_ENV: 'prod',
      SPLOOT_ENROLLMENT_MODE: 'ga',
    })).toMatchObject({
      mode: 'closed',
      configurationReason: 'invalid_deployment_marker',
    });
    expect(getEnrollmentStatus({
      NODE_ENV: 'production',
      SPLOOT_DEPLOYMENT_ENV: 'development',
      SPLOOT_ENROLLMENT_MODE: 'ga',
    })).toMatchObject({
      mode: 'closed',
      configurationReason: 'invalid_deployment_marker',
      acceptingNewAccounts: false,
    });
    expect(getEnrollmentStatus({ SPLOOT_ENROLLMENT_MODE: 'ga' })).toMatchObject({
      mode: 'closed',
      configurationReason: 'missing_deployment_marker',
      acceptingNewAccounts: false,
    });
  });

  it('allows local GA only with an explicit local/test marker', () => {
    expect(getEnrollmentStatus({ NODE_ENV: 'test' })).toMatchObject({ mode: 'ga', configuration: 'valid' });
    expect(getEnrollmentStatus({ NODE_ENV: 'development' })).toMatchObject({ mode: 'ga', configuration: 'valid' });
    expect(getEnrollmentStatus({ NODE_ENV: 'ci' })).toMatchObject({
      mode: 'closed',
      configuration: 'invalid',
      configurationReason: 'missing_deployment_marker',
    });
  });

  it('reports the exact capped operator readback', () => {
    expect(getEnrollmentReadback(7, {
      NODE_ENV: 'production',
      SPLOOT_DEPLOYMENT_ENV: 'production',
      SPLOOT_DEPLOYMENT_APP_ID: 'app-1',
      SPLOOT_DEPLOYMENT_COMMIT: 'deadbeef',
      SPLOOT_DEPLOYMENT_CHANGE_ID: 'change-1',
      SPLOOT_ENROLLMENT_MODE: 'capped',
      SPLOOT_ENROLLMENT_MAX_ACCOUNTS: '12',
    })).toMatchObject({
      mode: 'capped',
      maxAccounts: 12,
      acceptingNewAccounts: true,
      remainingAccounts: 5,
      configuration: 'valid',
    });
  });

  it('marks the explicit GA lift as uncapped', () => {
    expect(getEnrollmentStatus({
      NODE_ENV: 'production',
      SPLOOT_DEPLOYMENT_ENV: 'production',
      SPLOOT_DEPLOYMENT_APP_ID: 'app-1',
      SPLOOT_DEPLOYMENT_COMMIT: 'deadbeef',
      SPLOOT_DEPLOYMENT_CHANGE_ID: 'change-1',
      SPLOOT_ENROLLMENT_MODE: 'ga',
    })).toMatchObject({
      mode: 'ga',
      maxAccounts: null,
      acceptingNewAccounts: true,
      configuration: 'valid',
    });
  });

  it('uses a stable machine-readable denial', () => {
    expect(enrollmentDeniedResponseBody()).toMatchObject({
      code: ENROLLMENT_DENIAL_CODE,
      retryable: true,
      action: { type: 'try_later' },
    });
  });

  it('serves denial as a stable 403 response', async () => {
    const response = enrollmentDeniedResponse();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: ENROLLMENT_DENIAL_CODE });
  });

  it('holds the database lock before counting accounts', async () => {
    const calls: string[] = [];
    const tx = {
      $executeRaw: async () => { calls.push('lock'); },
      user: { count: async () => { calls.push('count'); return 2; } },
    };

    await expect(assertNewEnrollmentAllowed(tx, {
      NODE_ENV: 'production',
      SPLOOT_DEPLOYMENT_ENV: 'production',
      SPLOOT_DEPLOYMENT_APP_ID: 'app-1',
      SPLOOT_DEPLOYMENT_COMMIT: 'deadbeef',
      SPLOOT_DEPLOYMENT_CHANGE_ID: 'change-1',
      SPLOOT_ENROLLMENT_MODE: 'capped',
      SPLOOT_ENROLLMENT_MAX_ACCOUNTS: '2',
    })).rejects.toMatchObject({ code: ENROLLMENT_DENIAL_CODE });
    expect(calls).toEqual(['lock', 'count']);
  });

  it('fails closed when the enrollment database contract is unavailable', async () => {
    await expect(assertEnrolledUser('user-1', null)).rejects.toMatchObject({
      code: 'enrollment_unavailable',
    });
    await expect(assertEnrolledUser('user-1', {} as never)).rejects.toMatchObject({
      code: 'enrollment_unavailable',
    });
  });

  it('turns lock or count failures into an unavailable state', async () => {
    const tx = {
      $executeRaw: async () => { throw new Error('database down'); },
      user: { count: async () => 0 },
    } as never;

    await expect(assertNewEnrollmentAllowed(tx, {
      NODE_ENV: 'production',
      SPLOOT_DEPLOYMENT_ENV: 'production',
      SPLOOT_DEPLOYMENT_APP_ID: 'app-1',
      SPLOOT_DEPLOYMENT_COMMIT: 'deadbeef',
      SPLOOT_DEPLOYMENT_CHANGE_ID: 'change-1',
      SPLOOT_ENROLLMENT_MODE: 'capped',
      SPLOOT_ENROLLMENT_MAX_ACCOUNTS: '2',
    })).rejects.toMatchObject({ code: 'enrollment_unavailable' });
  });
});

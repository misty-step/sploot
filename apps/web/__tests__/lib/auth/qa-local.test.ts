import { describe, expect, it } from 'vitest';
import {
  createQaLocalAuthToken,
  getQaLocalAuthHeader,
  verifyQaLocalAuthHeaders,
} from '@/lib/auth/qa-local';

describe('qa-local auth tokens', () => {
  it('authenticates a signed non-production QA principal from headers', async () => {
    const env = {
      NODE_ENV: 'test',
      SPLOOT_QA_AUTH_MODE: 'enabled',
      SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
    };
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      email: 'qa-user-1@sploot.test',
      secret: env.SPLOOT_QA_AUTH_SECRET,
      expiresInSeconds: 60,
    });

    const result = await verifyQaLocalAuthHeaders(
      new Headers({ [getQaLocalAuthHeader()]: token }),
      env
    );

    expect(result.status).toBe('authenticated');
    if (result.status === 'authenticated') {
      expect(result.principal).toMatchObject({
        userId: 'qa-user-1',
        email: 'qa-user-1@sploot.test',
        provider: 'qa-local',
        source: 'qa-local',
      });
    }
  });

  it('rejects QA auth in production even when the secret and mode are set', async () => {
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: 'test-secret-with-enough-entropy',
      expiresInSeconds: 60,
    });

    const result = await verifyQaLocalAuthHeaders(
      new Headers({ [getQaLocalAuthHeader()]: token }),
      {
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
        SPLOOT_QA_AUTH_MODE: 'enabled',
        SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
      }
    );

    expect(result).toMatchObject({
      status: 'forbidden',
      reason: 'qa-local-disabled',
    });
  });
});

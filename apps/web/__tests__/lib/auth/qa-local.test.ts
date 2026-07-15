import { describe, expect, it } from 'vitest';
import {
  createQaLocalAuthToken,
  getQaLocalAuthHeader,
  getQaLocalAuthCookieName,
  verifyQaLocalAuthHeaders,
} from '@/lib/auth/qa-local';
import { authenticateRequest } from '@/lib/auth/request-auth';
import { vi } from 'vitest';

const uploadTokenMock = vi.hoisted(() => ({
  verifyUploadToken: vi.fn().mockResolvedValue({
    userId: 'upload-user',
    provider: 'upload-token',
    providerSubject: 'upload-user',
    source: 'upload-token',
    credentialKind: 'upload-token',
    uploadTokenId: 'token-1',
  }),
}));

vi.mock('@/lib/auth/upload-token', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/upload-token')>()),
  verifyUploadToken: uploadTokenMock.verifyUploadToken,
}));

const clerkMock = vi.hoisted(() => ({
  verifyBearerOrThrow: vi.fn(),
}));

vi.mock('@/lib/auth/verify-bearer', () => ({
  verifyBearerOrThrow: clerkMock.verifyBearerOrThrow,
}));

describe('qa-local auth tokens', () => {
  it('authenticates a signed non-production QA principal from headers', async () => {
    const env = {
      NODE_ENV: 'test',
      SPLOOT_DEPLOYMENT_ENV: 'test',
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

  it('rejects malformed percent-encoded QA cookies without throwing', async () => {
    const result = await verifyQaLocalAuthHeaders(
      new Headers({ cookie: `${getQaLocalAuthCookieName()}=%E0%A4%A` }),
      {
        NODE_ENV: 'test',
        SPLOOT_DEPLOYMENT_ENV: 'test',
        SPLOOT_QA_AUTH_MODE: 'enabled',
        SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
      }
    );

    expect(result).toMatchObject({ status: 'unauthenticated', reason: 'qa-local-invalid' });
  });

  it('bounds QA token schema, namespace, and lifetime', async () => {
    await expect(createQaLocalAuthToken({
      userId: 'not-qa-user',
      secret: 'test-secret-with-enough-entropy',
    })).rejects.toThrow(/qa-user namespace/);
    await expect(createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: 'test-secret-with-enough-entropy',
      expiresInSeconds: 8 * 60 * 60 + 1,
    })).rejects.toThrow(/out of bounds/);
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
        SPLOOT_DEPLOYMENT_ENV: 'production',
        SPLOOT_QA_AUTH_MODE: 'enabled',
        SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
      }
    );

    expect(result).toMatchObject({
      status: 'forbidden',
      reason: 'qa-local-disabled',
    });
  });

  it('requires an explicit local deployment marker even when NODE_ENV is non-production', async () => {
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: 'test-secret-with-enough-entropy',
      expiresInSeconds: 60,
    });
    const result = await verifyQaLocalAuthHeaders(
      new Headers({ [getQaLocalAuthHeader()]: token }),
      {
        NODE_ENV: 'test',
        SPLOOT_QA_AUTH_MODE: 'enabled',
        SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
      },
    );
    expect(result).toMatchObject({ status: 'forbidden', reason: 'qa-local-disabled' });
  });

  it('still accepts upload-token credentials when no QA credential is present', async () => {
    const result = await authenticateRequest(
      new Request('http://localhost:3000/api/upload', {
        headers: {
          authorization: 'Bearer splt_valid',
        },
      }) as never,
      {
        allowUploadToken: true,
        env: { NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'production' },
      },
    );

    expect(result).toMatchObject({ status: 'authenticated' });
  });

  it('treats an invalid QA credential as terminal even when upload-token auth is available', async () => {
    const result = await authenticateRequest(
      new Request('http://localhost:3000/api/upload', {
        headers: {
          authorization: 'Bearer splt_valid',
          [getQaLocalAuthHeader()]: 'malformed',
        },
      }) as never,
      {
        allowUploadToken: true,
        env: {
          NODE_ENV: 'test',
          SPLOOT_DEPLOYMENT_ENV: 'test',
          SPLOOT_QA_AUTH_MODE: 'enabled',
          SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
        },
      },
    );

    expect(result.status).toBe('unauthenticated');
    expect(result).toMatchObject({ reason: 'qa-local-invalid' });
  });

  it('treats an invalid QA credential as terminal and never falls through to Clerk', async () => {
    clerkMock.verifyBearerOrThrow.mockResolvedValue('clerk-user');
    const result = await authenticateRequest(
      new Request('http://localhost:3000/api/cache/stats', {
        headers: {
          [getQaLocalAuthHeader()]: 'not-a-valid-token',
          'x-forwarded-for': '127.0.0.1',
        },
      }) as never,
      {
        allowClerk: true,
        allowQaLocal: true,
        env: {
          NODE_ENV: 'test',
          SPLOOT_DEPLOYMENT_ENV: 'test',
          SPLOOT_QA_AUTH_MODE: 'enabled',
          SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
        },
      }
    );

    expect(result).toMatchObject({ status: 'unauthenticated', reason: 'qa-local-invalid' });
    expect(clerkMock.verifyBearerOrThrow).not.toHaveBeenCalled();
  });
});

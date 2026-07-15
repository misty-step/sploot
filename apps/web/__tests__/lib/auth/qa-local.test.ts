import { beforeEach, describe, expect, it } from 'vitest';
import {
  createQaLocalAuthToken,
  getQaLocalAuthHeader,
  getQaLocalAuthCookieName,
  QA_LOCAL_AUDIENCE,
  QA_LOCAL_DEPLOYMENT_ENV,
  QA_LOCAL_DEPLOYMENT_ID,
  validateQaLocalDeploymentConfig,
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

const SECRET = 'test-secret-with-enough-entropy';
const env = {
  NODE_ENV: 'test',
  SPLOOT_DEPLOYMENT_ENV: 'test',
  SPLOOT_QA_AUTH_MODE: 'enabled',
  SPLOOT_QA_AUTH_SECRET: SECRET,
  SPLOOT_QA_DEPLOYMENT_ID: QA_LOCAL_DEPLOYMENT_ID,
  SPLOOT_QA_DEPLOYMENT_ENV: QA_LOCAL_DEPLOYMENT_ENV,
  SPLOOT_QA_AUDIENCE: QA_LOCAL_AUDIENCE,
};
const boundary = { host: '127.0.0.1:3112', remoteAddress: '127.0.0.1' };

async function token(options: Partial<Parameters<typeof createQaLocalAuthToken>[0]> = {}) {
  return createQaLocalAuthToken({ userId: 'qa-user-1', secret: SECRET, expiresInSeconds: 60, ...options });
}

describe('qa-local auth security contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('authenticates only a signed principal at the loopback boundary', async () => {
    const result = await verifyQaLocalAuthHeaders(
      new Headers({ [getQaLocalAuthHeader()]: await token(), host: boundary.host, 'x-forwarded-for': boundary.remoteAddress }),
      env,
      boundary,
    );
    expect(result.status).toBe('authenticated');
  });

  it('rejects malformed percent-encoded QA cookies without throwing', async () => {
    const result = await verifyQaLocalAuthHeaders(
      new Headers({ cookie: `${getQaLocalAuthCookieName()}=%E0%A4%A`, host: boundary.host, 'x-forwarded-for': boundary.remoteAddress }),
      env,
      boundary,
    );

    expect(result).toMatchObject({ status: 'unauthenticated', reason: 'qa-local-invalid' });
  });

  it('bounds QA token schema, namespace, and lifetime', async () => {
    await expect(createQaLocalAuthToken({
      userId: 'not-qa-user',
      secret: SECRET,
    })).rejects.toThrow(/qa-user namespace/);
    await expect(createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: SECRET,
      expiresInSeconds: 15 * 60 + 1,
    })).rejects.toThrow(/qa-local token lifetime/);
  });

  it('rejects QA auth in production even when the secret and mode are set', async () => {
    const result = await verifyQaLocalAuthHeaders(
      new Headers({ [getQaLocalAuthHeader()]: await token(), host: boundary.host, 'x-forwarded-for': boundary.remoteAddress }),
      {
        NODE_ENV: 'production',
        SPLOOT_DEPLOYMENT_ENV: 'production',
        SPLOOT_QA_AUTH_MODE: 'enabled',
        SPLOOT_QA_AUTH_SECRET: SECRET,
      },
      boundary,
    );
    expect(result.status).toBe('forbidden');
  });

  it.each([
    ['missing deployment id', { SPLOOT_QA_DEPLOYMENT_ID: undefined }],
    ['unknown deployment id', { SPLOOT_QA_DEPLOYMENT_ID: 'unknown' }],
    ['production deployment marker', { DEPLOYMENT_ENV: 'production' }],
    ['production SPLOOT_DEPLOYMENT_ENV marker', { SPLOOT_DEPLOYMENT_ENV: 'production' }],
    ['staging SPLOOT_DEPLOYMENT_ENV marker', { SPLOOT_DEPLOYMENT_ENV: 'staging' }],
    ['missing SPLOOT_DEPLOYMENT_ENV marker', { SPLOOT_DEPLOYMENT_ENV: undefined }],
    ['DigitalOcean deployment marker', { DO_APP_PLATFORM: 'true' }],
    ['missing audience', { SPLOOT_QA_AUDIENCE: undefined }],
    ['missing proof secret', { SPLOOT_QA_AUTH_SECRET: undefined }],
  ])('fails closed for %s', async (_label, overrides) => {
    const badEnv = { ...env, ...overrides };
    expect(validateQaLocalDeploymentConfig(badEnv).valid).toBe(false);
    const result = await verifyQaLocalAuthHeaders(
      new Headers({ [getQaLocalAuthHeader()]: await token(), host: boundary.host, 'x-forwarded-for': boundary.remoteAddress }),
      badEnv,
      boundary,
    );
    expect(result.status).toBe('forbidden');
  });

  it.each([
    ['wrong audience', { audience: 'other-audience' }],
    ['wrong deployment', { deploymentId: 'other-deployment' }],
    ['wrong environment', { deploymentEnv: 'production' }],
  ])('rejects a signed token with %s', async (_label, options) => {
    const result = await verifyQaLocalAuthHeaders(
      new Headers({ [getQaLocalAuthHeader()]: await token(options), host: boundary.host, 'x-forwarded-for': boundary.remoteAddress }),
      env,
      boundary,
    );
    expect(result).toMatchObject({ status: 'unauthenticated', reason: 'qa-local-invalid' });
  });

  it('rejects malformed signatures and token lifetimes beyond fifteen minutes', async () => {
    const signed = await token();
    const malformed = await verifyQaLocalAuthHeaders(
      new Headers({ [getQaLocalAuthHeader()]: `${signed.slice(0, -1)}x`, host: boundary.host, 'x-forwarded-for': boundary.remoteAddress }),
      env,
      boundary,
    );
    expect(malformed).toMatchObject({ status: 'unauthenticated', reason: 'qa-local-invalid' });
    await expect(token({ expiresInSeconds: 901 })).rejects.toThrow('qa-local token lifetime');
  });

  it.each([
    ['expired token', { now: new Date(Date.now() - 120_000), expiresInSeconds: 60 }, boundary, {}],
    ['non-loopback host', {}, { ...boundary, host: 'evil.example:3112' }, {}],
    ['non-loopback remote', {}, { ...boundary, remoteAddress: '203.0.113.4' }, {}],
    ['forwarded host', {}, boundary, { 'x-forwarded-host': 'evil.example' }],
    ['forwarded chain', {}, boundary, { 'x-forwarded-for': '127.0.0.1, 203.0.113.4' }],
    ['production Clerk cookie coexistence', {}, boundary, { cookie: '__session=production-token' }],
    ['production authorization coexistence', {}, boundary, { authorization: 'Bearer production-token' }],
  ])('rejects %s', async (_label, options, request, extra) => {
    const headers = new Headers({ [getQaLocalAuthHeader()]: await token(options), host: request.host, 'x-forwarded-for': request.remoteAddress, ...extra });
    const result = await verifyQaLocalAuthHeaders(headers, env, request);
    expect(['forbidden', 'unauthenticated']).toContain(result.status);
  });

  it('rejects a production process unless it is explicitly the local-qa capture deployment', () => {
    expect(validateQaLocalDeploymentConfig({ ...env, NODE_ENV: 'production' }).valid).toBe(false);
    expect(validateQaLocalDeploymentConfig({ ...env, NODE_ENV: 'production', DEPLOYMENT_ENV: QA_LOCAL_DEPLOYMENT_ENV, SPLOOT_PWA_CAPTURE_MODE: 'enabled' }).valid).toBe(true);
  });

  it('requires an explicit local deployment marker even when NODE_ENV is non-production', async () => {
    const result = await verifyQaLocalAuthHeaders(
      new Headers({ [getQaLocalAuthHeader()]: await token(), host: boundary.host, 'x-forwarded-for': boundary.remoteAddress }),
      { ...env, SPLOOT_DEPLOYMENT_ENV: undefined },
      boundary,
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
          'x-forwarded-for': '127.0.0.1',
        },
      }) as never,
      {
        allowUploadToken: true,
        env,
      },
    );

    expect(result.status).toBe('forbidden');
    expect(result).toMatchObject({ reason: 'qa-local-production-auth-coexistence' });
    expect(uploadTokenMock.verifyUploadToken).not.toHaveBeenCalled();
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
        env,
      }
    );

    expect(result).toMatchObject({ status: 'unauthenticated', reason: 'qa-local-invalid' });
    expect(clerkMock.verifyBearerOrThrow).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  createQaLocalAuthToken,
  createQaLocalProxyProof,
  getQaLocalAuthCookieName,
  getQaLocalAuthHeader,
  validateQaProofConfig,
  verifyQaLocalAuthHeaders,
} from '@/lib/auth/qa-local';
import { authenticateRequest } from '@/lib/auth/request-auth';

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

const clerkMock = vi.hoisted(() => ({ verifyBearerOrThrow: vi.fn() }));
vi.mock('@/lib/auth/verify-bearer', () => ({ verifyBearerOrThrow: clerkMock.verifyBearerOrThrow }));

const QA_ENV = {
  NODE_ENV: 'test',
  SPLOOT_DEPLOYMENT_ENV: 'test',
  SPLOOT_QA_AUTH_MODE: 'enabled',
  SPLOOT_QA_EVIDENCE_MODE: 'enabled',
  SPLOOT_QA_DEPLOYMENT_ID: 'sploot-gallery-qa-local',
  SPLOOT_QA_DEPLOYMENT_AUDIENCE: 'sploot-gallery-evidence',
  DEPLOYMENT_ENV: 'qa-local',
  SPLOOT_QA_AUTH_SECRET: 'test-secret-with-enough-entropy',
};

const qaRequest = (token: string, host = 'localhost:3474', remoteAddress = '127.0.0.1') => new Headers({
  host,
  [getQaLocalAuthHeader()]: token,
  'x-sploot-qa-remote-address': remoteAddress,
});

describe('qa-local auth tokens', () => {
  it('authenticates a signed non-production QA principal from headers', async () => {
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      email: 'qa-user-1@sploot.test',
      secret: QA_ENV.SPLOOT_QA_AUTH_SECRET,
      expiresInSeconds: 60,
    });
    const result = await verifyQaLocalAuthHeaders(qaRequest(token), QA_ENV, { host: 'localhost', remoteAddress: '127.0.0.1' });
    expect(result).toMatchObject({
      status: 'authenticated',
      principal: {
        userId: 'qa-user-1',
        email: 'qa-user-1@sploot.test',
        provider: 'qa-local',
        source: 'qa-local',
      },
    });
  });

  it('authenticates only a front-door proof signed for the observed loopback peer', async () => {
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1', secret: QA_ENV.SPLOOT_QA_AUTH_SECRET, expiresInSeconds: 60,
    });
    const proof = await createQaLocalProxyProof('localhost', '127.0.0.1', QA_ENV.SPLOOT_QA_AUTH_SECRET);
    const headers = new Headers({
      host: 'localhost:3474',
      [getQaLocalAuthHeader()]: token,
      'x-sploot-qa-proxy-proof': proof,
      'x-sploot-qa-remote-address': '10.0.0.2',
    });

    await expect(verifyQaLocalAuthHeaders(headers, QA_ENV)).resolves.toMatchObject({
      status: 'authenticated',
      principal: { userId: 'qa-user-1' },
    });
  });

  it('rejects malformed percent-encoded QA cookies without throwing', async () => {
    const result = await verifyQaLocalAuthHeaders(
      new Headers({ cookie: `${getQaLocalAuthCookieName()}=%E0%A4%A` }),
      QA_ENV,
    );
    expect(result).toMatchObject({ status: 'unauthenticated', reason: 'qa-local-invalid' });
  });

  it('bounds QA token schema, namespace, and lifetime', async () => {
    await expect(createQaLocalAuthToken({
      userId: 'not-qa-user',
      secret: QA_ENV.SPLOOT_QA_AUTH_SECRET,
    })).rejects.toThrow(/qa-user namespace/);
    await expect(createQaLocalAuthToken({
      userId: 'qa-user-1',
      secret: QA_ENV.SPLOOT_QA_AUTH_SECRET,
      expiresInSeconds: 8 * 60 * 60 + 1,
    })).rejects.toThrow(/out of bounds/);
  });

  it('rejects the QA seam in a production deployment', async () => {
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1', secret: QA_ENV.SPLOOT_QA_AUTH_SECRET, expiresInSeconds: 60,
    });
    const result = await verifyQaLocalAuthHeaders(qaRequest(token), {
      ...QA_ENV, NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'production', DEPLOYMENT_ENV: 'production',
    }, { host: 'localhost', remoteAddress: '127.0.0.1' });
    expect(result).toMatchObject({ status: 'forbidden', reason: 'qa-local-disabled' });
  });

  it('allows the explicit loopback QA proof in a production-built non-production deployment', async () => {
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1', secret: QA_ENV.SPLOOT_QA_AUTH_SECRET, expiresInSeconds: 60,
    });
    const result = await verifyQaLocalAuthHeaders(qaRequest(token), {
      ...QA_ENV, NODE_ENV: 'production',
    }, { host: 'localhost', remoteAddress: '127.0.0.1' });
    expect(result.status).toBe('authenticated');
  });

  it('fails closed for proof configuration drift', async () => {
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1', secret: QA_ENV.SPLOOT_QA_AUTH_SECRET, expiresInSeconds: 60,
    });
    for (const overrides of [
      { SPLOOT_QA_DEPLOYMENT_ID: undefined },
      { SPLOOT_QA_DEPLOYMENT_ID: 'prod' },
      { SPLOOT_QA_DEPLOYMENT_AUDIENCE: 'other' },
      { DEPLOYMENT_ENV: 'production' },
      { CLERK_SECRET_KEY: 'must-fail' },
    ]) {
      const result = await verifyQaLocalAuthHeaders(qaRequest(token), { ...QA_ENV, ...overrides }, { host: 'localhost', remoteAddress: '127.0.0.1' });
      expect(result.status).toBe('forbidden');
    }
    expect(validateQaProofConfig({
      ...QA_ENV, NODE_ENV: 'production', DEPLOYMENT_ENV: 'production',
    })).toEqual({ valid: false, reason: 'qa-evidence-forbidden-in-production' });
  });

  it('fails closed for non-loopback request proof', async () => {
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1', secret: QA_ENV.SPLOOT_QA_AUTH_SECRET, expiresInSeconds: 60,
    });
    expect(await verifyQaLocalAuthHeaders(qaRequest(token, 'example.com'), QA_ENV, { host: 'example.com', remoteAddress: '127.0.0.1' }))
      .toMatchObject({ status: 'forbidden', reason: 'qa-local-non-loopback' });
    expect(await verifyQaLocalAuthHeaders(qaRequest(token, 'localhost:3474', '10.0.0.2'), QA_ENV, { host: 'localhost', remoteAddress: '10.0.0.2' }))
      .toMatchObject({ status: 'forbidden', reason: 'qa-local-non-loopback' });
    expect(await verifyQaLocalAuthHeaders(new Headers({ [getQaLocalAuthHeader()]: token }), QA_ENV, { host: 'localhost' }))
      .toMatchObject({ status: 'forbidden', reason: 'qa-local-non-loopback' });
  });

  it('ignores a client-supplied remote address header', async () => {
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1', secret: QA_ENV.SPLOOT_QA_AUTH_SECRET, expiresInSeconds: 60,
    });
    expect(await verifyQaLocalAuthHeaders(qaRequest(token), QA_ENV))
      .toMatchObject({ status: 'forbidden', reason: 'qa-local-non-loopback' });
  });

  it('rejects a valid signature bound to another deployment or audience', async () => {
    const token = await createQaLocalAuthToken({
      userId: 'qa-user-1',
      deploymentId: 'other-deployment',
      audience: 'other-audience',
      secret: QA_ENV.SPLOOT_QA_AUTH_SECRET,
      expiresInSeconds: 60,
    });
    expect(await verifyQaLocalAuthHeaders(qaRequest(token), QA_ENV, { host: 'localhost', remoteAddress: '127.0.0.1' }))
      .toMatchObject({ status: 'unauthenticated', reason: 'qa-local-invalid' });
  });

  it('still accepts upload-token credentials when no QA credential is present', async () => {
    const result = await authenticateRequest(new Request('http://localhost:3000/api/upload', {
      headers: { authorization: 'Bearer splt_valid' },
    }) as never, { allowUploadToken: true, env: { NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'production' } });
    expect(result).toMatchObject({ status: 'authenticated' });
  });

  it('treats an invalid QA credential as terminal and never falls through to Clerk', async () => {
    clerkMock.verifyBearerOrThrow.mockResolvedValue('clerk-user');
    const proxyProof = await createQaLocalProxyProof('localhost', '127.0.0.1', QA_ENV.SPLOOT_QA_AUTH_SECRET);
    const result = await authenticateRequest(new Request('http://localhost:3000/api/cache/stats', {
      headers: {
        host: 'localhost:3000',
        [getQaLocalAuthHeader()]: 'not-a-valid-token',
        'x-sploot-qa-proxy-proof': proxyProof,
      },
    }) as never, { allowClerk: true, allowQaLocal: true, env: QA_ENV });
    expect(result).toMatchObject({ status: 'unauthenticated', reason: 'qa-local-invalid' });
    expect(clerkMock.verifyBearerOrThrow).not.toHaveBeenCalled();
  });

  it('does not throw or fall through when a synthetic QA request URL is malformed', async () => {
    clerkMock.verifyBearerOrThrow.mockResolvedValue('clerk-user');
    const proxyProof = await createQaLocalProxyProof('localhost', '127.0.0.1', QA_ENV.SPLOOT_QA_AUTH_SECRET);
    const request = {
      headers: new Headers({
        host: 'localhost:3000',
        [getQaLocalAuthHeader()]: 'not-a-valid-token',
        'x-sploot-qa-proxy-proof': proxyProof,
      }),
      url: 'not a URL',
    } as never;

    await expect(
      authenticateRequest(request, {
        allowClerk: true,
        allowQaLocal: true,
        env: QA_ENV,
      })
    ).resolves.toMatchObject({ status: 'unauthenticated', reason: 'qa-local-invalid' });
    expect(clerkMock.verifyBearerOrThrow).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The real scope falsifier. "Upload-only" is not proven by hitting routes that
 * can't reach the token branch — it is proven here: the branch is entered ONLY
 * when a route opts in with allowUploadToken, and the verifier is never even
 * called otherwise. Plus a guard that the second auth door (server.ts) stays
 * token-blind.
 */

const mocks = vi.hoisted(() => ({
  verifyUploadToken: vi.fn(),
}));

// Keep the real extractUploadToken / prefix; stub only the verifier so we can
// assert whether the branch was entered.
vi.mock('@/lib/auth/upload-token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/upload-token')>();
  return { ...actual, verifyUploadToken: mocks.verifyUploadToken };
});

import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/lib/auth/request-auth';

// Empty env → no Clerk config, so the ONLY path that can authenticate this
// request is the upload-token branch. If it stays unauthenticated, the branch
// did not fire.
const ENV_NO_CLERK: Record<string, string | undefined> = {};

function requestWithToken(): NextRequest {
  return new NextRequest('http://localhost:3000/api/anything', {
    headers: { authorization: 'Bearer splt_valid' },
  });
}

const VALID_PRINCIPAL = {
  userId: 'user_42',
  provider: 'upload-token' as const,
  providerSubject: 'user_42',
  source: 'upload-token' as const,
  credentialKind: 'upload-token' as const,
};

beforeEach(() => {
  mocks.verifyUploadToken.mockReset();
});

describe('upload-token scope is deny-by-default', () => {
  it('does NOT enter the token branch under the default policy', async () => {
    const result = await authenticateRequest(requestWithToken(), { env: ENV_NO_CLERK });

    expect(mocks.verifyUploadToken).not.toHaveBeenCalled();
    expect(result.status).toBe('unauthenticated');
  });

  it('does NOT enter the token branch when allowUploadToken is explicitly false', async () => {
    const result = await authenticateRequest(requestWithToken(), {
      allowUploadToken: false,
      env: ENV_NO_CLERK,
    });

    expect(mocks.verifyUploadToken).not.toHaveBeenCalled();
    expect(result.status).toBe('unauthenticated');
  });

  it('enters the branch and authenticates only when a route opts in', async () => {
    mocks.verifyUploadToken.mockResolvedValue(VALID_PRINCIPAL);

    const result = await authenticateRequest(requestWithToken(), {
      allowUploadToken: true,
      env: ENV_NO_CLERK,
    });

    expect(mocks.verifyUploadToken).toHaveBeenCalledWith('splt_valid');
    expect(result.status).toBe('authenticated');
  });

  it('rejects a bad token on an opted-in route without falling through to Clerk', async () => {
    mocks.verifyUploadToken.mockResolvedValue(null);

    const result = await authenticateRequest(requestWithToken(), {
      allowUploadToken: true,
      env: ENV_NO_CLERK,
    });

    expect(result.status).toBe('unauthenticated');
    if (result.status === 'unauthenticated') {
      expect(result.reason).toBe('upload-token-invalid');
    }
  });
});

describe('the second auth door stays token-blind', () => {
  it('lib/auth/server.ts contains no upload-token reference', () => {
    // Tests run with cwd = apps/web (pnpm --filter web test).
    const serverPath = resolve(process.cwd(), 'lib/auth/server.ts');
    const source = readFileSync(serverPath, 'utf8');
    expect(source).not.toMatch(/splt_|upload-token|allowUploadToken|verifyUploadToken/);
  });
});

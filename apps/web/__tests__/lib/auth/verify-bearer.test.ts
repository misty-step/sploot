import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const authenticateRequest = vi.fn();
const createClerkClient = vi.fn(() => ({ authenticateRequest }));

vi.mock('@clerk/backend', () => ({
  createClerkClient,
}));

describe('verifyBearerOrThrow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.CLERK_AUTHORIZED_PARTIES;
    process.env.CLERK_SECRET_KEY = 'sk_test_mock';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_mock';
    authenticateRequest.mockResolvedValue({
      isSignedIn: true,
      toAuth: async () => ({ userId: 'user_123' }),
    });
  });

  it('passes default web, extension, and local QA authorized parties to Clerk', async () => {
    const { verifyBearerOrThrow } = await import('@/lib/auth/verify-bearer');

    await expect(
      verifyBearerOrThrow(new NextRequest('http://localhost:3001/api/upload'))
    ).resolves.toBe('user_123');

    expect(createClerkClient).toHaveBeenCalledWith({
      secretKey: 'sk_test_mock',
      publishableKey: 'pk_test_mock',
    });
    expect(authenticateRequest).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        authorizedParties: expect.arrayContaining([
          'https://sploot.app',
          'https://www.sploot.app',
          'chrome-extension://ipnlamdcakhmbidjlpoinkgimfapejna',
          'http://localhost:3000',
          'http://localhost:3001',
        ]),
        acceptsToken: 'session_token',
      })
    );
  });

  it('adds configured extension origins without dropping defaults', async () => {
    process.env.CLERK_AUTHORIZED_PARTIES = [
      'chrome-extension://devextensionid',
      'https://staging.sploot.app',
    ].join(',');
    const { getClerkAuthorizedParties } = await import('@/lib/auth/verify-bearer');

    expect(getClerkAuthorizedParties()).toEqual(expect.arrayContaining([
      'https://sploot.app',
      'chrome-extension://ipnlamdcakhmbidjlpoinkgimfapejna',
      'chrome-extension://devextensionid',
      'https://staging.sploot.app',
    ]));
  });

  it('throws unauthorized when Clerk rejects the request origin or token', async () => {
    authenticateRequest.mockResolvedValue({
      isSignedIn: false,
      toAuth: async () => ({ userId: null }),
    });
    const { verifyBearerOrThrow } = await import('@/lib/auth/verify-bearer');

    await expect(
      verifyBearerOrThrow(new NextRequest('http://localhost:3001/api/upload'))
    ).rejects.toThrow('Unauthorized');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  syncUser: vi.fn(),
  findUnique: vi.fn(),
  execute: vi.fn((work: () => Promise<unknown>) => work()),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
  syncUser: mocks.syncUser,
}));
vi.mock('@/lib/circuit-breaker', () => ({
  getUserSyncCircuitBreaker: () => ({ execute: mocks.execute }),
}));
vi.mock('@/lib/observability-logger', () => ({
  logger: { logError: mocks.logError, logInfo: mocks.logInfo },
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}));

import { getAuth, getAuthWithUser } from '@/lib/auth/server';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  // Restore env so each test's build-flag state is isolated.
  process.env = { ...ORIGINAL_ENV };
  // vitest.setup.ts inlines this to 'true'; restore it so tests that need the
  // production omission path can stub it to 'false' explicitly.
  process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD = 'true';
  vi.clearAllMocks();
});

describe('public-truth signed-out auth short-circuit', () => {
  it('getAuth returns null userId without calling Clerk in a compiled public-truth build', async () => {
    process.env.NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E = 'true';
    process.env.SPLOOT_DEPLOYMENT_ENV = 'evidence';
    process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD = 'false';

    const result = await getAuth();

    expect(result.userId).toBeNull();
    expect(result.sessionId).toBeNull();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('getAuthWithUser returns skipped sync without calling Clerk in a compiled public-truth build', async () => {
    process.env.NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E = 'true';
    process.env.SPLOOT_DEPLOYMENT_ENV = 'evidence';
    process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD = 'false';

    const result = await getAuthWithUser();

    expect(result.userId).toBeNull();
    expect(result.sessionId).toBeNull();
    expect(result.syncStatus).toBe('skipped');
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(mocks.syncUser).not.toHaveBeenCalled();
    expect(mocks.logError).not.toHaveBeenCalled();
  });
});

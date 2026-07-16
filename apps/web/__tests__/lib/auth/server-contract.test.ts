import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  syncUser: vi.fn(),
  findUnique: vi.fn(),
  execute: vi.fn((work: () => Promise<unknown>) => work()),
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
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}));

import { getAuthWithUser } from '@/lib/auth/server';
import { EnrollmentUnavailableError } from '@/lib/enrollment/enrollment-policy';

describe('shared Clerk sync contract', () => {
  beforeEach(() => {
    // This file exercises the Clerk contract directly; keep the global QA-build
    // fixture from routing the call into the terminal signed-out seam.
    vi.stubEnv('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD', 'false');
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      userId: 'clerk-subject',
      sessionId: 'session-1',
      getToken: vi.fn(),
    });
    mocks.currentUser.mockResolvedValue({
      id: 'clerk-subject',
      emailAddresses: [{ emailAddress: 'user@example.test' }],
    });
    mocks.findUnique.mockResolvedValue({ id: 'clerk-subject' });
  });

  it('rejects a Clerk subject mismatch before email or migration work', async () => {
    mocks.currentUser.mockResolvedValue({
      id: 'different-subject',
      emailAddresses: [{ emailAddress: 'user@example.test' }],
    });

    await expect(getAuthWithUser()).rejects.toMatchObject({ message: 'Unauthorized - Clerk subject mismatch' });
    expect(mocks.syncUser).not.toHaveBeenCalled();
  });

  it('preserves missing identity/schema failures as enrollment_unavailable', async () => {
    mocks.syncUser.mockRejectedValue(new EnrollmentUnavailableError());

    await expect(getAuthWithUser()).resolves.toMatchObject({
      userId: null,
      syncStatus: 'unavailable',
      syncError: 'enrollment_unavailable',
    });
  });
});

import { describe, expect, it } from 'vitest';

import { shouldOmitClerkProvider } from '@/lib/auth/client';

describe('client auth provider scope', () => {
  it('keeps Clerk mounted for protected and auth routes in public-truth builds', () => {
    const publicTruth = { publicTruthE2E: true, qaAuthBuild: false };

    expect(shouldOmitClerkProvider('/app', publicTruth)).toBe(false);
    expect(shouldOmitClerkProvider('/app/settings', publicTruth)).toBe(false);
    expect(shouldOmitClerkProvider('/sign-in', publicTruth)).toBe(false);
    expect(shouldOmitClerkProvider('/sign-up', publicTruth)).toBe(false);
    expect(shouldOmitClerkProvider(null, publicTruth)).toBe(false);
  });

  it('omits Clerk only on concrete public routes for provider-independent builds', () => {
    expect(shouldOmitClerkProvider('/', { publicTruthE2E: true, qaAuthBuild: false })).toBe(true);
    expect(shouldOmitClerkProvider('/help', { publicTruthE2E: false, qaAuthBuild: true })).toBe(true);
    expect(shouldOmitClerkProvider('/app', { publicTruthE2E: false, qaAuthBuild: true })).toBe(false);
    expect(shouldOmitClerkProvider('/', { publicTruthE2E: false, qaAuthBuild: false })).toBe(false);
  });
});

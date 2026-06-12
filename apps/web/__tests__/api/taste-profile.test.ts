import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticatedUserId: 'user-123',
  getTasteProfile: vi.fn(),
}));

vi.mock('@/lib/auth/with-authenticated-api', () => ({
  withAuthenticatedApi: (handler: any) => async (req: any, context: any = {}) => {
    if (!mocks.authenticatedUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    return handler(req, context, {
      principal: { userId: mocks.authenticatedUserId },
      auth: { status: 'authenticated' },
    });
  },
}));

vi.mock('@/lib/taste/taste-engine', () => ({
  getTasteProfile: mocks.getTasteProfile,
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

import { GET } from '@/app/api/taste/profile/route';

function request() {
  return new NextRequest('http://localhost:3000/api/taste/profile');
}

describe('GET /api/taste/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatedUserId = 'user-123';
    mocks.getTasteProfile.mockResolvedValue({
      status: 'ready',
      bangerCount: 4,
      embeddedBangerCount: 3,
      label: 'near your bangers',
      summary: 'sploot is comparing 3 embedded bangers against the rest of your library.',
      representativeAssets: [
        {
          id: 'asset-1',
          blobUrl: 'https://blob.test/a.png',
          pathname: 'a.png',
          mime: 'image/png',
          favorite: true,
          tasteScore: 0.91,
        },
      ],
    });
  });

  it('returns the authenticated user taste profile', async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ready',
      embeddedBangerCount: 3,
      label: 'near your bangers',
    });
    expect(mocks.getTasteProfile).toHaveBeenCalledWith('user-123');
  });

  it('keeps the unauthorized JSON contract stable', async () => {
    mocks.authenticatedUserId = '';

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(mocks.getTasteProfile).not.toHaveBeenCalled();
  });
});

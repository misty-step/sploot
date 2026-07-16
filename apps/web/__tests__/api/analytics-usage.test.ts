import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    asset: {
      count: mocks.count,
      findMany: mocks.findMany,
    },
  },
}));

vi.mock('@/lib/auth/with-authenticated-api', () => ({
  withAuthenticatedApi: (handler: any) => (req: any, context: any = {}) => handler(req, context, {
    principal: { userId: 'analytics-user' },
    auth: { status: 'authenticated' },
  }),
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

import { GET } from '@/app/api/analytics/usage/route';

describe('GET /api/analytics/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockResolvedValueOnce(1).mockResolvedValueOnce(3).mockResolvedValueOnce(7);
    mocks.findMany.mockResolvedValue([]);
  });

  it('returns operational upload telemetry without inventing observed spend', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/analytics/usage'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      uploadsLastHour: 1,
      uploadsLastDay: 3,
      uploadsLast7Days: 7,
      isSustainedHighRate: false,
    });
    expect(body).not.toHaveProperty('estimatedCost');
    expect(JSON.stringify(body)).not.toContain('0.00022');
  });
});

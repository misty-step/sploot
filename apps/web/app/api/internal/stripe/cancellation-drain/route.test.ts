import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { disconnect, drain, hasUnresolvedDeliveries } = vi.hoisted(() => ({ disconnect: vi.fn(), drain: vi.fn(), hasUnresolvedDeliveries: vi.fn() }));

vi.mock('@/lib/with-observability', () => ({ withObservability: (handler: unknown) => handler }));
vi.mock('@/lib/billing/stripe-alert-delivery', () => ({ createProductionStripeAlertAdapters: vi.fn(() => ({ circuit: { open: vi.fn() }, page: { page: vi.fn() } })) }));
vi.mock('@/lib/billing/stripe-cancellation-ledger', () => ({ PrismaStripeCancellationLedger: class {} }));
vi.mock('@/lib/billing/stripe-cancellation-monitor', () => ({ SubscriptionCancellationMonitor: class { drain = drain; hasUnresolvedDeliveries = hasUnresolvedDeliveries; } }));
vi.mock('@prisma/client', () => ({ PrismaClient: class { $disconnect = disconnect; } }));

import { POST } from './route';

describe('scheduled cancellation drain route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_CANCELLATION_DRAIN_TOKEN = 'drain-secret';
    process.env.STRIPE_LEDGER_CONSUMER_DATABASE_URL = 'postgresql://consumer.test/db';
  });

  it('requires the authenticated scheduler', async () => {
    const response = await POST(new NextRequest('http://localhost/internal', { method: 'POST' }), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
    expect(drain).not.toHaveBeenCalled();
  });

  it('drains through the consumer authority and reports failures truthfully', async () => {
    drain.mockResolvedValue([{ status: 'succeeded' }, { status: 'failed' }]);
    hasUnresolvedDeliveries.mockResolvedValue(false);
    const response = await POST(new NextRequest('http://localhost/internal', { method: 'POST', headers: { authorization: 'Bearer drain-secret' } }), { params: Promise.resolve({}) });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ drained: 2, failed: 1, unresolved: false });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('reports unresolved dead letters as unhealthy even when nothing new drains', async () => {
    drain.mockResolvedValue([]);
    hasUnresolvedDeliveries.mockResolvedValue(true);
    const response = await POST(new NextRequest('http://localhost/internal', { method: 'POST', headers: { authorization: 'Bearer drain-secret' } }), { params: Promise.resolve({}) });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ drained: 0, failed: 0, unresolved: true });
  });
});

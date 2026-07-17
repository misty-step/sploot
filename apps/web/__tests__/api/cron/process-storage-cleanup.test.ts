import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockHeaders = vi.fn();
const mockProcess = vi.fn();
const mockPrisma = {};
vi.mock('next/headers', () => ({ headers: () => mockHeaders() }));
vi.mock('@/lib/with-observability', () => ({ withObservability: (handler: unknown) => handler }));
vi.mock('@/lib/db', () => ({ get prisma() { return mockPrisma; } }));
vi.mock('@/lib/storage/cleanup-outbox', () => ({ processStorageCleanup: (...args: unknown[]) => mockProcess(...args) }));

import { GET } from '@/app/api/cron/process-storage-cleanup/route';

describe('/api/cron/process-storage-cleanup', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-test';
    vi.clearAllMocks();
    mockHeaders.mockReturnValue({ get: (name: string) => name === 'authorization' ? 'Bearer cron-test' : null });
    mockProcess.mockResolvedValue({ processed: 1, succeeded: 1, failed: 0, retrying: 0, failures: [] });
  });
  afterEach(() => { delete process.env.CRON_SECRET; });

  it('requires CRON_SECRET authentication', async () => {
    mockHeaders.mockReturnValue({ get: () => 'Bearer wrong' });
    const response = await GET(new NextRequest('https://sploot.example.test/api/cron/process-storage-cleanup'));
    expect(response.status).toBe(401);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it('processes a bounded scheduled batch and exposes retry evidence', async () => {
    mockProcess.mockResolvedValue({ processed: 2, succeeded: 1, failed: 1, retrying: 1, failures: [{ id: 'outbox-1', provider: 'vercel', error: 'temporary outage' }] });
    const response = await GET(new NextRequest('https://sploot.example.test/api/cron/process-storage-cleanup?limit=2'));
    expect(response.status).toBe(200);
    expect(mockProcess).toHaveBeenCalledWith(mockPrisma, 2);
    await expect(response.json()).resolves.toMatchObject({ processed: 2, failed: 1, retrying: 1 });
  });
});

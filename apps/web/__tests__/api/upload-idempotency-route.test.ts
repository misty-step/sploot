import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  ingestImage: vi.fn(),
  receipts: new Map<string, unknown>(),
  runIdempotentUpload: vi.fn(async (_userId: string, key: string, execute: () => Promise<unknown>) => {
    if (mocks.receipts.has(key)) return mocks.receipts.get(key);
    const result = await execute();
    mocks.receipts.set(key, result);
    return result;
  }),
}));

vi.mock('next/navigation', () => ({ unstable_rethrow: vi.fn() }));
vi.mock('@/lib/auth/with-authenticated-api', () => ({
  withAuthenticatedApi: (handler: any) => (req: NextRequest, context: any) => handler(req, context, { principal: { userId: 'u1' } }),
}));
vi.mock('@/lib/auth/api', () => ({ isUnauthorizedAuthError: () => false, unauthorizedResponse: () => Response.json({ error: 'Unauthorized' }, { status: 401 }) }));
vi.mock('@/lib/env', () => ({ blobConfigured: true, databaseConfigured: true }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/with-observability', () => ({ withObservability: (handler: any) => handler }));
vi.mock('@/lib/runtime-gates', () => ({ getRuntimeGate: () => ({ enabled: true }), runtimeGateResponse: vi.fn() }));
vi.mock('@/lib/enrollment/enrollment-policy', () => ({
  assertEnrolledUser: vi.fn(),
  enrollmentDeniedResponse: vi.fn(),
  enrollmentUnavailableResponse: vi.fn(),
  isEnrollmentDeniedError: () => false,
  isEnrollmentUnavailableError: () => false,
}));
vi.mock('@/lib/quota/storage-quota-policy', () => ({ StorageQuotaExceededError: class extends Error {}, storageQuotaError: vi.fn() }));
vi.mock('@/lib/upload/ingest-image', () => ({ ingestImage: mocks.ingestImage }));
vi.mock('@/lib/upload/upload-idempotency', () => ({ runIdempotentUpload: mocks.runIdempotentUpload, UploadIdempotencyInProgressError: class extends Error {}, UploadIdempotencyLeaseLostError: class extends Error {} }));
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { POST } from '@/app/api/upload/route';

function request(key: string): NextRequest {
  const form = new FormData();
  form.append('file', new File(['bytes'], 'meme.png', { type: 'image/png' }));
  return new NextRequest('http://localhost:3000/api/upload', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: form,
  });
}

describe('POST /api/upload idempotent HTTP mapping', () => {
  beforeEach(() => {
    mocks.ingestImage.mockReset();
    mocks.receipts.clear();
  });

  it.each([
    [{ kind: 'created', asset: { id: 'a1' } }, 201],
    [{ kind: 'duplicate', asset: { id: 'a1' } }, 409],
    [{ kind: 'invalid', error: { userMessage: 'bad file', statusCode: 415 } }, 415],
  ] as const)('replays identical %s response semantics', async (result, expectedStatus) => {
    mocks.ingestImage.mockResolvedValue(result);
    const first = await POST(request(`route-${expectedStatus}`), {} as any);
    const replay = await POST(request(`route-${expectedStatus}`), {} as any);

    expect(first.status).toBe(expectedStatus);
    expect(replay.status).toBe(expectedStatus);
    expect(await replay.json()).toEqual(await first.json());
    expect(mocks.ingestImage).toHaveBeenCalledTimes(1);
  });
});

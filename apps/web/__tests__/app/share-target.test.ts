import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyBearerOrThrow: vi.fn(),
  currentUser: vi.fn(),
  syncUser: vi.fn(),
  ingestImage: vi.fn(),
  uploadGateEnabled: true,
}));

vi.mock('@/lib/auth/verify-bearer', () => ({
  verifyBearerOrThrow: mocks.verifyBearerOrThrow,
}));

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: mocks.currentUser,
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
  syncUser: mocks.syncUser,
}));

vi.mock('@/lib/circuit-breaker', () => ({
  getUserSyncCircuitBreaker: () => ({
    execute: (operation: () => Promise<void>) => operation(),
  }),
}));

vi.mock('@/lib/upload/ingest-image', () => ({
  ingestImage: mocks.ingestImage,
}));

vi.mock('@/lib/runtime-gates', () => ({
  getRuntimeGate: () => ({
    name: 'uploads',
    enabled: mocks.uploadGateEnabled,
    code: 'uploads_disabled',
    message: 'Uploads are temporarily paused',
  }),
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST, GET } from '@/app/share-target/route';

const BASE = 'http://localhost:3000';

function authed(userId = 'qa-design-user') {
  mocks.verifyBearerOrThrow.mockResolvedValue(userId);
  mocks.currentUser.mockResolvedValue({
    id: userId,
    emailAddresses: [{ emailAddress: `${userId}@sploot.test` }],
  });
  mocks.syncUser.mockResolvedValue(undefined);
}

function shareRequest(files: File[]): NextRequest {
  const formData = new FormData();
  for (const file of files) {
    formData.append('images', file);
  }
  return new NextRequest(`${BASE}/share-target`, {
    method: 'POST',
    body: formData,
  });
}

function pngFile(name = 'shared.png'): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uploadGateEnabled = true;
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_share_target');
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_share_target');
  vi.stubEnv('SPLOOT_QA_AUTH_MODE', 'disabled');
  authed();
});

describe('POST /share-target', () => {
  it('redirects unauthenticated shares to sign-in', async () => {
    mocks.verifyBearerOrThrow.mockRejectedValue(new Error('Unauthorized'));

    const response = await POST(shareRequest([pngFile()]));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      `${BASE}/sign-in?redirect_url=%2Fshare-target`
    );
    expect(mocks.ingestImage).not.toHaveBeenCalled();
  });

  it('keeps the sign-in destination internal when a share query is attacker-controlled', async () => {
    mocks.verifyBearerOrThrow.mockRejectedValue(new Error('Unauthorized'));

    const response = await POST(new NextRequest(
      `${BASE}/share-target?redirect_url=https%3A%2F%2Fevil.example`,
      { method: 'POST', body: new FormData() }
    ));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe(BASE);
    expect(location.pathname).toBe('/sign-in');
    expect(location.searchParams.get('redirect_url')).toBe('/share-target');
  });

  it('ingests each shared image and redirects to the library with counts', async () => {
    authed();
    mocks.ingestImage
      .mockResolvedValueOnce({ kind: 'created', asset: { id: 'a1' } })
      .mockResolvedValueOnce({ kind: 'duplicate', asset: { id: 'a2' } });

    const response = await POST(shareRequest([pngFile('one.png'), pngFile('two.png')]));

    expect(mocks.ingestImage).toHaveBeenCalledTimes(2);
    expect(mocks.ingestImage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'qa-design-user' })
    );
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/app');
    expect(location.searchParams.get('shared')).toBe('1');
    expect(location.searchParams.get('duplicates')).toBe('1');
  });

  it('counts invalid files as failed without aborting the batch', async () => {
    authed();
    mocks.ingestImage
      .mockResolvedValueOnce({ kind: 'invalid', error: { userMessage: 'bad', statusCode: 400 } })
      .mockResolvedValueOnce({ kind: 'created', asset: { id: 'a1' } });

    const response = await POST(shareRequest([pngFile('bad.bin'), pngFile('good.png')]));

    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('shared')).toBe('1');
    expect(location.searchParams.get('failed')).toBe('1');
  });

  it('redirects with no counts when the share contains no files', async () => {
    authed();

    const response = await POST(shareRequest([]));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/app');
    expect(mocks.ingestImage).not.toHaveBeenCalled();
  });

  it('redirects without ingesting when uploads are gated off', async () => {
    authed();
    mocks.uploadGateEnabled = false;

    const response = await POST(shareRequest([pngFile()]));

    expect(response.status).toBe(303);
    expect(mocks.ingestImage).not.toHaveBeenCalled();
  });

  it('returns typed 503 instead of redirecting a sync outage to sign-in', async () => {
    mocks.syncUser.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(shareRequest([pngFile()]));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication temporarily unavailable',
      code: 'sync_unavailable',
      retryable: true,
    });
    expect(mocks.ingestImage).not.toHaveBeenCalled();
  });
});

describe('GET /share-target', () => {
  it('redirects direct navigation to the library', async () => {
    const response = await GET(new NextRequest(`${BASE}/share-target`));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/app');
  });
});

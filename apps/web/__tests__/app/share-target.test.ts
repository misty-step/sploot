import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  ingestImage: vi.fn(),
  userFindUnique: vi.fn(),
  uploadGateEnabled: true,
}));

vi.mock('@/lib/auth/request-auth', () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock('@/lib/upload/ingest-image', () => ({
  ingestImage: mocks.ingestImage,
}));

vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
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
  mocks.authenticateRequest.mockResolvedValue({
    status: 'authenticated',
    principal: { userId },
  });
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
  mocks.userFindUnique.mockResolvedValue({ id: 'qa-design-user' });
});

describe('POST /share-target', () => {
  it('redirects unauthenticated shares to sign-in', async () => {
    mocks.authenticateRequest.mockResolvedValue({ status: 'unauthenticated', reason: 'x' });

    const response = await POST(shareRequest([pngFile()]));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${BASE}/sign-in`);
    expect(mocks.ingestImage).not.toHaveBeenCalled();
  });

  it('redirects auth-provider unavailability to the typed enrollment state', async () => {
    mocks.authenticateRequest.mockResolvedValue({
      status: 'unavailable',
      reason: 'enrollment_unavailable',
    });

    const response = await POST(shareRequest([pngFile()]));

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get('location')!).search).toBe('?enrollment=unavailable');
    expect(mocks.ingestImage).not.toHaveBeenCalled();
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

  it('redirects denied users before consuming multipart data', async () => {
    authed();
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await POST(shareRequest([pngFile()]));

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get('location')!).search).toBe('?enrollment=closed');
    expect(mocks.ingestImage).not.toHaveBeenCalled();
  });

  it('keeps unavailable enrollment distinct from denial', async () => {
    authed();
    mocks.userFindUnique.mockRejectedValue(new Error('database down'));

    const response = await POST(shareRequest([pngFile()]));

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get('location')!).search).toBe('?enrollment=unavailable');
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

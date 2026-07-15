import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  validateImportUrl: vi.fn(),
  fetchRemoteImage: vi.fn(),
  ingestImage: vi.fn(),
  userFindUnique: vi.fn(),
  uploadGateEnabled: true,
}));

vi.mock('@/lib/auth/request-auth', () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock('@/lib/upload/url-import', () => ({
  validateImportUrl: mocks.validateImportUrl,
  fetchRemoteImage: mocks.fetchRemoteImage,
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
  runtimeGateResponse: () =>
    Response.json({ error: 'Uploads are temporarily paused' }, { status: 503 }),
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '@/app/api/upload/url/route';

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/upload/url', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function authed() {
  mocks.authenticateRequest.mockResolvedValue({
    status: 'authenticated',
    principal: { userId: 'qa-design-user' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uploadGateEnabled = true;
  mocks.userFindUnique.mockResolvedValue({ id: 'qa-design-user' });
});

describe('POST /api/upload/url', () => {
  it('returns the stable 401 contract when unauthenticated', async () => {
    mocks.authenticateRequest.mockResolvedValue({ status: 'unauthenticated', reason: 'x' });

    const response = await POST(request({ url: 'https://example.com/a.png' }), {} as any);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects an invalid or private URL with 400', async () => {
    authed();
    mocks.validateImportUrl.mockReturnValue({ ok: false, reason: 'private host' });

    const response = await POST(request({ url: 'http://localhost/x.png' }), {} as any);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.fetchRemoteImage).not.toHaveBeenCalled();
  });

  it('returns 422 when the remote fetch fails', async () => {
    authed();
    mocks.validateImportUrl.mockReturnValue({ ok: true, url: new URL('https://x.com/a.png') });
    mocks.fetchRemoteImage.mockResolvedValue({ ok: false, reason: 'not an image' });

    const response = await POST(request({ url: 'https://x.com/a.png' }), {} as any);

    expect(response.status).toBe(422);
    expect(mocks.ingestImage).not.toHaveBeenCalled();
  });

  it('returns the real enrollment denial before fetching remote bytes', async () => {
    authed();
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.validateImportUrl.mockReturnValue({ ok: true, url: new URL('https://x.com/a.png') });

    const response = await POST(request({ url: 'https://x.com/a.png' }), {} as any);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'enrollment_closed' });
    expect(mocks.fetchRemoteImage).not.toHaveBeenCalled();
  });

  it('ingests the fetched image and returns 201 with the asset', async () => {
    authed();
    const file = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    mocks.validateImportUrl.mockReturnValue({ ok: true, url: new URL('https://x.com/a.png') });
    mocks.fetchRemoteImage.mockResolvedValue({ ok: true, file });
    mocks.ingestImage.mockResolvedValue({ kind: 'created', asset: { id: 'a1' } });

    const response = await POST(request({ url: 'https://x.com/a.png' }), {} as any);

    expect(mocks.ingestImage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'qa-design-user', file })
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, isDuplicate: false });
  });

  it('returns 409 for duplicates', async () => {
    authed();
    mocks.validateImportUrl.mockReturnValue({ ok: true, url: new URL('https://x.com/a.png') });
    mocks.fetchRemoteImage.mockResolvedValue({
      ok: true,
      file: new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }),
    });
    mocks.ingestImage.mockResolvedValue({ kind: 'duplicate', asset: { id: 'a1' } });

    const response = await POST(request({ url: 'https://x.com/a.png' }), {} as any);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: true, isDuplicate: true });
  });

  it('returns 400 when the body has no url', async () => {
    authed();

    const response = await POST(request({}), {} as any);

    expect(response.status).toBe(400);
  });

  it('returns 503 when uploads are gated off', async () => {
    authed();
    mocks.uploadGateEnabled = false;

    const response = await POST(request({ url: 'https://x.com/a.png' }), {} as any);

    expect(response.status).toBe(503);
  });
});

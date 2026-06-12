import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticatedUserId: 'user-1',
  createPersonalUploadToken: vi.fn(),
  listPersonalUploadTokens: vi.fn(),
  revokePersonalUploadToken: vi.fn(),
}));

vi.mock('@/lib/auth/with-authenticated-api', () => ({
  withAuthenticatedApi: (handler: any) => async (req: any, context: any = {}) => {
    if (!mocks.authenticatedUserId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handler(req, context, {
      principal: { userId: mocks.authenticatedUserId },
      auth: { status: 'authenticated' },
    });
  },
}));

vi.mock('@/lib/auth/personal-upload-token', () => ({
  createPersonalUploadToken: mocks.createPersonalUploadToken,
  listPersonalUploadTokens: mocks.listPersonalUploadTokens,
  revokePersonalUploadToken: mocks.revokePersonalUploadToken,
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

vi.mock('@/lib/vercel-logger', () => ({
  logError: vi.fn(),
}));

import { GET, POST } from '@/app/api/upload-tokens/route';
import { DELETE } from '@/app/api/upload-tokens/[id]/route';

function request(path: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'content-type': 'application/json' } : undefined,
  });
}

describe('upload token API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatedUserId = 'user-1';
    mocks.listPersonalUploadTokens.mockResolvedValue([]);
    mocks.createPersonalUploadToken.mockResolvedValue({
      token: 'sploot_upload_secret',
      record: {
        id: 'token-1',
        name: 'Save to Sploot Shortcut',
        createdAt: '2026-06-12T00:00:00.000Z',
        lastUsedAt: null,
        revokedAt: null,
      },
    });
    mocks.revokePersonalUploadToken.mockResolvedValue(true);
  });

  it('lists token summaries without secrets', async () => {
    mocks.listPersonalUploadTokens.mockResolvedValue([
      {
        id: 'token-1',
        name: 'Save to Sploot Shortcut',
        createdAt: '2026-06-12T00:00:00.000Z',
        lastUsedAt: null,
        revokedAt: null,
      },
    ]);

    const response = await GET(request('/api/upload-tokens'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tokens[0]).not.toHaveProperty('token');
    expect(body.tokens[0]).not.toHaveProperty('tokenHash');
    expect(mocks.listPersonalUploadTokens).toHaveBeenCalledWith('user-1');
  });

  it('mints a token and returns the secret exactly once', async () => {
    const response = await POST(request('/api/upload-tokens', {
      name: 'iPhone share sheet',
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.token).toBe('sploot_upload_secret');
    expect(body.record.id).toBe('token-1');
    expect(mocks.createPersonalUploadToken).toHaveBeenCalledWith('user-1', 'iPhone share sheet');
  });

  it('revokes only the authenticated user token', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost:3000/api/upload-tokens/token-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'token-1' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ revoked: true });
    expect(mocks.revokePersonalUploadToken).toHaveBeenCalledWith('user-1', 'token-1');
  });

  it('returns the stable auth contract when unauthenticated', async () => {
    mocks.authenticatedUserId = '';

    const response = await GET(request('/api/upload-tokens'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});

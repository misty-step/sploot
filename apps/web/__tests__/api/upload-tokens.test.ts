import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  mintUploadToken: vi.fn(),
  userFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/auth/request-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: mocks.transaction,
    user: { findUnique: mocks.userFindUnique },
    uploadToken: {
      findMany: mocks.findMany,
      count: mocks.count,
      create: mocks.create,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock('@/lib/auth/upload-token', () => ({ mintUploadToken: mocks.mintUploadToken }));

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/upload-tokens/route';
import { DELETE } from '@/app/api/upload-tokens/[id]/route';

const USER = 'user_1';

function authed() {
  mocks.authenticateRequest.mockResolvedValue({
    status: 'authenticated',
    principal: { userId: USER },
    syncStatus: 'skipped',
  });
}

function unauthed() {
  mocks.authenticateRequest.mockResolvedValue({ status: 'unauthenticated', reason: 'x' });
}

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/upload-tokens', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function getReq(): NextRequest {
  return new NextRequest('http://localhost:3000/api/upload-tokens');
}

function deleteReq(): NextRequest {
  return new NextRequest('http://localhost:3000/api/upload-tokens/tok_1', { method: 'DELETE' });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as any;

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  mocks.userFindUnique.mockResolvedValue({ id: USER });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    $executeRaw: vi.fn().mockResolvedValue(0),
    user: { findUnique: mocks.userFindUnique },
    uploadToken: {
      count: mocks.count,
      create: mocks.create,
      updateMany: mocks.updateMany,
    },
  }));
});

describe('POST /api/upload-tokens (mint)', () => {
  it('returns the plaintext token exactly once and persists only the hash', async () => {
    authed();
    mocks.count.mockResolvedValue(0);
    mocks.mintUploadToken.mockResolvedValue({
      token: 'splt_PLAINTEXT_ONCE',
      prefix: 'splt_abc123',
      tokenHash: 'a'.repeat(64),
    });
    mocks.create.mockResolvedValue({
      id: 'tok_1',
      name: 'phone',
      prefix: 'splt_abc123',
      createdAt: new Date('2026-06-18T00:00:00Z'),
    });

    const res = await POST(postReq({ name: 'phone' }), {} as any);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.token).toBe('splt_PLAINTEXT_ONCE');

    // Persists hash + prefix, NEVER the plaintext.
    const createArg = mocks.create.mock.calls[0][0];
    expect(createArg.data.tokenHash).toBe('a'.repeat(64));
    expect(createArg.data.prefix).toBe('splt_abc123');
    expect(JSON.stringify(createArg.data)).not.toContain('splt_PLAINTEXT_ONCE');
  });

  it('rejects a missing/blank name with 400', async () => {
    authed();
    const res = await POST(postReq({ name: '   ' }), {} as any);
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('enforces the active-token cap with 422', async () => {
    authed();
    mocks.count.mockResolvedValue(10);
    const res = await POST(postReq({ name: 'eleventh' }), {} as any);
    expect(res.status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    unauthed();
    const res = await POST(postReq({ name: 'phone' }), {} as any);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });
});

describe('GET /api/upload-tokens (list)', () => {
  it('lists metadata and never selects the secret hash or plaintext', async () => {
    authed();
    mocks.findMany.mockResolvedValue([
      { id: 'tok_1', name: 'phone', prefix: 'splt_abc123', lastUsedAt: null, createdAt: new Date() },
    ]);

    const res = await GET(getReq(), {} as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tokens).toHaveLength(1);
    expect(body.tokens[0]).not.toHaveProperty('tokenHash');

    // The query must be scoped to the caller and exclude the hash.
    const findArg = mocks.findMany.mock.calls[0][0];
    expect(findArg.where).toEqual({ userId: USER, revokedAt: null });
    expect(findArg.select.tokenHash).toBeUndefined();
  });

  it('returns 401 when unauthenticated', async () => {
    unauthed();
    const res = await GET(getReq(), {} as any);
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/upload-tokens/[id] (revoke)', () => {
  it('soft-revokes only the caller\'s own un-revoked token', async () => {
    authed();
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const res = await DELETE(deleteReq(), ctx('tok_1'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const arg = mocks.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'tok_1', userId: USER, revokedAt: null });
    expect(arg.data.revokedAt).toBeInstanceOf(Date);
  });

  it('is idempotent: revoking a missing/already-revoked token still succeeds', async () => {
    authed();
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const res = await DELETE(deleteReq(), ctx('tok_gone'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('returns 401 when unauthenticated', async () => {
    unauthed();
    const res = await DELETE(deleteReq(), ctx('tok_1'));
    expect(res.status).toBe(401);
  });
});

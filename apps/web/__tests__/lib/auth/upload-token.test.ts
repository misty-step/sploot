import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    uploadToken: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock('@/lib/observability-logger', () => ({
  logger: { logError: vi.fn(), logInfo: vi.fn(), logTiming: vi.fn() },
}));

import {
  mintUploadToken,
  extractUploadToken,
  hashUploadToken,
  verifyUploadToken,
  UPLOAD_TOKEN_PREFIX,
} from '@/lib/auth/upload-token';

beforeEach(() => {
  mocks.findFirst.mockReset();
  mocks.updateMany.mockReset();
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe('mintUploadToken', () => {
  it('produces a splt_-prefixed token whose hash matches and a non-secret prefix', async () => {
    const minted = await mintUploadToken();
    expect(minted.token.startsWith(UPLOAD_TOKEN_PREFIX)).toBe(true);
    expect(minted.prefix.startsWith(UPLOAD_TOKEN_PREFIX)).toBe(true);
    expect(minted.token.startsWith(minted.prefix)).toBe(true);
    expect(minted.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashUploadToken(minted.token)).toBe(minted.tokenHash);
  });

  it('produces a unique token and hash each call', async () => {
    const a = await mintUploadToken();
    const b = await mintUploadToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe('extractUploadToken', () => {
  const tok = 'splt_abc123';

  it('returns the token for a splt_ Bearer header', () => {
    expect(extractUploadToken(new Headers({ authorization: `Bearer ${tok}` }))).toBe(tok);
  });

  it('is case-insensitive on the Bearer scheme', () => {
    expect(extractUploadToken(new Headers({ authorization: `bearer ${tok}` }))).toBe(tok);
  });

  it('returns null for a Clerk session JWT (eyJ…), never mistaking it for a token', () => {
    expect(extractUploadToken(new Headers({ authorization: 'Bearer eyJhbGciOi.payload.sig' }))).toBeNull();
  });

  it('returns null when there is no Authorization header', () => {
    expect(extractUploadToken(new Headers())).toBeNull();
  });

  it('returns null for a non-Bearer scheme', () => {
    expect(extractUploadToken(new Headers({ authorization: `Basic ${tok}` }))).toBeNull();
  });
});

describe('verifyUploadToken', () => {
  it('resolves a valid token to an upload-token principal', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'tok_1', userId: 'user_42' });

    const principal = await verifyUploadToken('splt_valid');

    expect(principal).toEqual({
      userId: 'user_42',
      provider: 'upload-token',
      providerSubject: 'user_42',
      source: 'upload-token',
      credentialKind: 'upload-token',
      uploadTokenId: 'tok_1',
    });
  });

  it('does not write last-used during pure credential verification', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'tok_1', userId: 'user_42' });

    await verifyUploadToken('splt_valid');

    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('only queries un-revoked rows (revoked ≡ unknown)', async () => {
    mocks.findFirst.mockResolvedValue(null);

    await verifyUploadToken('splt_x');

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ revokedAt: null }) })
    );
  });

  it('returns null for a revoked or unknown token', async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await verifyUploadToken('splt_revoked_or_unknown')).toBeNull();
  });

  it('surfaces a DB error as enrollment unavailable', async () => {
    mocks.findFirst.mockRejectedValue(new Error('relation "upload_tokens" does not exist'));
    await expect(verifyUploadToken('splt_x')).rejects.toMatchObject({ code: 'enrollment_unavailable' });
  });
});

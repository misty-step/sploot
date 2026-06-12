import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: {
    personalUploadToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}));

import {
  createPersonalUploadToken,
  hashPersonalUploadToken,
  PERSONAL_UPLOAD_TOKEN_PREFIX,
  verifyPersonalUploadToken,
} from '@/lib/auth/personal-upload-token';

describe('personal upload tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a prefixed secret and stores only its hash', async () => {
    mocks.prisma.personalUploadToken.create.mockResolvedValue({
      id: 'token-1',
      name: 'Save to Sploot Shortcut',
      createdAt: new Date('2026-06-12T00:00:00Z'),
      lastUsedAt: null,
      revokedAt: null,
    });

    const result = await createPersonalUploadToken('user-1', 'Save to Sploot Shortcut');

    expect(result.token).toMatch(new RegExp(`^${PERSONAL_UPLOAD_TOKEN_PREFIX}`));
    expect(mocks.prisma.personalUploadToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'Save to Sploot Shortcut',
        tokenHash: hashPersonalUploadToken(result.token),
      },
      select: expect.any(Object),
    });
    expect(hashPersonalUploadToken(result.token)).not.toBe(result.token);
    expect(result.record).toEqual({
      id: 'token-1',
      name: 'Save to Sploot Shortcut',
      createdAt: '2026-06-12T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
    });
  });

  it('authenticates a valid upload token and records last use', async () => {
    const token = `${PERSONAL_UPLOAD_TOKEN_PREFIX}test`;
    mocks.prisma.personalUploadToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      revokedAt: null,
    });
    mocks.prisma.personalUploadToken.update.mockResolvedValue({});

    const result = await verifyPersonalUploadToken(new NextRequest('http://localhost:3001/api/upload', {
      headers: { authorization: `Bearer ${token}` },
    }));

    expect(result).toMatchObject({
      status: 'authenticated',
      principal: {
        userId: 'user-1',
        source: 'personal-upload-token',
        credentialKind: 'personal-upload-token',
      },
    });
    expect(mocks.prisma.personalUploadToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashPersonalUploadToken(token) },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
      },
    });
    expect(mocks.prisma.personalUploadToken.update).toHaveBeenCalledWith({
      where: { id: 'token-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('rejects revoked tokens without updating last use', async () => {
    mocks.prisma.personalUploadToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      revokedAt: new Date('2026-06-12T00:00:00Z'),
    });

    const result = await verifyPersonalUploadToken(new NextRequest('http://localhost:3001/api/upload', {
      headers: { authorization: `Bearer ${PERSONAL_UPLOAD_TOKEN_PREFIX}revoked` },
    }));

    expect(result).toEqual({
      status: 'forbidden',
      reason: 'personal-upload-token-invalid',
    });
    expect(mocks.prisma.personalUploadToken.update).not.toHaveBeenCalled();
  });
});

import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import type { AuthenticatedPrincipal, RequestAuthResult } from './types';

export const PERSONAL_UPLOAD_TOKEN_PREFIX = 'sploot_upload_';

export interface PersonalUploadTokenSummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function generatePersonalUploadToken(): string {
  return `${PERSONAL_UPLOAD_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashPersonalUploadToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function extractPersonalUploadToken(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token?.startsWith(PERSONAL_UPLOAD_TOKEN_PREFIX)) {
    return null;
  }
  return token;
}

export async function verifyPersonalUploadToken(req: NextRequest): Promise<RequestAuthResult> {
  const token = extractPersonalUploadToken(req);
  if (!token) {
    return { status: 'unauthenticated', reason: 'personal-upload-token-missing' };
  }

  if (!prisma) {
    return { status: 'forbidden', reason: 'database-unavailable' };
  }

  const tokenHash = hashPersonalUploadToken(token);
  const record = await prisma.personalUploadToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
    },
  });

  if (!record || record.revokedAt) {
    return { status: 'forbidden', reason: 'personal-upload-token-invalid' };
  }

  await prisma.personalUploadToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    status: 'authenticated',
    principal: personalUploadTokenPrincipal(record.userId, record.id),
    syncStatus: 'skipped',
  };
}

export async function createPersonalUploadToken(
  userId: string,
  name: string
): Promise<{ token: string; record: PersonalUploadTokenSummary }> {
  if (!prisma) {
    throw new Error('Database not configured');
  }

  const token = generatePersonalUploadToken();
  const record = await prisma.personalUploadToken.create({
    data: {
      userId,
      name,
      tokenHash: hashPersonalUploadToken(token),
    },
    select: tokenSummarySelect(),
  });

  return { token, record: serializeToken(record) };
}

export async function listPersonalUploadTokens(userId: string): Promise<PersonalUploadTokenSummary[]> {
  if (!prisma) {
    throw new Error('Database not configured');
  }

  const tokens = await prisma.personalUploadToken.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: tokenSummarySelect(),
  });

  return tokens.map(serializeToken);
}

export async function revokePersonalUploadToken(userId: string, tokenId: string): Promise<boolean> {
  if (!prisma) {
    throw new Error('Database not configured');
  }

  const result = await prisma.personalUploadToken.updateMany({
    where: {
      id: tokenId,
      userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  return result.count > 0;
}

function personalUploadTokenPrincipal(userId: string, tokenId: string): AuthenticatedPrincipal {
  return {
    userId,
    provider: 'personal-upload-token',
    providerSubject: tokenId,
    source: 'personal-upload-token',
    credentialKind: 'personal-upload-token',
  };
}

function tokenSummarySelect() {
  return {
    id: true,
    name: true,
    createdAt: true,
    lastUsedAt: true,
    revokedAt: true,
  } as const;
}

function serializeToken(record: {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}): PersonalUploadTokenSummary {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt.toISOString(),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
  };
}

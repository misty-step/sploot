import { NextRequest, NextResponse } from 'next/server';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { withObservability } from '@/lib/with-observability';
import { prisma } from '@/lib/db';
import { mintUploadToken } from '@/lib/auth/upload-token';

/**
 * Personal upload token management. These routes are session-authenticated
 * (Clerk cookie/bearer, or the qa-local harness) via the default auth policy —
 * they do NOT set allowUploadToken, so an upload token cannot mint or list
 * tokens. See lib/auth/upload-token.ts.
 */

// Generous enough for a few named tokens (phone, laptop, CLI); bounds growth.
const MAX_ACTIVE_TOKENS = 10;
const MAX_NAME_LENGTH = 64;

const getHandler = withAuthenticatedApi(async (_req: NextRequest, _context, { principal }) => {
  if (!prisma) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  const tokens = await prisma.uploadToken.findMany({
    where: { userId: principal.userId, revokedAt: null },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ tokens });
});

const postHandler = withAuthenticatedApi(async (req: NextRequest, _context, { principal }) => {
  if (!prisma) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  let rawName: unknown;
  try {
    const body = await req.json();
    rawName = body?.name;
  } catch {
    rawName = undefined;
  }

  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'give your token a name' }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `name must be ${MAX_NAME_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  const activeCount = await prisma.uploadToken.count({
    where: { userId: principal.userId, revokedAt: null },
  });
  if (activeCount >= MAX_ACTIVE_TOKENS) {
    return NextResponse.json(
      { error: `you can have at most ${MAX_ACTIVE_TOKENS} active tokens — revoke one first` },
      { status: 422 }
    );
  }

  const minted = await mintUploadToken();
  const created = await prisma.uploadToken.create({
    data: {
      userId: principal.userId,
      name,
      tokenHash: minted.tokenHash,
      prefix: minted.prefix,
    },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });

  // The plaintext token is returned exactly once here and never stored or
  // returned again. Only its sha256 (minted.tokenHash) is persisted.
  return NextResponse.json({ ...created, token: minted.token }, { status: 201 });
});

export const GET = withObservability(getHandler, {
  operation: 'upload-tokens:list',
  skipTiming: true,
});
export const POST = withObservability(postHandler, { operation: 'upload-tokens:mint' });

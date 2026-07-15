import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';

export const EMBEDDING_PROCESSING_TTL_MS = 10 * 60 * 1000;
export const EMBEDDING_FAILED_COOLDOWN_MS = 2 * 60 * 1000;

export type EmbeddingGateState =
  | 'ready'
  | 'processing'
  | 'cooldown'
  | 'terminal'
  | 'available'
  | 'unavailable';

export interface EmbeddingGateResult {
  state: EmbeddingGateState;
  status?: string | null;
  retryAfterMs?: number;
  updatedAt?: Date | null;
  completedAt?: Date | null;
  nextAttemptAt?: Date | null;
  terminalAt?: Date | null;
}

export interface EmbeddingLockResult extends EmbeddingGateResult {
  acquired: boolean;
  processingClaimToken?: string;
}

export interface EmbeddingStateRow {
  status?: string | null;
  updatedAt?: Date | null;
  completedAt?: Date | null;
  dim?: number | null;
  nextAttemptAt?: Date | null;
  terminalAt?: Date | null;
}

export function resolveEmbeddingGateState(
  row: EmbeddingStateRow | null | undefined,
  now: Date = new Date()
): EmbeddingGateResult {
  if (!row) {
    return { state: 'available' };
  }

  const status = row.status ?? null;
  const updatedAt = row.updatedAt ?? null;
  const completedAt = row.completedAt ?? null;
  const dim = row.dim ?? null;
  const nextAttemptAt = row.nextAttemptAt ?? null;
  const terminalAt = row.terminalAt ?? null;

  if ((status === 'ready' && completedAt) || (dim && dim > 0)) {
    return { state: 'ready', status, updatedAt, completedAt };
  }

  if (terminalAt) {
    return { state: 'terminal', status, updatedAt, completedAt, terminalAt };
  }

  if (status === 'processing' && updatedAt) {
    const ageMs = now.getTime() - updatedAt.getTime();
    if (ageMs < EMBEDDING_PROCESSING_TTL_MS) {
      return {
        state: 'processing',
        status,
        updatedAt,
        retryAfterMs: EMBEDDING_PROCESSING_TTL_MS - ageMs,
      };
    }
  }

  if (status === 'failed' && updatedAt) {
    const ageMs = now.getTime() - updatedAt.getTime();
    if (ageMs < EMBEDDING_FAILED_COOLDOWN_MS) {
      return {
        state: 'cooldown',
        status,
        updatedAt,
        retryAfterMs: EMBEDDING_FAILED_COOLDOWN_MS - ageMs,
      };
    }
  }

  if (nextAttemptAt && nextAttemptAt > now) {
    return {
      state: 'cooldown',
      status,
      updatedAt,
      retryAfterMs: nextAttemptAt.getTime() - now.getTime(),
      nextAttemptAt,
    };
  }

  return { state: 'available', status, updatedAt, completedAt };
}

export async function getEmbeddingGateState(
  assetId: string
): Promise<EmbeddingGateResult> {
  if (!prisma) {
    return { state: 'unavailable' };
  }

  const embedding = await prisma.assetEmbedding.findUnique({
    where: { assetId },
    select: {
      status: true,
      updatedAt: true,
      completedAt: true,
      dim: true,
      nextAttemptAt: true,
      terminalAt: true,
    },
  });

  return resolveEmbeddingGateState(embedding);
}

export async function acquireEmbeddingProcessing(
  assetId: string,
  nowMs: number = Date.now()
): Promise<EmbeddingLockResult> {
  if (!prisma) {
    return { state: 'unavailable', acquired: false };
  }

  const now = new Date(nowMs);
  const processingClaimToken = randomUUID();
  const processingStaleBefore = new Date(now.getTime() - EMBEDDING_PROCESSING_TTL_MS);
  const failedCooldownBefore = new Date(now.getTime() - EMBEDDING_FAILED_COOLDOWN_MS);

  const updated = await prisma.$queryRaw<
    Array<{ status: string | null; updatedAt: Date; completedAt: Date | null; processingClaimToken: string }>
  >(Prisma.sql`
    UPDATE "asset_embeddings"
    SET
      "status" = 'processing',
      "error" = NULL,
      "processing_claim_token" = ${processingClaimToken},
      "updatedAt" = ${now}
    WHERE "asset_id" = ${assetId}
      AND "image_embedding" IS NULL
      AND ("dim" IS NULL OR "dim" = 0)
      AND "terminal_at" IS NULL
      AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= ${now})
      AND (
        "status" IS NULL
        OR "status" = 'pending'
        OR ("status" = 'failed' AND "updatedAt" < ${failedCooldownBefore})
        OR ("status" = 'processing' AND "updatedAt" < ${processingStaleBefore})
        OR ("status" = 'ready' AND "completedAt" IS NULL)
      )
    RETURNING "status", "updatedAt", "completedAt",
      "processing_claim_token" AS "processingClaimToken";
  `);

  if (updated.length > 0) {
    return {
      state: 'processing',
      acquired: true,
      status: updated[0].status,
      updatedAt: updated[0].updatedAt,
      completedAt: updated[0].completedAt,
      processingClaimToken: updated[0].processingClaimToken,
    };
  }

  const inserted = await prisma.$queryRaw<
    Array<{ status: string | null; updatedAt: Date; completedAt: Date | null; processingClaimToken: string }>
  >(Prisma.sql`
    INSERT INTO "asset_embeddings" (
      "asset_id",
      "model_name",
      "model_version",
      "dim",
      "status",
      "processing_claim_token",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${assetId},
      'pending',
      'pending',
      0,
      'processing',
      ${processingClaimToken},
      ${now},
      ${now}
    )
    ON CONFLICT ("asset_id") DO NOTHING
    RETURNING "status", "updatedAt", "completedAt",
      "processing_claim_token" AS "processingClaimToken";
  `);

  if (inserted.length > 0) {
    return {
      state: 'processing',
      acquired: true,
      status: inserted[0].status,
      updatedAt: inserted[0].updatedAt,
      completedAt: inserted[0].completedAt,
      processingClaimToken: inserted[0].processingClaimToken,
    };
  }

  const gate = await getEmbeddingGateState(assetId);
  return {
    ...gate,
    acquired: false,
  };
}

export async function markEmbeddingFailed(
  assetId: string,
  errorMessage: string
): Promise<void> {
  if (!prisma) {
    return;
  }

  await prisma.assetEmbedding.upsert({
    where: { assetId },
    create: {
      assetId,
      modelName: 'unknown',
      modelVersion: 'unknown',
      dim: 0,
      status: 'failed',
      error: errorMessage,
    },
    update: {
      status: 'failed',
      error: errorMessage,
      processingClaimToken: null,
    },
  });
}

export async function markEmbeddingTerminalSkipped(
  assetId: string,
  errorMessage: string
): Promise<void> {
  if (!prisma) {
    return;
  }

  const now = new Date();
  await prisma.assetEmbedding.upsert({
    where: { assetId },
    create: {
      assetId,
      modelName: 'unsupported-media',
      modelVersion: 'unsupported-media',
      dim: 0,
      status: 'failed',
      error: errorMessage,
      terminalAt: now,
    },
    update: {
      modelName: 'unsupported-media',
      modelVersion: 'unsupported-media',
      dim: 0,
      status: 'failed',
      error: errorMessage,
      nextAttemptAt: null,
      terminalAt: now,
      processingClaimToken: null,
    },
  });
}

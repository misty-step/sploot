import type { Prisma, PrismaClient } from '@prisma/client';
import { createStorageConfig, storageConfigFromEnv } from './config';
import { S3CompatibleObjectStore, VercelObjectStore } from './object-store';
import { logger } from '@/lib/observability-logger';
import { randomUUID } from 'node:crypto';

const LEASE_SECONDS = 5 * 60;
const MAX_BACKOFF_SECONDS = 60 * 60;

export interface CleanupRow {
  id: string;
  provider: string;
  key: string;
  url: string;
  attempts: number;
  claimOwner: string;
  claimToken: string;
}

export interface CleanupResult {
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  failures: Array<{ id: string; provider: string; error: string }>;
}

type CleanupDb = Pick<PrismaClient, '$queryRawUnsafe' | '$executeRawUnsafe'> & {
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

function targetConfigForCleanup(config: ReturnType<typeof storageConfigFromEnv>) {
  if (config.provider === 's3') return config;
  return createStorageConfig({
    ...config,
    provider: 's3',
    publicUrlBase: config.publicUrlBase ?? process.env.S3_PUBLIC_URL_BASE,
    phase: 'legacy',
  });
}

/**
 * Claim and process a bounded cleanup batch. Every claim carries an owner and
 * random token in addition to its lease deadline. Finalizers require all three
 * values, so an expired worker cannot overwrite a successor's result.
 */
export async function processStorageCleanup(db: CleanupDb, limit: number, options?: { workerId?: string; leaseSeconds?: number }): Promise<CleanupResult> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Cleanup batch size must be 1-100');
  const config = storageConfigFromEnv();
  const workerId = options?.workerId ?? 'storage-cleanup-' + randomUUID();
  const leaseSeconds = Math.min(Math.max(Math.trunc(options?.leaseSeconds ?? LEASE_SECONDS), 1), 3600);
  const legacy = new VercelObjectStore(config.legacyBaseUrl);
  const rows = await db.$transaction(async tx => {
    const claimed = await tx.$queryRawUnsafe<Array<Omit<CleanupRow, 'claimOwner' | 'claimToken'>>>(
      "SELECT id, provider, key, url, attempts FROM storage_cleanup_outbox WHERE ((status = 'pending' AND available_at <= NOW()) OR (status = 'processing' AND available_at <= NOW())) ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED",
      limit,
    );
    const result: CleanupRow[] = [];
    for (const row of claimed) {
      const claimToken = randomUUID();
      const updated = await tx.$executeRawUnsafe(
        "UPDATE storage_cleanup_outbox SET status='processing', attempts=attempts + 1, claim_owner=$2, claim_token=$3, available_at=NOW() + ($4 * INTERVAL '1 second'), updated_at=NOW() WHERE id=$1",
        row.id,
        workerId,
        claimToken,
        leaseSeconds,
      );
      if (updated !== 1) continue;
      result.push({ ...row, claimOwner: workerId, claimToken });
    }
    return result;
  });

  const result: CleanupResult = { processed: rows.length, succeeded: 0, failed: 0, retrying: 0, failures: [] };
  let target: S3CompatibleObjectStore | undefined;
  for (const row of rows) {
    try {
      if (row.provider === 'vercel') {
        await legacy.deleteUrl(row.url);
      } else if (row.provider === 's3') {
        target ??= new S3CompatibleObjectStore(targetConfigForCleanup(config));
        await target.delete(row.key);
      } else {
        throw new Error('Unsupported storage cleanup provider: ' + row.provider);
      }
      const finalized = await db.$executeRawUnsafe(
        "UPDATE storage_cleanup_outbox SET status='done', claim_owner=NULL, claim_token=NULL, last_error=NULL, available_at=NOW(), updated_at=NOW() WHERE id=$1 AND status='processing' AND claim_owner=$2 AND claim_token=$3 AND available_at > NOW()",
        row.id,
        row.claimOwner,
        row.claimToken,
      );
      if (finalized !== 1) throw new Error('Storage cleanup lease lost before success finalization');
      result.succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const backoffSeconds = Math.min(MAX_BACKOFF_SECONDS, 60 * (2 ** Math.min(row.attempts, 5)));
      const retried = await db.$executeRawUnsafe(
        "UPDATE storage_cleanup_outbox SET status='pending', claim_owner=NULL, claim_token=NULL, last_error=$2, available_at=NOW() + ($3 * INTERVAL '1 second'), updated_at=NOW() WHERE id=$1 AND status='processing' AND claim_owner=$4 AND claim_token=$5 AND available_at > NOW()",
        row.id,
        message,
        backoffSeconds,
        row.claimOwner,
        row.claimToken,
      );
      result.failed++;
      if (retried === 1) result.retrying++;
      result.failures.push({ id: row.id, provider: row.provider, error: message });
      logger.logError('storage.cleanup.failed', error instanceof Error ? error : new Error(message), {
        outboxId: row.id,
        provider: row.provider,
        attempts: row.attempts,
        workerId,
      });
    }
  }
  return result;
}

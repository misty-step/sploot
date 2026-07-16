import type { Prisma, PrismaClient } from '@prisma/client';
import { storageConfigFromEnv } from './config';
import { S3CompatibleObjectStore, VercelObjectStore } from './object-store';
import { logger } from '@/lib/observability-logger';

const LEASE_SECONDS = 5 * 60;
const MAX_BACKOFF_SECONDS = 60 * 60;

export interface CleanupRow {
  id: string;
  provider: string;
  key: string;
  url: string;
  attempts: number;
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

/**
 * Claim and process a bounded cleanup batch. available_at is the durable lease
 * deadline: a crashed worker leaves a processing row eligible for the next
 * scheduled run, while status/attempts/last_error preserve retry evidence.
 */
export async function processStorageCleanup(db: CleanupDb, limit: number): Promise<CleanupResult> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Cleanup batch size must be 1-100');
  const config = storageConfigFromEnv();
  const legacy = new VercelObjectStore(config.legacyBaseUrl);
  let target: S3CompatibleObjectStore | undefined;
  const rows = await db.$transaction(async tx => {
    const claimed = await tx.$queryRawUnsafe<CleanupRow[]>(`SELECT id, provider, key, url, attempts FROM storage_cleanup_outbox
       WHERE (status = 'pending' AND available_at <= NOW())
          OR (status = 'processing' AND available_at <= NOW())
       ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED`, limit);
    for (const row of claimed) {
      await tx.$executeRawUnsafe(
        `UPDATE storage_cleanup_outbox
         SET status = 'processing', attempts = attempts + 1,
             available_at = NOW() + ($2 * INTERVAL '1 second'), updated_at = NOW()
         WHERE id = $1`,
        row.id,
        LEASE_SECONDS,
      );
    }
    return claimed;
  });

  const result: CleanupResult = { processed: rows.length, succeeded: 0, failed: 0, retrying: 0, failures: [] };
  for (const row of rows) {
    try {
      if (row.provider === 'vercel') {
        await legacy.deleteUrl(row.url);
      } else if (row.provider === 's3') {
        target ??= new S3CompatibleObjectStore(config);
        await target.delete(row.key);
      } else {
        throw new Error('Unsupported storage cleanup provider: ' + row.provider);
      }
      await db.$executeRawUnsafe(
        `UPDATE storage_cleanup_outbox
         SET status = 'done', last_error = NULL, available_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'processing'`,
        row.id,
      );
      result.succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const backoffSeconds = Math.min(MAX_BACKOFF_SECONDS, 60 * (2 ** Math.min(row.attempts, 5)));
      await db.$executeRawUnsafe(
        `UPDATE storage_cleanup_outbox
         SET status = 'pending', last_error = $2,
             available_at = NOW() + ($3 * INTERVAL '1 second'), updated_at = NOW()
         WHERE id = $1 AND status = 'processing'`,
        row.id,
        message,
        backoffSeconds,
      );
      result.failed++;
      result.retrying++;
      result.failures.push({ id: row.id, provider: row.provider, error: message });
      logger.logError('storage.cleanup.failed', error instanceof Error ? error : new Error(message), {
        outboxId: row.id,
        provider: row.provider,
        attempts: row.attempts + 1,
      });
    }
  }
  return result;
}

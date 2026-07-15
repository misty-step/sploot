import { prisma, syncUser } from '../db';
import { getUserSyncCircuitBreaker } from '../circuit-breaker';
import { logger } from '../observability-logger';
import { isUnauthorizedAuthError } from './api';
import type { AuthSyncStatus } from './types';

export interface UserSyncResult {
  syncStatus: AuthSyncStatus;
  syncError?: string;
  email?: string;
  failureCode?: 'identity_missing' | 'identity_mismatch' | 'sync_unavailable' | 'sync_conflict';
  retryable?: boolean;
}

/**
 * Keep Clerk identity and the application user row in one adapter so both
 * page and request authentication preserve the same best-effort sync policy.
 */
export async function syncClerkUser(userId: string): Promise<UserSyncResult> {
  if (!prisma) {
    return {
      syncStatus: 'failed',
      failureCode: 'sync_unavailable',
      syncError: 'database unavailable',
    };
  }

  try {
    const clerk = await import('@clerk/nextjs/server');
    const user = await clerk.currentUser();

    if (!user) {
      return {
        syncStatus: 'failed',
        failureCode: 'identity_missing',
        syncError: 'current user unavailable',
      };
    }

    if (user.id !== userId) {
      return {
        syncStatus: 'failed',
        failureCode: 'identity_mismatch',
        syncError: 'Clerk subject does not match the verified request subject',
      };
    }

    const email = user.emailAddresses[0]?.emailAddress || `${userId}@clerk.local`;

    try {
      const circuitBreaker = getUserSyncCircuitBreaker();
      await circuitBreaker.execute(async () => {
        await syncUser(userId, email);
      });

      return { syncStatus: 'success', email };
    } catch (dbError) {
      const isCircuitOpen = (dbError as Error).message.includes('Circuit breaker is OPEN');

      logger.logError('auth:db-sync-failed', dbError as Error, {
        userId,
        email,
        circuitBreakerOpen: isCircuitOpen,
      });
      logger.logInfo('auth:proceeding-without-db-sync', {
        userId,
        reason: isCircuitOpen
          ? 'Circuit breaker open - too many sync failures'
          : 'Database sync failed but allowing authentication',
      });

      const failureCode = classifySyncError(dbError);
      return {
        syncStatus: 'failed',
        failureCode,
        syncError: (dbError as Error).message,
        email,
        ...(failureCode === 'sync_conflict' ? { retryable: isSerializableConflict(dbError) } : {}),
      };
    }
  } catch (error) {
    logger.logError('auth:unexpected-error', error as Error, { userId });
    return {
      syncStatus: 'failed',
      failureCode: isUnauthorizedAuthError(error) ? 'identity_missing' : classifySyncError(error),
      syncError: error instanceof Error ? error.message : 'user sync unavailable',
    };
  }
}

function classifySyncError(error: unknown): 'sync_unavailable' | 'sync_conflict' {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;

  if (code === 'AUTH_IDENTITY_CONFLICT' || code === 'P2002' || code === 'P2034' || code === 'P2028') {
    return 'sync_conflict';
  }

  return 'sync_unavailable';
}

function isSerializableConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && (error as { code?: unknown }).code === 'P2034';
}

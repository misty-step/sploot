import crypto from 'crypto';
import { assetExists, ExistingAssetMetadata, prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Result of duplicate check operation
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  checksum: string;
  existingAsset?: ExistingAssetMetadata;
}

/**
 * Configuration for deduplication checking
 */
export interface DeduplicationConfig {
  checksumAlgorithm?: string;
  includeEmbeddingStatus?: boolean;
}

/**
 * Service for detecting duplicate uploads via content checksums.
 * Deep module: simple checkDuplicate interface hides crypto API, DB queries, embedding checks.
 *
 * Interface: checkDuplicate(userId, buffer) -> { isDuplicate, checksum, existingAsset? }
 * Hidden: SHA-256 hashing, database schema, Prisma queries, embedding status lookup
 *
 * Key design: Atomic checksum + lookup prevents TOCTOU races.
 * Checksum is computed once and reused for both detection and storage.
 */
export class DeduplicationService {
  private checksumAlgorithm: string;
  private includeEmbeddingStatus: boolean;

  constructor(config?: DeduplicationConfig) {
    this.checksumAlgorithm = config?.checksumAlgorithm ?? 'sha256';
    this.includeEmbeddingStatus = config?.includeEmbeddingStatus ?? true;
  }

  /**
   * Check if buffer content already exists for user
   * Atomic operation: computes checksum and queries DB in one call
   */
  async checkDuplicate(
    userId: string,
    buffer: Buffer
  ): Promise<DuplicateCheckResult> {
    // Compute content checksum
    const checksum = this.computeChecksum(buffer);

    logger.debug('Checking for duplicate upload', {
      userId,
      checksum,
      bufferSize: buffer.length,
    });

    // Query database for existing asset with same checksum
    const existingAsset = await this.findExistingAsset(userId, checksum);

    if (existingAsset) {
      logger.info('Duplicate upload detected', {
        userId,
        checksum,
        assetId: existingAsset.id,
        hasEmbedding: existingAsset.hasEmbedding,
      });

      return {
        isDuplicate: true,
        checksum,
        existingAsset,
      };
    }

    logger.debug('No duplicate found', {
      userId,
      checksum,
    });

    return {
      isDuplicate: false,
      checksum,
    };
  }

  /**
   * Compute cryptographic checksum of buffer content
   * Hides crypto API details from callers
   */
  private computeChecksum(buffer: Buffer): string {
    return crypto
      .createHash(this.checksumAlgorithm)
      .update(buffer)
      .digest('hex');
  }

  /**
   * Find existing asset by checksum for user
   * Hides Prisma/DB schema from callers
   */
  private async findExistingAsset(
    userId: string,
    checksum: string
  ): Promise<ExistingAssetMetadata | null> {
    if (!prisma) {
      logger.warn('Database not configured, skipping duplicate check');
      return null;
    }

    try {
      return await assetExists(userId, checksum, {
        includeEmbedding: this.includeEmbeddingStatus,
      });
    } catch (error) {
      logger.error('Error checking for duplicate asset', {
        userId,
        checksum,
        error: error instanceof Error ? error.message : String(error),
      });

      // Don't block upload on DB errors - return null (no duplicate found)
      return null;
    }
  }

  /**
   * Compute checksum without database lookup
   * Useful when you only need the checksum value
   */
  computeChecksumOnly(buffer: Buffer): string {
    return this.computeChecksum(buffer);
  }

  /**
   * Verify buffer matches expected checksum
   * Useful for integrity checks
   */
  verifyChecksum(buffer: Buffer, expectedChecksum: string): boolean {
    const actualChecksum = this.computeChecksum(buffer);
    return actualChecksum === expectedChecksum;
  }

  /**
   * Get service configuration
   */
  getConfig(): Required<DeduplicationConfig> {
    return {
      checksumAlgorithm: this.checksumAlgorithm,
      includeEmbeddingStatus: this.includeEmbeddingStatus,
    };
  }
}

/**
 * Singleton instance for convenience
 */
let defaultDeduplicator: DeduplicationService | null = null;

export function getDeduplicationService(): DeduplicationService {
  if (!defaultDeduplicator) {
    defaultDeduplicator = new DeduplicationService();
  }
  return defaultDeduplicator;
}

/**
 * Type guard for duplicate detection result
 */
export function hasDuplicate(
  result: DuplicateCheckResult
): result is DuplicateCheckResult & { existingAsset: ExistingAssetMetadata } {
  return result.isDuplicate && result.existingAsset !== undefined;
}

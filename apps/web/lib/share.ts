import { nanoid } from 'nanoid';
import { prisma } from './db';
import { Prisma } from '@prisma/client';

/**
 * Error thrown when asset is not found
 */
export class AssetNotFoundError extends Error {
  constructor(assetId: string) {
    super(`Asset not found: ${assetId}`);
    this.name = 'AssetNotFoundError';
  }
}

/**
 * Error thrown when slug generation fails after max retries
 */
export class SlugCollisionError extends Error {
  constructor(attempts: number) {
    super(`Failed to generate unique slug after ${attempts} attempts`);
    this.name = 'SlugCollisionError';
  }
}

/**
 * Maximum number of attempts to generate a unique slug
 * Collision probability is ~10^-12 for 1M IDs, so 3 retries is more than sufficient
 */
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Length of generated slug (URL-safe characters)
 * 10 characters provides ~10^-12 collision probability at 1M IDs
 */
const SLUG_LENGTH = 10;

/**
 * Get or create a share slug for an asset
 *
 * This function is idempotent - calling it multiple times with the same assetId
 * will always return the same slug. The slug is generated lazily on first call.
 *
 * @param assetId - The ID of the asset to generate a share slug for
 * @returns The share slug (either existing or newly generated)
 * @throws {AssetNotFoundError} If the asset doesn't exist
 * @throws {SlugCollisionError} If unable to generate unique slug after max retries
 *
 * @example
 * ```typescript
 * const slug = await getOrCreateShareSlug('asset_123');
 * // Returns: 'aB3dF9Gh12'
 *
 * // Calling again returns the same slug
 * const sameSlug = await getOrCreateShareSlug('asset_123');
 * // Returns: 'aB3dF9Gh12'
 * ```
 */
export async function getOrCreateShareSlug(assetId: string): Promise<string> {
  if (!prisma) {
    throw new Error('Database not configured');
  }

  // 1. Check if asset exists and already has a slug
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, shareSlug: true },
  });

  if (!asset) {
    throw new AssetNotFoundError(assetId);
  }

  // 2. If slug exists, return it (idempotency)
  if (asset.shareSlug) {
    return asset.shareSlug;
  }

  // 3. Generate new slug with collision retry logic
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    const slug = nanoid(SLUG_LENGTH);

    try {
      // 4. Attempt to update asset with new slug
      const updated = await prisma.asset.update({
        where: { id: assetId },
        data: { shareSlug: slug },
        select: { shareSlug: true },
      });

      // Success! Return the slug
      return updated.shareSlug!;
    } catch (error) {
      // 5. Handle unique constraint violation (P2002)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        console.warn(`[Share] Slug collision on attempt ${attempt}/${MAX_RETRY_ATTEMPTS}:`, slug);

        // Retry with new slug if not at max attempts
        if (attempt < MAX_RETRY_ATTEMPTS) {
          continue;
        }

        // Max retries exceeded
        console.error('[Share] Failed to generate unique slug after max retries', {
          assetId,
          attempts: MAX_RETRY_ATTEMPTS,
          lastSlug: slug,
        });

        throw new SlugCollisionError(MAX_RETRY_ATTEMPTS);
      }

      // Unexpected error - rethrow
      throw error;
    }
  }

  // Should never reach here, but TypeScript requires it
  throw new SlugCollisionError(MAX_RETRY_ATTEMPTS);
}

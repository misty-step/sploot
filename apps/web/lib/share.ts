import { nanoid } from 'nanoid';
import { prisma } from './db';
import { Prisma } from '@prisma/client';
import { EnrollmentUnavailableError, withEnrollmentIdentityWriter } from './enrollment/enrollment-policy';

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
export async function getOrCreateShareSlug(assetId: string, ownerUserId?: string): Promise<string> {
  if (!prisma) {
    throw new EnrollmentUnavailableError();
  }

  const readOrCreate = async (db: Prisma.TransactionClient | typeof prisma): Promise<string> => {
    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, shareSlug: true },
    });

    if (!asset) throw new AssetNotFoundError(assetId);
    if (asset.shareSlug) return asset.shareSlug;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    const slug = nanoid(SLUG_LENGTH);

    try {
      // 4. Attempt to update asset with new slug
      const updated = await db.asset.update({
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

    throw new SlugCollisionError(MAX_RETRY_ATTEMPTS);
  };

  if (ownerUserId) {
    return withEnrollmentIdentityWriter(prisma, ownerUserId, (tx) => readOrCreate(tx));
  }
  return readOrCreate(prisma);
}

/**
 * Revoke an asset's share link.
 *
 * Idempotent - revoking an asset with no active share slug is a no-op and
 * returns null. The caller owns cache invalidation of the returned slug (if
 * any) via `invalidateSlugCache` from `./slug-cache`.
 *
 * @param assetId - The ID of the asset to revoke sharing for
 * @param ownerUserId - The owning user, for enrollment-identity-writer scoping
 * @returns The share slug that was revoked, or null if the asset had none
 * @throws {AssetNotFoundError} If the asset doesn't exist
 */
export async function revokeShareSlug(assetId: string, ownerUserId?: string): Promise<string | null> {
  if (!prisma) {
    throw new EnrollmentUnavailableError();
  }

  const clearSlug = async (db: Prisma.TransactionClient | typeof prisma): Promise<string | null> => {
    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, shareSlug: true },
    });

    if (!asset) throw new AssetNotFoundError(assetId);
    if (!asset.shareSlug) return null;

    await db.asset.update({
      where: { id: assetId },
      data: { shareSlug: null },
    });

    return asset.shareSlug;
  };

  if (ownerUserId) {
    return withEnrollmentIdentityWriter(prisma, ownerUserId, (tx) => clearSlug(tx));
  }
  return clearSlug(prisma);
}

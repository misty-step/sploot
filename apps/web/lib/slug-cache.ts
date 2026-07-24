import { prisma } from './db';

/**
 * Resolve a public share slug against authoritative Postgres.
 *
 * No process-local positive cache: multi-instance deploys cannot invalidate
 * peer memory on revoke, and a short TTL would re-open short links after
 * revoke+re-share. One indexed lookup is the correct cost.
 *
 * Node.js runtime only: this module imports Prisma Client.
 */
export async function resolveShareSlug(slug: string): Promise<string | null> {
  if (!prisma) {
    console.error('Database not configured');
    return null;
  }

  const asset = await prisma.asset.findFirst({
    where: { shareSlug: slug, deletedAt: null },
    select: { id: true },
  });

  return asset?.id ?? null;
}

/**
 * No-op retained so callers (DELETE share, hard-delete) stay stable.
 * Kept as a named seam if a shared cache returns later with real multi-node
 * invalidation.
 */
export async function invalidateSlugCache(_slug: string): Promise<void> {
  // Intentionally empty: resolveShareSlug is DB-authoritative.
}

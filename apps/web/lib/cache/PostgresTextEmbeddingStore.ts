/**
 * Persistent L2 for the text-embedding cache namespace.
 *
 * The in-memory backend (L1) dies with each serverless instance, so every
 * cold instance used to pay a Replicate round-trip per query text. This store
 * persists embeddings in Postgres keyed by the same cache key. Embeddings are
 * immutable for a given (model, normalized query), so a long TTL is safe; the
 * key includes the model so a model upgrade naturally misses.
 *
 * Fail-soft by design: any database problem degrades to L1-only behavior and
 * must never break search.
 */

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class PostgresTextEmbeddingStore {
  async get(key: string): Promise<number[] | null> {
    try {
      const { prisma } = await import('@/lib/db');
      if (!prisma?.textEmbeddingCache) return null;

      const row = await prisma.textEmbeddingCache.findUnique({ where: { key } });
      if (!row || row.expiresAt <= new Date()) return null;

      const embedding = row.embedding;
      return Array.isArray(embedding) ? (embedding as number[]) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, model: string, embedding: number[]): Promise<void> {
    try {
      const { prisma } = await import('@/lib/db');
      if (!prisma?.textEmbeddingCache) return;

      const now = new Date();
      const expiresAt = new Date(now.getTime() + TTL_MS);
      await prisma.textEmbeddingCache.upsert({
        where: { key },
        update: { model, embedding, expiresAt },
        create: { key, model, embedding, expiresAt },
      });
      // Opportunistic pruning keeps the table bounded without a cron.
      await prisma.textEmbeddingCache.deleteMany({ where: { expiresAt: { lte: now } } });
    } catch {
      // L1-only degradation; never block the search path.
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const { prisma } = await import('@/lib/db');
      if (!prisma?.textEmbeddingCache) return;
      await prisma.textEmbeddingCache.deleteMany({ where: { key } });
    } catch {
      // Fail-soft.
    }
  }

  async clear(): Promise<void> {
    try {
      const { prisma } = await import('@/lib/db');
      if (!prisma?.textEmbeddingCache) return;
      await prisma.textEmbeddingCache.deleteMany({});
    } catch {
      // Fail-soft.
    }
  }
}

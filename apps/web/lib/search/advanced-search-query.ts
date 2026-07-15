import { Prisma } from '@prisma/client';
import { embeddingVectorSql } from '@/lib/embedding-vector-sql';
import type {
  AdvancedSearchFilters,
  AssetGridSnakeSource,
} from '@/lib/types';

export type AdvancedSearchSortBy = 'relevance' | 'date' | 'favorite';

export interface AdvancedSearchQueryInput {
  userId: string;
  embedding: number[];
  filters: AdvancedSearchFilters;
  threshold: number;
  limit: number;
  offset: number;
  sortBy: AdvancedSearchSortBy;
  seed?: number | null;
}

export interface AdvancedSearchRow extends AssetGridSnakeSource {
  thumbnail_url: string | null;
  similarity: number;
  total_count: bigint;
}

export interface AdvancedSearchQueryResult {
  rows: AdvancedSearchRow[];
  totalCount: number;
}

interface RawQueryClient {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

function validIsoDate(value: string | undefined): Date | null {
  if (!value) return null;
  const isoPattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/;
  if (!isoPattern.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function executeAdvancedSearchQuery(
  client: RawQueryClient,
  input: AdvancedSearchQueryInput,
): Promise<AdvancedSearchQueryResult> {
  const vectorSql = embeddingVectorSql(input.embedding, 'advanced search query embedding');
  const seed = input.seed ?? null;
  const mimeTypes = (input.filters.mimeTypes ?? []).filter(
    (mime): mime is string => typeof mime === 'string' && mime.length > 0 && mime.length < 100,
  );
  const tags = (input.filters.tags ?? []).filter(
    (tag): tag is string => typeof tag === 'string' && tag.length > 0 && tag.length < 100,
  );
  const dateFrom = validIsoDate(input.filters.dateFrom);
  const dateTo = validIsoDate(input.filters.dateTo);
  const minWidth = typeof input.filters.minWidth === 'number' && input.filters.minWidth > 0
    ? Math.floor(input.filters.minWidth)
    : null;
  const minHeight = typeof input.filters.minHeight === 'number' && input.filters.minHeight > 0
    ? Math.floor(input.filters.minHeight)
    : null;

  const orderBy: Record<AdvancedSearchSortBy, Prisma.Sql> = {
    date: Prisma.sql`a."createdAt" DESC`,
    favorite: Prisma.sql`a.favorite DESC, ae.image_embedding <=> ${vectorSql}`,
    relevance: Prisma.sql`ae.image_embedding <=> ${vectorSql}`,
  };
  const seedOrder = seed === null
    ? Prisma.sql`a.id ASC`
    : Prisma.sql`md5(concat(a.id, ${seed})) ASC, a.id ASC`;

  const rows = await client.$queryRaw<AdvancedSearchRow[]>(Prisma.sql`
    SELECT
      a.id,
      a.blob_url,
      a.thumbnail_url,
      a.pathname,
      a.mime,
      a.size,
      a.width,
      a.height,
      a.favorite,
      a."createdAt" AS created_at,
      1 - (ae.image_embedding <=> ${vectorSql}) AS similarity,
      COUNT(*) OVER() AS total_count
    FROM assets a
    INNER JOIN asset_embeddings ae ON a.id = ae.asset_id
    WHERE a.owner_user_id = ${input.userId}
      AND a.deleted_at IS NULL
      AND ae.status = 'ready'
      AND ae.image_embedding IS NOT NULL
      AND 1 - (ae.image_embedding <=> ${vectorSql}) >= ${input.threshold}
      ${input.filters.favorites === true ? Prisma.sql`AND a.favorite = true` : Prisma.empty}
      ${mimeTypes.length > 0 ? Prisma.sql`AND a.mime = ANY(${mimeTypes})` : Prisma.empty}
      ${dateFrom ? Prisma.sql`AND a."createdAt" >= ${dateFrom}` : Prisma.empty}
      ${dateTo ? Prisma.sql`AND a."createdAt" <= ${dateTo}` : Prisma.empty}
      ${minWidth ? Prisma.sql`AND a.width >= ${minWidth}` : Prisma.empty}
      ${minHeight ? Prisma.sql`AND a.height >= ${minHeight}` : Prisma.empty}
      ${tags.length > 0 ? Prisma.sql`
        AND EXISTS (
          SELECT 1
          FROM asset_tags filtered_asset_tags
          INNER JOIN tags filtered_tags ON filtered_tags.id = filtered_asset_tags.tag_id
          WHERE filtered_asset_tags.asset_id = a.id
            AND filtered_tags.owner_user_id = ${input.userId}
            AND filtered_tags.name IN (${Prisma.join(tags)})
        )
      ` : Prisma.empty}
    ORDER BY ${orderBy[input.sortBy]}, ${seedOrder}
    LIMIT ${input.limit}
    OFFSET ${input.offset}
  `);

  return {
    rows,
    totalCount: rows.length > 0 ? Number(rows[0].total_count) : 0,
  };
}

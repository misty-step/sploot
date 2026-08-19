import type { Asset, AssetTag, EmbeddingStatus } from '@/lib/types';

/**
 * Canonical mapper for the grid/client asset DTO (`Asset`).
 *
 * Every read path that returns an asset to the client -- list / shuffle /
 * taste (`GET /api/assets`), semantic search (`POST /api/search`,
 * `POST /api/search/advanced`), similarity (`GET /api/assets/:id/similar`),
 * and asset detail (`GET`/`PATCH /api/assets/:id`) -- normalizes its row
 * shape through `toGridAsset` so a field can't be silently dropped (or
 * over-exposed) on just one surface again. See sploot-048 / sploot-049.
 */

/**
 * Prisma-shaped rows: `prisma.asset.findMany`/`findFirst` selects, and the
 * camelCase raw-SQL rows used by the shuffle and taste-ranked queries.
 */
export interface CamelCaseAssetRow {
  id: string;
  blobUrl: string;
  thumbnailUrl?: string | null;
  pathname: string;
  /** Pass the caller's existing filename convention through explicitly;
   * omit to fall back to the pathname's basename. */
  filename?: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  favorite: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
  tasteScore?: number;
  /** Prisma relation shape (`select: { embedding: { select: {...} } }`). */
  embedding?: {
    modelName?: string | null;
    modelVersion?: string | null;
    status?: string | null;
    createdAt?: Date | string | null;
  } | null;
  /** Flat raw-SQL shape (shuffle / taste queries join `asset_embeddings` directly). */
  embeddingId?: string | null;
  embeddingModelName?: string | null;
  embeddingModelVersion?: string | null;
  embeddingStatus?: string | null;
  embeddingCreatedAt?: Date | string | null;
}

/** Raw pgvector search rows (`vectorSearch`, and the advanced-search SQL). */
export interface SnakeCaseAssetRow {
  id: string;
  blob_url: string;
  thumbnail_url?: string | null;
  pathname: string;
  filename?: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  favorite: boolean;
  created_at: Date | string;
  updated_at?: Date | string | null;
  /** `vectorSearch` names this `distance`; the advanced-search raw SQL names
   * the identical 0-1 cosine-similarity score `similarity`. */
  distance?: number;
  similarity?: number;
}

export type GridAssetRow = CamelCaseAssetRow | SnakeCaseAssetRow;

export interface GridAssetExtensions {
  tags?: AssetTag[];
  /** Explicit similarity score (0-1). For snake_case rows this defaults to
   * the row's own `similarity`/`distance` field when omitted. */
  similarity?: number;
  /** Override the derived `Math.round(similarity * 100)` relevance percentage. */
  relevance?: number;
  belowThreshold?: boolean;
}

function isSnakeCaseRow(row: GridAssetRow): row is SnakeCaseAssetRow {
  return 'blob_url' in row;
}

function deriveFilename(pathname: string, filename?: string | null): string {
  return filename || pathname.split('/').pop() || pathname;
}

/** Shared `{ id, name }` tag mapper, deduplicating the identical inline
 * `.map((at) => ({ id: at.tag.id, name: at.tag.name }))` repeated across every
 * asset read path that embeds an asset's tags. Batch-load those rows with
 * `loadTagsByAssetId` in `asset-tags.ts` rather than querying per asset. */
export function mapAssetTags(rows: Array<{ tag: { id: string; name: string } }>): AssetTag[] {
  return rows.map((row) => ({ id: row.tag.id, name: row.tag.name }));
}

function baseFromSnakeCase(row: SnakeCaseAssetRow): Asset {
  return {
    id: row.id,
    blobUrl: row.blob_url,
    thumbnailUrl: row.thumbnail_url ?? null,
    pathname: row.pathname,
    filename: deriveFilename(row.pathname, row.filename),
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    favorite: row.favorite,
    createdAt: row.created_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    // Vector-search rows are matched via an inner join on asset_embeddings,
    // so a returned row always has a ready embedding -- but the row itself
    // never selects the embedding's own model/timestamp columns, so this
    // must stay assetId-only rather than fabricating a fake model name or
    // reusing the asset's createdAt as the embedding's. See sploot-049.
    embedding: { assetId: row.id },
    embeddingStatus: 'ready',
  };
}

function baseFromCamelCase(row: CamelCaseAssetRow): Asset {
  const embeddingStatus = row.embedding?.status ?? row.embeddingStatus ?? undefined;
  const embeddingModelName = row.embedding?.modelName ?? row.embeddingModelName ?? undefined;
  const embeddingModelVersion = row.embedding?.modelVersion ?? row.embeddingModelVersion ?? undefined;
  const embeddingCreatedAt = row.embedding?.createdAt ?? row.embeddingCreatedAt ?? undefined;
  const hasEmbedding = Boolean(row.embedding || row.embeddingId || embeddingStatus);

  return {
    id: row.id,
    blobUrl: row.blobUrl,
    thumbnailUrl: row.thumbnailUrl ?? null,
    pathname: row.pathname,
    filename: deriveFilename(row.pathname, row.filename),
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    favorite: row.favorite,
    createdAt: row.createdAt,
    ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    ...(hasEmbedding
      ? {
          embedding: {
            assetId: row.id,
            modelName: embeddingModelName ?? '',
            ...(embeddingModelVersion ? { modelVersion: embeddingModelVersion } : {}),
            status: embeddingStatus ?? null,
            createdAt: embeddingCreatedAt ?? row.createdAt,
          },
        }
      : {}),
    ...(embeddingStatus ? { embeddingStatus: embeddingStatus as EmbeddingStatus } : {}),
    ...(typeof row.tasteScore === 'number' ? { tasteScore: Number(row.tasteScore.toFixed(3)) } : {}),
  };
}

export function toGridAsset(row: GridAssetRow, extensions: GridAssetExtensions = {}): Asset {
  const base = isSnakeCaseRow(row) ? baseFromSnakeCase(row) : baseFromCamelCase(row);
  const similarity = extensions.similarity ?? (isSnakeCaseRow(row) ? row.similarity ?? row.distance : undefined);

  return {
    ...base,
    ...(extensions.tags ? { tags: extensions.tags } : {}),
    ...(typeof similarity === 'number'
      ? { similarity, relevance: extensions.relevance ?? Math.round(similarity * 100) }
      : {}),
    ...(extensions.belowThreshold !== undefined ? { belowThreshold: extensions.belowThreshold } : {}),
  };
}

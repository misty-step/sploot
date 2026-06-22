import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export const MIN_TASTE_BANGER_EMBEDDINGS = 2;

export type TasteProfileStatus = 'ready' | 'insufficient_bangers';

export interface TasteAssetRow {
  id: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  pathname: string;
  mime: string;
  width: number | null;
  height: number | null;
  favorite: boolean;
  size: number;
  createdAt: Date;
  updatedAt: Date;
  tasteScore: number;
  embeddingId: string | null;
  embeddingModelName: string | null;
  embeddingModelVersion: string | null;
  embeddingStatus: string | null;
  embeddingCreatedAt: Date | null;
}

export interface TasteAssetQueryOptions {
  userId: string;
  favorite: string | null;
  tagId: string | null;
  limit: number;
  offset: number;
}

export interface TasteAssetQueryResult {
  status: TasteProfileStatus;
  assets: TasteAssetRow[];
  total: number;
  embeddedBangerCount: number;
}

export interface TasteProfileAsset {
  id: string;
  blobUrl: string;
  pathname: string;
  mime: string;
  favorite: boolean;
  tasteScore: number;
}

export interface TasteProfile {
  status: TasteProfileStatus;
  bangerCount: number;
  embeddedBangerCount: number;
  label: string;
  summary: string;
  representativeAssets: TasteProfileAsset[];
}

export class TasteSignalInsufficientError extends Error {
  constructor(public readonly embeddedBangerCount: number) {
    super('Not enough embedded bangers to build a taste profile');
    this.name = 'TasteSignalInsufficientError';
  }
}

export async function getTasteWeightedAssets(options: TasteAssetQueryOptions): Promise<TasteAssetQueryResult> {
  if (!prisma) {
    return {
      status: 'insufficient_bangers',
      assets: [],
      total: 0,
      embeddedBangerCount: 0,
    };
  }

  const embeddedBangerCount = await countEmbeddedBangers(options.userId);
  if (embeddedBangerCount < MIN_TASTE_BANGER_EMBEDDINGS) {
    return {
      status: 'insufficient_bangers',
      assets: [],
      total: 0,
      embeddedBangerCount,
    };
  }

  const [assets, total] = await Promise.all([
    fetchTasteAssets(options),
    countTasteAssets(options),
  ]);

  return {
    status: 'ready',
    assets,
    total,
    embeddedBangerCount,
  };
}

export async function getTasteProfile(userId: string): Promise<TasteProfile> {
  if (!prisma) {
    return insufficientProfile(0, 0);
  }

  const [bangerCount, embeddedBangerCount] = await Promise.all([
    prisma.asset.count({
      where: {
        ownerUserId: userId,
        deletedAt: null,
        favorite: true,
      },
    }),
    countEmbeddedBangers(userId),
  ]);

  if (embeddedBangerCount < MIN_TASTE_BANGER_EMBEDDINGS) {
    return insufficientProfile(bangerCount, embeddedBangerCount);
  }

  const assets = await fetchTasteAssets({
    userId,
    favorite: null,
    tagId: null,
    limit: 6,
    offset: 0,
  });

  return {
    status: 'ready',
    bangerCount,
    embeddedBangerCount,
    label: 'near your bangers',
    summary: `sploot is comparing ${embeddedBangerCount} embedded bangers against the rest of your library.`,
    representativeAssets: assets.map((asset) => ({
      id: asset.id,
      blobUrl: asset.blobUrl,
      pathname: asset.pathname,
      mime: asset.mime,
      favorite: asset.favorite,
      tasteScore: Number(asset.tasteScore.toFixed(3)),
    })),
  };
}

function insufficientProfile(bangerCount: number, embeddedBangerCount: number): TasteProfile {
  return {
    status: 'insufficient_bangers',
    bangerCount,
    embeddedBangerCount,
    label: 'not enough signal yet',
    summary: 'mark at least two embedded memes as bangers to unlock taste mode.',
    representativeAssets: [],
  };
}

async function countEmbeddedBangers(userId: string): Promise<number> {
  const rows = await prisma!.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM "assets" a
    INNER JOIN "asset_embeddings" ae ON ae.asset_id = a.id
    WHERE
      a.owner_user_id = ${userId}
      AND a.deleted_at IS NULL
      AND a.favorite = true
      AND ae.status = 'ready'
      AND ae.image_embedding IS NOT NULL
  `);

  return Number(rows[0]?.count ?? 0);
}

async function countTasteAssets(options: TasteAssetQueryOptions): Promise<number> {
  const rows = await prisma!.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
    WITH taste_centroid AS (
      SELECT AVG(ae.image_embedding) AS centroid
      FROM "assets" a
      INNER JOIN "asset_embeddings" ae ON ae.asset_id = a.id
      WHERE
        a.owner_user_id = ${options.userId}
        AND a.deleted_at IS NULL
        AND a.favorite = true
        AND ae.status = 'ready'
        AND ae.image_embedding IS NOT NULL
    )
    SELECT COUNT(*)::bigint AS count
    FROM "assets" a
    INNER JOIN "asset_embeddings" ae ON ae.asset_id = a.id
    CROSS JOIN taste_centroid tc
    WHERE
      ${tasteFilterSql(options)}
      AND ae.status = 'ready'
      AND ae.image_embedding IS NOT NULL
      AND tc.centroid IS NOT NULL
  `);

  return Number(rows[0]?.count ?? 0);
}

async function fetchTasteAssets(options: TasteAssetQueryOptions): Promise<TasteAssetRow[]> {
  return prisma!.$queryRaw<TasteAssetRow[]>(Prisma.sql`
    WITH taste_centroid AS (
      SELECT AVG(ae.image_embedding) AS centroid
      FROM "assets" a
      INNER JOIN "asset_embeddings" ae ON ae.asset_id = a.id
      WHERE
        a.owner_user_id = ${options.userId}
        AND a.deleted_at IS NULL
        AND a.favorite = true
        AND ae.status = 'ready'
        AND ae.image_embedding IS NOT NULL
    )
    SELECT
      a.id,
      a.blob_url AS "blobUrl",
      a.thumbnail_url AS "thumbnailUrl",
      a.pathname,
      a.mime,
      a.width,
      a.height,
      a.favorite,
      a.size,
      a."createdAt",
      a."updatedAt",
      1 - (ae.image_embedding <=> tc.centroid) AS "tasteScore",
      ae.asset_id AS "embeddingId",
      ae.model_name AS "embeddingModelName",
      ae.model_version AS "embeddingModelVersion",
      ae.status AS "embeddingStatus",
      ae."createdAt" AS "embeddingCreatedAt"
    FROM "assets" a
    INNER JOIN "asset_embeddings" ae ON ae.asset_id = a.id
    CROSS JOIN taste_centroid tc
    WHERE
      ${tasteFilterSql(options)}
      AND ae.status = 'ready'
      AND ae.image_embedding IS NOT NULL
      AND tc.centroid IS NOT NULL
    ORDER BY "tasteScore" DESC, a.id ASC
    LIMIT ${options.limit}
    OFFSET ${options.offset}
  `);
}

function tasteFilterSql(options: Pick<TasteAssetQueryOptions, 'userId' | 'favorite' | 'tagId'>) {
  return Prisma.sql`
    a.owner_user_id = ${options.userId}
    AND a.deleted_at IS NULL
    ${options.favorite !== null ? Prisma.sql`AND a.favorite = ${options.favorite === 'true'}` : Prisma.empty}
    ${
      options.tagId
        ? Prisma.sql`AND EXISTS (
      SELECT 1 FROM "asset_tags" at
      WHERE at.asset_id = a.id AND at.tag_id = ${options.tagId}
    )`
        : Prisma.empty
    }
  `;
}

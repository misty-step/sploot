import { Prisma } from '@prisma/client';
import { CLIP_MODEL, createEmbeddingService } from '@/lib/embeddings';
import { getCacheService } from '@/lib/cache';
import { prisma } from '@/lib/db';
import { getRuntimeGate } from '@/lib/runtime-gates';
import { DEFAULT_NEAR_DUPLICATE_DISTANCE, hammingDistanceHex } from '@/lib/upload/perceptual-hash-service';
import logger from '@/lib/logger';
import { normalizeAssetToGridDto } from '@/lib/asset-grid-dto';

export const DEFAULT_MINIMUM_PILE_ASSETS = 50;
export const DEFAULT_MAX_PILES = 6;
const MAX_ASSETS_TO_CLUSTER = 240;
const MIN_PILE_SIZE = 2;
const THUMBNAILS_PER_PILE = 6;

export const PILE_ANCHORS = [
  { id: 'reaction-faces', label: 'reaction faces', query: 'reaction face meme' },
  { id: 'pets', label: 'pets', query: 'cat dog animal pet meme' },
  { id: 'screenshots', label: 'screenshots', query: 'phone screenshot chat post meme' },
  { id: 'work-chaos', label: 'work chaos', query: 'work office meeting email meme' },
  { id: 'gaming', label: 'gaming', query: 'gaming video game meme' },
  { id: 'sports', label: 'sports', query: 'sports game athlete meme' },
  { id: 'food', label: 'food', query: 'food cooking restaurant meme' },
  { id: 'cursed', label: 'cursed', query: 'cursed weird unhinged meme' },
  { id: 'wholesome', label: 'wholesome', query: 'wholesome cute happy meme' },
  { id: 'charts', label: 'charts', query: 'chart graph diagram meme' },
  { id: 'celebrities', label: 'celebrities', query: 'celebrity movie tv meme' },
  { id: 'travel', label: 'travel', query: 'travel car plane vacation meme' },
] as const;

export type AutomaticPilesStatus = 'ready' | 'insufficient_embedded_assets';

export interface EmbeddedPileAsset {
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
  phash: string | null;
  embedding: number[];
}

export interface PileAnchorEmbedding {
  id: string;
  label: string;
  embedding: number[];
}

export interface SemanticPileThumbnailAsset {
  id: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  pathname: string;
  filename: string;
  mime: string;
  favorite: boolean;
}

export interface SemanticPile {
  id: string;
  label: string;
  count: number;
  bangers: number;
  confidence: number;
  assetIds: string[];
  thumbnailAssets: SemanticPileThumbnailAsset[];
}

export interface AutomaticPilesResult {
  status: AutomaticPilesStatus;
  minimumAssets: number;
  embeddedAssetCount: number;
  piles: SemanticPile[];
}

export class PileEmbeddingUnavailableError extends Error {
  constructor(message: string, public code = 'pile_anchor_embeddings_unavailable') {
    super(message);
    this.name = 'PileEmbeddingUnavailableError';
  }
}

interface GetAutomaticPilesOptions {
  userId: string;
  minimumAssets?: number;
  maxPiles?: number;
}

interface BuildSemanticPilesOptions {
  assets: EmbeddedPileAsset[];
  anchors: PileAnchorEmbedding[];
  maxPiles?: number;
  minPileSize?: number;
}

interface EmbeddedAssetRow {
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
  phash: string | null;
  embeddingText: string;
}

export async function getAutomaticPiles({
  userId,
  minimumAssets = DEFAULT_MINIMUM_PILE_ASSETS,
  maxPiles = DEFAULT_MAX_PILES,
}: GetAutomaticPilesOptions): Promise<AutomaticPilesResult> {
  if (!prisma) {
    return {
      status: 'insufficient_embedded_assets',
      minimumAssets,
      embeddedAssetCount: 0,
      piles: [],
    };
  }

  const embeddedAssetCount = await countReadyEmbeddedAssets(userId);
  if (embeddedAssetCount < minimumAssets) {
    return {
      status: 'insufficient_embedded_assets',
      minimumAssets,
      embeddedAssetCount,
      piles: [],
    };
  }

  const assets = await listReadyEmbeddedAssets(userId, MAX_ASSETS_TO_CLUSTER);
  const dimension = assets.find((asset) => asset.embedding.length > 0)?.embedding.length;
  if (!dimension) {
    return {
      status: 'insufficient_embedded_assets',
      minimumAssets,
      embeddedAssetCount,
      piles: [],
    };
  }

  const anchors = await loadAnchorEmbeddings(dimension, userId);
  const piles = buildSemanticPiles({
    assets,
    anchors,
    maxPiles,
    minPileSize: MIN_PILE_SIZE,
  });

  return {
    status: 'ready',
    minimumAssets,
    embeddedAssetCount,
    piles,
  };
}

export function buildSemanticPiles({
  assets,
  anchors,
  maxPiles = DEFAULT_MAX_PILES,
  minPileSize = MIN_PILE_SIZE,
}: BuildSemanticPilesOptions): SemanticPile[] {
  const normalizedAnchors = anchors
    .map((anchor) => ({ ...anchor, embedding: normalize(anchor.embedding) }))
    .filter((anchor) => anchor.embedding.length > 0);

  if (normalizedAnchors.length === 0) {
    return [];
  }

  const groups = new Map<string, { anchor: PileAnchorEmbedding; assets: EmbeddedPileAsset[]; scores: number[] }>();
  const acceptedPhashes: string[] = [];

  for (const asset of assets) {
    if (
      asset.phash &&
      acceptedPhashes.some((phash) => hammingDistanceHex(asset.phash!, phash) <= DEFAULT_NEAR_DUPLICATE_DISTANCE)
    ) {
      continue;
    }

    const normalizedAsset = normalize(asset.embedding);
    if (normalizedAsset.length === 0) continue;

    let bestAnchor = normalizedAnchors[0];
    let bestScore = cosine(normalizedAsset, bestAnchor.embedding);
    for (const anchor of normalizedAnchors.slice(1)) {
      const score = cosine(normalizedAsset, anchor.embedding);
      if (score > bestScore || (score === bestScore && anchor.label < bestAnchor.label)) {
        bestAnchor = anchor;
        bestScore = score;
      }
    }

    const group = groups.get(bestAnchor.id) ?? { anchor: bestAnchor, assets: [], scores: [] };
    group.assets.push(asset);
    group.scores.push(bestScore);
    groups.set(bestAnchor.id, group);
    if (asset.phash) {
      acceptedPhashes.push(asset.phash);
    }
  }

  return Array.from(groups.values())
    .filter((group) => group.assets.length >= minPileSize)
    .map((group) => {
      const centroid = centroidFor(group.assets.map((asset) => asset.embedding));
      const labelAnchor = nearestAnchor(centroid, normalizedAnchors) ?? group.anchor;
      const sortedAssets = [...group.assets].sort(compareAssetsForPile);
      const averageScore = group.scores.reduce((sum, score) => sum + score, 0) / group.scores.length;

      return {
        id: labelAnchor.id,
        label: labelAnchor.label,
        count: group.assets.length,
        bangers: group.assets.filter((asset) => asset.favorite).length,
        confidence: Number(Math.max(0, Math.min(1, averageScore)).toFixed(3)),
        assetIds: sortedAssets.map((asset) => asset.id),
        thumbnailAssets: sortedAssets.slice(0, THUMBNAILS_PER_PILE).map(toThumbnailAsset),
      };
    })
    .sort((a, b) => b.count - a.count || b.confidence - a.confidence || a.label.localeCompare(b.label))
    .slice(0, maxPiles);
}

async function countReadyEmbeddedAssets(userId: string): Promise<number> {
  const rows = await prisma!.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM "assets" a
    INNER JOIN "asset_embeddings" ae ON ae.asset_id = a.id
    WHERE
      a.owner_user_id = ${userId}
      AND a.deleted_at IS NULL
      AND ae.status = 'ready'
      AND ae.image_embedding IS NOT NULL
  `);

  return Number(rows[0]?.count ?? 0);
}

async function listReadyEmbeddedAssets(userId: string, limit: number): Promise<EmbeddedPileAsset[]> {
  const rows = await prisma!.$queryRaw<EmbeddedAssetRow[]>(Prisma.sql`
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
      a.phash,
      ae.image_embedding::text AS "embeddingText"
    FROM "assets" a
    INNER JOIN "asset_embeddings" ae ON ae.asset_id = a.id
    WHERE
      a.owner_user_id = ${userId}
      AND a.deleted_at IS NULL
      AND ae.status = 'ready'
      AND ae.image_embedding IS NOT NULL
    ORDER BY a."createdAt" DESC, a.id ASC
    LIMIT ${limit}
  `);

  return rows
    .map((row) => ({ ...row, embedding: parseVectorText(row.embeddingText) }))
    .filter((row) => row.embedding.length > 0);
}

async function loadAnchorEmbeddings(
  dimension: number,
  userId: string
): Promise<PileAnchorEmbedding[]> {
  const cache = getCacheService();
  const cached = await Promise.all(
    PILE_ANCHORS.map(async (anchor) => ({
      anchor,
      embedding: await cache.getTextEmbedding(anchor.query, CLIP_MODEL),
    }))
  );

  const anchors: PileAnchorEmbedding[] = [];
  const missing = [];

  for (const item of cached) {
    if (item.embedding?.length === dimension) {
      anchors.push({ id: item.anchor.id, label: item.anchor.label, embedding: item.embedding });
    } else {
      missing.push(item.anchor);
    }
  }

  if (missing.length === 0) {
    return anchors;
  }

  const embeddingGate = getRuntimeGate('embeddings');
  if (!embeddingGate.enabled) {
    throw new PileEmbeddingUnavailableError(embeddingGate.message, embeddingGate.code);
  }

  let embeddingService;
  try {
    embeddingService = createEmbeddingService(userId);
  } catch (error) {
    throw new PileEmbeddingUnavailableError(
      error instanceof Error ? error.message : 'Pile anchor embeddings are unavailable'
    );
  }

  for (const anchor of missing) {
    try {
      const result = await embeddingService.embedText(anchor.query);
      if (result.embedding.length === dimension) {
        anchors.push({ id: anchor.id, label: anchor.label, embedding: result.embedding });
      } else {
        logger.warn('pile anchor dimension mismatch', {
          anchor: anchor.id,
          expected: dimension,
          actual: result.embedding.length,
        });
      }
    } catch (error) {
      throw new PileEmbeddingUnavailableError(
        error instanceof Error ? error.message : 'Pile anchor embedding failed'
      );
    }
  }

  if (anchors.length === 0) {
    throw new PileEmbeddingUnavailableError('No pile anchor embeddings matched asset dimensions');
  }

  return anchors;
}

function parseVectorText(value: string): number[] {
  const trimmed = value.trim();
  const body = trimmed.startsWith('[') && trimmed.endsWith(']')
    ? trimmed.slice(1, -1)
    : trimmed;
  if (!body) return [];

  return body
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return [];
  }
  return vector.map((value) => value / magnitude);
}

function cosine(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let score = 0;
  for (let i = 0; i < length; i++) {
    score += a[i] * b[i];
  }
  return score;
}

function centroidFor(vectors: number[][]): number[] {
  const dimension = Math.max(0, ...vectors.map((vector) => vector.length));
  if (dimension === 0 || vectors.length === 0) return [];

  const centroid = new Array(dimension).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < Math.min(dimension, vector.length); i++) {
      centroid[i] += vector[i];
    }
  }
  return centroid.map((value) => value / vectors.length);
}

function nearestAnchor(centroid: number[], anchors: PileAnchorEmbedding[]): PileAnchorEmbedding | null {
  const normalizedCentroid = normalize(centroid);
  if (normalizedCentroid.length === 0) return null;

  return anchors.reduce<PileAnchorEmbedding | null>((best, anchor) => {
    if (!best) return anchor;
    const score = cosine(normalizedCentroid, anchor.embedding);
    const bestScore = cosine(normalizedCentroid, best.embedding);
    return score > bestScore || (score === bestScore && anchor.label < best.label) ? anchor : best;
  }, null);
}

function compareAssetsForPile(a: EmbeddedPileAsset, b: EmbeddedPileAsset): number {
  if (a.favorite !== b.favorite) {
    return a.favorite ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

function toThumbnailAsset(asset: EmbeddedPileAsset): SemanticPileThumbnailAsset {
  const normalized = normalizeAssetToGridDto({ ...asset, embedding: null });

  return {
    id: normalized.id,
    blobUrl: normalized.blobUrl,
    thumbnailUrl: normalized.thumbnailUrl ?? null,
    pathname: normalized.pathname,
    filename: normalized.filename,
    mime: normalized.mime,
    favorite: normalized.favorite,
  };
}

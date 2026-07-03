import sharp from 'sharp';
import { logger } from '@/lib/logger';

export interface NearDuplicateAsset {
  id: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  pathname: string;
  mime: string;
  phash: string;
  distance: number;
  createdAt: Date;
}

export interface PerceptualHashResult {
  phash: string | null;
  nearDuplicate: NearDuplicateAsset | null;
}

const DHASH_WIDTH = 9;
const DHASH_HEIGHT = 8;
export const DEFAULT_NEAR_DUPLICATE_DISTANCE = 10;

export class PerceptualHashService {
  constructor(private readonly nearDuplicateDistance = DEFAULT_NEAR_DUPLICATE_DISTANCE) {}

  async inspect(userId: string, buffer: Buffer): Promise<PerceptualHashResult> {
    const phash = await this.computeDhash(buffer);
    if (!phash) {
      return { phash: null, nearDuplicate: null };
    }

    const nearDuplicate = await this.findNearest(userId, phash);
    return { phash, nearDuplicate };
  }

  async computeDhash(buffer: Buffer): Promise<string | null> {
    try {
      const { data } = await sharp(buffer, { animated: false })
        .resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      let bits = '';
      for (let y = 0; y < DHASH_HEIGHT; y++) {
        for (let x = 0; x < DHASH_WIDTH - 1; x++) {
          const left = data[y * DHASH_WIDTH + x];
          const right = data[y * DHASH_WIDTH + x + 1];
          bits += left > right ? '1' : '0';
        }
      }

      return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
    } catch (error) {
      logger.warn('Failed to compute perceptual hash', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async findNearest(userId: string, phash: string): Promise<NearDuplicateAsset | null> {
    const { prisma } = await import('@/lib/db');
    if (!prisma) {
      logger.warn('Database not configured, skipping perceptual duplicate check');
      return null;
    }

    try {
      const candidates = await prisma.asset.findMany({
        where: {
          ownerUserId: userId,
          deletedAt: null,
          phash: { not: null },
        },
        select: {
          id: true,
          blobUrl: true,
          thumbnailUrl: true,
          pathname: true,
          mime: true,
          phash: true,
          createdAt: true,
        },
      });

      let nearest: NearDuplicateAsset | null = null;
      for (const candidate of candidates) {
        if (!candidate.phash) continue;
        const distance = hammingDistanceHex(phash, candidate.phash);
        if (distance > this.nearDuplicateDistance) continue;
        if (!nearest || distance < nearest.distance) {
          nearest = {
            ...candidate,
            phash: candidate.phash,
            distance,
          };
        }
      }

      return nearest;
    } catch (error) {
      logger.error('Error checking perceptual duplicates', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

export function hammingDistanceHex(left: string, right: string): number {
  const leftValue = BigInt(`0x${left}`);
  const rightValue = BigInt(`0x${right}`);
  let diff = leftValue ^ rightValue;
  let distance = 0;
  const zero = BigInt(0);
  const one = BigInt(1);

  while (diff > zero) {
    distance += Number(diff & one);
    diff >>= one;
  }

  return distance;
}

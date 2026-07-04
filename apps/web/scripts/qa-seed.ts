/**
 * One-command design QA seed.
 *
 * Provisions a deterministic QA user plus renderable asset fixtures against a
 * local database, without touching the blob_url CHECK constraints. Asset rows
 * point at the reserved QA_SEED_BLOB_HOST (constraint-compliant); the bytes
 * live in public/qa-blob-seed/ and the QA image loader maps the host back to
 * that path when SPLOOT_QA_AUTH_MODE=enabled (see lib/qa/qa-image-loader.ts).
 *
 * Usage (from apps/web, with DATABASE_URL pointing at local postgres):
 *   pnpm qa:seed                 # seed default user + 24 assets
 *   pnpm qa:seed --teardown      # remove everything the seed created
 *   pnpm qa:seed --user-id my-qa-user --count 36
 *
 * Refuses to run unless DATABASE_URL targets localhost/127.0.0.1
 * (override at your own risk with SPLOOT_QA_SEED_FORCE=1).
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { Prisma, PrismaClient } from '@prisma/client';
import { EMBEDDING_DIMENSION } from '@sploot/common';
import sharp from 'sharp';
import { QA_SEED_BLOB_HOST } from '../lib/qa/qa-image-loader';
import { generateImagePoster } from '../lib/image-processing';
import { extractVideoPoster } from '../lib/video-processing';
import { CLIP_MODEL } from '../lib/embeddings';
import { getCacheService } from '../lib/cache';
import { PILE_ANCHORS } from '../lib/piles/semantic-piles';
import { embeddingVectorSql } from '../lib/embedding-vector-sql';

const SEED_DIR = join(process.cwd(), 'public', 'qa-blob-seed');
const DEFAULT_USER_ID = 'qa-design-user';
const DEFAULT_COUNT = 24;
const QA_EMBEDDING_DIM = EMBEDDING_DIMENSION;
const execFileAsync = promisify(execFile);

const PALETTE = [
  { bg: '#0891B2', fg: '#FAFAF7' }, // cyan
  { bg: '#FF6B5D', fg: '#111110' }, // coral
  { bg: '#8B5CF6', fg: '#FAFAF7' }, // violet
  { bg: '#D7FF3F', fg: '#111110' }, // lime
  { bg: '#111110', fg: '#FAFAF7' }, // ink
  { bg: '#FAF6EE', fg: '#111110' }, // paper
];

const ASPECTS: Array<[number, number]> = [
  [800, 800],
  [800, 1000],
  [900, 1200],
  [1280, 720],
  [720, 1280],
  [1280, 1600],
];

function parseArgs(argv: string[]) {
  const args = { teardown: false, userId: DEFAULT_USER_ID, count: DEFAULT_COUNT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--teardown') args.teardown = true;
    if (argv[i] === '--user-id' && argv[i + 1]) args.userId = argv[++i];
    if (argv[i] === '--count' && argv[i + 1]) args.count = Number(argv[++i]);
  }
  if (!Number.isInteger(args.count) || args.count < 1 || args.count > 500) {
    throw new Error(`--count must be an integer between 1 and 500, got ${args.count}`);
  }
  return args;
}

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required (point it at local postgres)');
  }
  const host = new URL(url).hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal && process.env.SPLOOT_QA_SEED_FORCE !== '1') {
    throw new Error(
      `Refusing to seed non-local database host "${host}". Set SPLOOT_QA_SEED_FORCE=1 to override.`
    );
  }
}

interface RenderedFixture {
  filename: string;
  buffer: Buffer;
  width: number;
  height: number;
  mime: string;
  thumbnail?: {
    filename: string;
    buffer: Buffer;
  };
}

async function renderFixture(index: number): Promise<RenderedFixture> {
  if (index === 0) {
    return await renderAnimatedGifFixture(index);
  }

  if (index === 1) {
    return await renderVideoFixture(index);
  }

  const [width, height] = ASPECTS[index % ASPECTS.length];
  const { bg, fg } = PALETTE[index % PALETTE.length];
  const label = `MEME ${String(index + 1).padStart(2, '0')}`;
  const fontSize = Math.round(Math.min(width, height) / 6);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="none" stroke="${fg}" stroke-width="4"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
      font-family="monospace" font-weight="bold" font-size="${fontSize}" fill="${fg}">${label}</text>
    <text x="50%" y="${height - 40}" text-anchor="middle"
      font-family="monospace" font-size="${Math.round(fontSize / 3)}" fill="${fg}">${width}x${height} · qa seed</text>
  </svg>`;

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    filename: `qa-meme-${String(index + 1).padStart(3, '0')}.png`,
    buffer,
    width,
    height,
    mime: 'image/png',
  };
}

async function renderAnimatedGifFixture(index: number): Promise<RenderedFixture> {
  const filename = `qa-meme-${String(index + 1).padStart(3, '0')}.gif`;
  const filePath = join(SEED_DIR, filename);
  await execFileAsync(ffmpeg.path, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x180:d=1',
    '-vf',
    'fps=6',
    '-loop',
    '0',
    filePath,
  ]);

  const buffer = await readFile(filePath);
  const poster = await generateImagePoster(buffer);

  return {
    filename,
    buffer,
    width: 320,
    height: 180,
    mime: 'image/gif',
    thumbnail: {
      filename: `qa-meme-${String(index + 1).padStart(3, '0')}-poster.jpg`,
      buffer: poster.buffer,
    },
  };
}

async function renderVideoFixture(index: number): Promise<RenderedFixture> {
  const filename = `qa-meme-${String(index + 1).padStart(3, '0')}.mp4`;
  const filePath = join(SEED_DIR, filename);
  await execFileAsync(ffmpeg.path, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x180:d=1',
    '-pix_fmt',
    'yuv420p',
    filePath,
  ]);

  const buffer = await readFile(filePath);
  const poster = await extractVideoPoster(buffer, 'video/mp4');

  return {
    filename,
    buffer,
    width: poster.width,
    height: poster.height,
    mime: 'video/mp4',
    thumbnail: {
      filename: `qa-meme-${String(index + 1).padStart(3, '0')}-poster.jpg`,
      buffer: poster.buffer,
    },
  };
}

async function seed(prisma: PrismaClient, userId: string, count: number) {
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${userId}@qa.local` },
  });

  await mkdir(SEED_DIR, { recursive: true });

  for (let i = 0; i < count; i++) {
    const { filename, buffer, width, height, mime, thumbnail } = await renderFixture(i);
    await writeFile(join(SEED_DIR, filename), buffer);
    if (thumbnail) {
      await writeFile(join(SEED_DIR, thumbnail.filename), thumbnail.buffer);
    }

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const blobUrl = `${QA_SEED_BLOB_HOST}/qa-blob-seed/${filename}`;
    const thumbnailUrl = thumbnail
      ? `${QA_SEED_BLOB_HOST}/qa-blob-seed/${thumbnail.filename}`
      : null;

    const asset = await prisma.asset.upsert({
      where: { unique_user_checksum: { ownerUserId: userId, checksumSha256: checksum } },
      update: { deletedAt: null },
      create: {
        ownerUserId: userId,
        blobUrl,
        thumbnailUrl,
        pathname: `qa-blob-seed/${filename}`,
        thumbnailPath: thumbnail ? `qa-blob-seed/${thumbnail.filename}` : null,
        mime,
        width,
        height,
        size: buffer.byteLength,
        checksumSha256: checksum,
        favorite: i % 5 === 0,
      },
    });

    await seedAssetEmbedding(prisma, asset.id, i);
  }

  await seedPileAnchorEmbeddings();

  console.log(`Seeded ${count} assets for user "${userId}" (including GIF/video fixtures when count >= 2).`);
  console.log(`Seeded deterministic ${QA_EMBEDDING_DIM}d embeddings for automatic piles.`);
  console.log(`Media in public/qa-blob-seed/; rows point at ${QA_SEED_BLOB_HOST}.`);
  console.log('Run the dev server with SPLOOT_QA_AUTH_MODE=enabled so the QA image loader is active.');
}

async function seedAssetEmbedding(prisma: PrismaClient, assetId: string, index: number) {
  const embedding = qaEmbeddingForIndex(index);
  const vectorSql = embeddingVectorSql(embedding, 'qa seed asset embedding');

  await prisma.$queryRaw(Prisma.sql`
    INSERT INTO "asset_embeddings" (
      "asset_id",
      "model_name",
      "model_version",
      "dim",
      "image_embedding",
      "status",
      "error",
      "completedAt",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${assetId},
      ${CLIP_MODEL},
      ${CLIP_MODEL},
      ${QA_EMBEDDING_DIM},
      ${vectorSql},
      'ready',
      NULL,
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT ("asset_id") DO UPDATE SET
      "model_name" = EXCLUDED."model_name",
      "model_version" = EXCLUDED."model_version",
      "dim" = EXCLUDED."dim",
      "image_embedding" = EXCLUDED."image_embedding",
      "status" = 'ready',
      "error" = NULL,
      "completedAt" = NOW(),
      "updatedAt" = NOW()
    RETURNING "asset_id";
  `);
}

async function seedPileAnchorEmbeddings() {
  const cache = getCacheService();
  await Promise.all(
    PILE_ANCHORS.map((anchor, index) =>
      cache.setTextEmbedding(anchor.query, qaAnchorEmbedding(index), CLIP_MODEL)
    )
  );
}

function qaEmbeddingForIndex(index: number): number[] {
  const anchorIndex = index % Math.min(PILE_ANCHORS.length, 6);
  const vector = qaAnchorEmbedding(anchorIndex);
  // Add a tiny deterministic offset so rows are not identical while preserving
  // nearest-anchor grouping.
  vector[(anchorIndex + 17) % QA_EMBEDDING_DIM] = ((index % 7) + 1) / 100;
  return vector;
}

function qaAnchorEmbedding(index: number): number[] {
  const vector = new Array(QA_EMBEDDING_DIM).fill(0);
  vector[index % QA_EMBEDDING_DIM] = 1;
  return vector;
}

async function teardown(prisma: PrismaClient, userId: string) {
  // User delete cascades to assets, embeddings, tags, and quota rows.
  await prisma.user.deleteMany({ where: { id: userId } });
  await rm(SEED_DIR, { recursive: true, force: true });
  console.log(`Removed QA user "${userId}", their assets, and public/qa-blob-seed/.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertLocalDatabase();

  const prisma = new PrismaClient();
  try {
    if (args.teardown) {
      await teardown(prisma, args.userId);
    } else {
      await seed(prisma, args.userId, args.count);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

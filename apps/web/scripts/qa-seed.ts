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
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { QA_SEED_BLOB_HOST } from '../lib/qa/qa-image-loader';

const SEED_DIR = join(process.cwd(), 'public', 'qa-blob-seed');
const DEFAULT_USER_ID = 'qa-design-user';
const DEFAULT_COUNT = 24;

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

async function renderFixture(index: number): Promise<{ buffer: Buffer; width: number; height: number }> {
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
  return { buffer, width, height };
}

async function seed(prisma: PrismaClient, userId: string, count: number) {
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${userId}@qa.local` },
  });

  await mkdir(SEED_DIR, { recursive: true });

  for (let i = 0; i < count; i++) {
    const { buffer, width, height } = await renderFixture(i);
    const filename = `qa-meme-${String(i + 1).padStart(3, '0')}.png`;
    await writeFile(join(SEED_DIR, filename), buffer);

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const blobUrl = `${QA_SEED_BLOB_HOST}/qa-blob-seed/${filename}`;

    await prisma.asset.upsert({
      where: { unique_user_checksum: { ownerUserId: userId, checksumSha256: checksum } },
      update: { deletedAt: null },
      create: {
        ownerUserId: userId,
        blobUrl,
        pathname: `qa-blob-seed/${filename}`,
        mime: 'image/png',
        width,
        height,
        size: buffer.byteLength,
        checksumSha256: checksum,
        favorite: i % 5 === 0,
      },
    });
  }

  console.log(`Seeded ${count} assets for user "${userId}".`);
  console.log(`Images in public/qa-blob-seed/; rows point at ${QA_SEED_BLOB_HOST}.`);
  console.log('Run the dev server with SPLOOT_QA_AUTH_MODE=enabled so the QA image loader is active.');
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

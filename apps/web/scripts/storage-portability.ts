import { readFile, writeFile } from 'node:fs/promises';
import { prisma } from '../lib/db';
import { storageConfigFromEnv, type StorageConfig } from '../lib/storage/config';
import { type MigrationManifestEntry } from '../lib/storage/migration';
import { rollbackPrismaMigrationBatch, runPrismaMigrationBatch, seedMigrationManifest, storageMigrationReceipt } from '../lib/storage/prisma-journal';
import { S3CompatibleObjectStore, VercelObjectStore } from '../lib/storage/object-store';

const MAX_BATCH = 100;

function usage(): never {
  console.error('Usage: storage-portability.ts inventory [--limit N] | verify --manifest FILE --receipt FILE | rollback --manifest FILE --receipt FILE');
  process.exit(2);
}

function value(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  const result = index >= 0 ? args[index + 1] : undefined;
  if (!result) usage();
  return result;
}

function configForTarget(): StorageConfig {
  const config = storageConfigFromEnv();
  if (config.provider !== 's3') throw new Error('A migration target requires STORAGE_PROVIDER=s3');
  return config;
}

async function inventory(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH * 10) throw new Error(`Inventory limit must be 1-${MAX_BATCH * 10}`);
  const assets = await prisma.asset.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    take: limit,
    select: {
      id: true,
      storageKey: true,
      pathname: true,
      thumbnailStorageKey: true,
      thumbnailPath: true,
      size: true,
      checksumSha256: true,
      storageSize: true,
      storageSha256: true,
      thumbnailStorageSize: true,
      thumbnailStorageSha256: true,
      mime: true,
    },
  });
  const manifest: MigrationManifestEntry[] = [];
  for (const asset of assets) {
    if (!asset.storageSha256 || asset.storageSize === null) {
      throw new Error(`Missing source byte manifest for asset ${asset.id}; inventory must hash the active object before migration`);
    }
    manifest.push({
      logicalKey: asset.storageKey ?? asset.pathname,
      sourceKey: asset.storageKey ?? asset.pathname,
      size: asset.storageSize,
      sha256: asset.storageSha256,
      contentType: asset.mime,
    });
    const thumbnailKey = asset.thumbnailStorageKey ?? asset.thumbnailPath;
    if (thumbnailKey) {
      if (!asset.thumbnailStorageSha256 || asset.thumbnailStorageSize === null) {
        throw new Error(`Missing thumbnail byte manifest for asset ${asset.id}; inventory must hash the active thumbnail before migration`);
      }
      manifest.push({
        logicalKey: thumbnailKey,
        sourceKey: thumbnailKey,
        size: asset.thumbnailStorageSize,
        sha256: asset.thumbnailStorageSha256,
        contentType: asset.mime,
      });
    }
  }
  process.stdout.write(JSON.stringify(manifest) + '\n');
}

async function run(command: 'verify' | 'rollback', args: string[]) {
  if (process.env.STORAGE_MIGRATION_CONFIRM !== 'sploot-blob-portability') {
    throw new Error('Refusing mutating provider operation: set STORAGE_MIGRATION_CONFIRM=sploot-blob-portability explicitly');
  }
  const config = configForTarget();
  const manifest = JSON.parse(await readFile(value(args, '--manifest'), 'utf8')) as MigrationManifestEntry[];
  const source = new VercelObjectStore(config.legacyBaseUrl);
  const target = new S3CompatibleObjectStore(config);
  const workerId = `storage-portability-${process.pid}`;
  await seedMigrationManifest(prisma, manifest, { source: 'vercel', target: 's3' });
  if (command === 'verify') {
    while (true) {
      const receipt = await runPrismaMigrationBatch(prisma, { source, target, workerId, limit: MAX_BATCH, maxAttempts: 3 });
      const active = receipt.entries.some(entry => entry.status === 'pending' || (entry.status === 'failed' && entry.attempts < 3));
      if (!active) break;
    }
  } else {
    while ((await storageMigrationReceipt(prisma)).entries.some(entry => entry.status === 'verified')) {
      await rollbackPrismaMigrationBatch(prisma, { source, target, workerId, limit: MAX_BATCH });
    }
  }
  await writeFile(value(args, '--receipt'), JSON.stringify(await storageMigrationReceipt(prisma), null, 2) + '\n', 'utf8');
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'inventory') await inventory(Number(args[args.indexOf('--limit') + 1] ?? 1000));
  else if (command === 'verify' || command === 'rollback') await run(command, args);
  else usage();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { storageConfigFromEnv, storageConfigFingerprint, type StorageConfig } from '../lib/storage/config';
import { type MigrationManifestEntry } from '../lib/storage/migration';
import { rollbackPrismaMigrationBatch, runPrismaMigrationBatch, seedMigrationManifest, storageMigrationReceipt } from '../lib/storage/prisma-journal';
import { S3CompatibleObjectStore, VercelObjectStore, bodyToBuffer } from '../lib/storage/object-store';

const MAX_BATCH = 100;
const INVENTORY_ID = 'legacy-assets';
const OPERATOR_ROLES = new Set(['sploot_stripe_schema_migrator', 'sploot_storage_operator']);

async function requireOperatorAuthority(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ sessionUser: string; isSuperuser: boolean }>>(Prisma.sql`SELECT current_user AS "sessionUser", rolsuper AS "isSuperuser" FROM pg_roles WHERE rolname = current_user`);
  const authority = rows[0];
  if (!authority || (!OPERATOR_ROLES.has(authority.sessionUser) && !authority.isSuperuser)) throw new Error('Storage portability requires DATABASE_URL owned by the schema-migrator/operator authority');
}

function manifestSha256(manifest: MigrationManifestEntry[]): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

async function recordInventoryFailure(assetId: string, error: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "storage_inventory_failures" ("asset_id", "kind", "error", "attempts", "updated_at") VALUES (${assetId}, 'asset', ${error}, 1, NOW()) ON CONFLICT ("asset_id", "kind") DO UPDATE SET "error" = EXCLUDED."error", "attempts" = "storage_inventory_failures"."attempts" + 1, "updated_at" = NOW()`);
}


function usage(): never {
  console.error('Usage: storage-portability.ts inventory [--limit N] [--cursor ID] | verify --manifest FILE --receipt FILE | rollback --manifest FILE --receipt FILE');
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

async function inventory(limit: number, cursor?: string) {
  await requireOperatorAuthority();
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH * 10) throw new Error('Inventory limit must be 1-' + MAX_BATCH * 10);
  const config = storageConfigFromEnv();
  const fingerprint = storageConfigFingerprint(config);
  const source = new VercelObjectStore(config.legacyBaseUrl);
  const assets = await prisma.asset.findMany({ where: { deletedAt: null, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: limit, select: { id: true, storageKey: true, pathname: true, thumbnailStorageKey: true, thumbnailPath: true, thumbnailUrl: true, mime: true } });
  const manifest: MigrationManifestEntry[] = [];
  let failures = 0;
  for (const asset of assets) {
    try {
      const sourceKey = asset.storageKey ?? asset.pathname;
      const original = await source.get(sourceKey);
      const bytes = await bodyToBuffer(original.body, 512 * 1024 * 1024);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await prisma.asset.update({ where: { id: asset.id }, data: { storageProvider: 'vercel', storageKey: sourceKey, storageConfigFingerprint: fingerprint, storageSize: bytes.byteLength, storageSha256: sha256 } });
      manifest.push({ logicalKey: sourceKey, sourceKey, size: bytes.byteLength, sha256, contentType: asset.mime });
      const thumbnailKey = asset.thumbnailStorageKey ?? asset.thumbnailPath;
      if (thumbnailKey && asset.thumbnailUrl) {
        const thumbnail = await source.get(thumbnailKey);
        const thumbBytes = await bodyToBuffer(thumbnail.body, 512 * 1024 * 1024);
        const thumbSha = createHash('sha256').update(thumbBytes).digest('hex');
        await prisma.asset.update({ where: { id: asset.id }, data: { thumbnailStorageKey: thumbnailKey, thumbnailStorageSize: thumbBytes.byteLength, thumbnailStorageSha256: thumbSha } });
        manifest.push({ logicalKey: thumbnailKey, sourceKey: thumbnailKey, size: thumbBytes.byteLength, sha256: thumbSha, contentType: asset.mime });
      }
      await prisma.storageInventoryState.upsert({ where: { id: INVENTORY_ID }, update: { cursor: asset.id, providerFingerprint: fingerprint, lastError: null }, create: { id: INVENTORY_ID, cursor: asset.id, providerFingerprint: fingerprint, updatedAt: new Date() } });
    } catch (error) {
      failures++;
      const message = error instanceof Error ? error.message : String(error);
      await recordInventoryFailure(asset.id, message);
      await prisma.storageInventoryState.upsert({ where: { id: INVENTORY_ID }, update: { cursor: asset.id, providerFingerprint: fingerprint, lastError: message }, create: { id: INVENTORY_ID, cursor: asset.id, providerFingerprint: fingerprint, lastError: message, updatedAt: new Date() } });
    }
  }
  if (failures > 0) throw new Error('Inventory parity failed for ' + failures + ' asset(s); resume from the recorded cursor after repairing source objects');
  process.stdout.write(JSON.stringify(manifest) + '\n');
}
async function ensureCutoverState(config: StorageConfig, digest: string, phase: 'dual-write' | 'rollback'): Promise<void> {
  const fingerprint = storageConfigFingerprint(config);
  const existing = await prisma.storageCutoverState.findUnique({ where: { id: 'default' } });
  if (existing && (existing.providerFingerprint !== fingerprint || existing.manifestSha256 !== digest)) throw new Error('Storage cutover state does not match provider configuration and manifest');
  if (!existing) await prisma.storageCutoverState.create({ data: { id: 'default', phase, providerFingerprint: fingerprint, manifestSha256: digest, updatedAt: new Date() } });
}

async function run(command: 'verify' | 'rollback', args: string[]) {
  await requireOperatorAuthority();
  if (process.env.STORAGE_MIGRATION_CONFIRM !== 'sploot-blob-portability') {
    throw new Error('Refusing mutating provider operation: set STORAGE_MIGRATION_CONFIRM=sploot-blob-portability explicitly');
  }
  const config = configForTarget();
  const manifest = JSON.parse(await readFile(value(args, '--manifest'), 'utf8')) as MigrationManifestEntry[];
  const digest = manifestSha256(manifest);
  if (config.manifestSha256 !== digest) throw new Error('Manifest SHA-256 does not match STORAGE_CUTOVER_MANIFEST_SHA256');
  await ensureCutoverState(config, digest, command === 'rollback' ? 'rollback' : 'dual-write');
  const source = new VercelObjectStore(config.legacyBaseUrl);
  const target = new S3CompatibleObjectStore(config);
  const workerId = `storage-portability-${process.pid}`;
  await seedMigrationManifest(prisma, manifest, { source: 'vercel', target: 's3' });
  if (command === 'verify') {
    while (true) {
      const receipt = await runPrismaMigrationBatch(prisma, { source, target, workerId, limit: MAX_BATCH, maxAttempts: 3 });
      const active = receipt.entries.some(entry => entry.status === 'pending' || entry.status === 'copying' || (entry.status === 'failed' && entry.attempts < 3));
      if (!active) break;
    }
  } else {
    while (true) {
      const receipt = await storageMigrationReceipt(prisma);
      const now = Date.now();
      const ready = receipt.entries.some(entry => (
        entry.status === 'verified'
        || (entry.status === 'copying' && entry.leaseExpiresAt !== null && entry.leaseExpiresAt.getTime() <= now)
      ));
      if (!ready) break;
      await rollbackPrismaMigrationBatch(prisma, { source, target, workerId, limit: MAX_BATCH });
    }
  }
  const finalReceipt = await storageMigrationReceipt(prisma);
  await writeFile(value(args, '--receipt'), JSON.stringify(finalReceipt, null, 2) + '\n', 'utf8');
  const incomplete = finalReceipt.entries.some(entry => entry.status !== (command === 'rollback' ? 'rolled_back' : 'verified'));
  if (incomplete) throw new Error('Storage ' + command + ' parity failed: ' + JSON.stringify(finalReceipt.counts));
  await prisma.storageCutoverState.update({ where: { id: 'default' }, data: command === 'verify' ? { phase: 'target', verifiedAt: new Date() } : { phase: 'rollback', rollbackAt: new Date() } });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'inventory') await inventory(Number(args[args.indexOf('--limit') + 1] ?? 1000), args.includes('--cursor') ? value(args, '--cursor') : undefined);
  else if (command === 'verify' || command === 'rollback') await run(command, args);
  else usage();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

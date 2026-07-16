import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { isValidMimeType, normalizeMimeType } from '@sploot/common';
import { prisma } from '../lib/db';
import { assertCutoverTransition, canonicalLogicalKey, storageConfigFromEnv, storageConfigFingerprint, type StorageConfig } from '../lib/storage/config';
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

export function manifestSha256(manifest: MigrationManifestEntry[]): string {
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

export function inventoryLogicalKey(assetId: string, sourceKey: string, kind: 'original' | 'thumbnail'): string {
  try { return canonicalLogicalKey(sourceKey); } catch {
    const digest = createHash('sha256').update(sourceKey).digest('hex').slice(0, 24);
    return `legacy/${assetId}/${kind}-${digest}`;
  }
}

export function renditionMime(key: string, bytes: Buffer, reported?: string, fallback?: string): string | undefined {
  const normalized = reported ? normalizeMimeType(reported) : '';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (normalized && isValidMimeType(normalized)) return normalized;
  const extension = key.toLowerCase().split('.').pop();
  const byExtension: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' };
  return byExtension[extension ?? ''] ?? (fallback && isValidMimeType(fallback) ? normalizeMimeType(fallback) : undefined);
}

async function inventory(limit: number, cursor?: string) {
  await requireOperatorAuthority();
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH) throw new Error('Inventory batch size must be 1-' + MAX_BATCH);
  const config = storageConfigFromEnv();
  const fingerprint = storageConfigFingerprint(config);
  const source = new VercelObjectStore(config.legacyBaseUrl);
  const manifest: MigrationManifestEntry[] = [];
  let failures = 0;
  let nextCursor = cursor;
  while (true) {
    const assets = await prisma.asset.findMany({ where: { deletedAt: null, ...(nextCursor ? { id: { gt: nextCursor } } : {}) }, orderBy: { id: 'asc' }, take: limit, select: { id: true, storageKey: true, storageSourceKey: true, pathname: true, thumbnailStorageKey: true, thumbnailStorageSourceKey: true, thumbnailPath: true, thumbnailUrl: true, mime: true } });
    if (assets.length === 0) break;
    for (const asset of assets) {
      try {
        const sourceKey = asset.storageSourceKey ?? asset.storageKey ?? asset.pathname;
        const original = await source.getSourceKey(sourceKey);
        const bytes = await bodyToBuffer(original.body, 512 * 1024 * 1024);
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const logicalKey = inventoryLogicalKey(asset.id, sourceKey, 'original');
        await prisma.asset.update({ where: { id: asset.id }, data: { storageProvider: 'vercel', storageKey: logicalKey, storageSourceKey: sourceKey, storageConfigFingerprint: fingerprint, storageSize: bytes.byteLength, storageSha256: sha256 } });
        const originalEntry = { logicalKey, sourceKey, size: bytes.byteLength, sha256, contentType: renditionMime(sourceKey, bytes, original.metadata.contentType, asset.mime) };
        manifest.push(originalEntry);
        await seedMigrationManifest(prisma, [originalEntry], { source: 'vercel', target: 's3' });
        const thumbnailKey = asset.thumbnailStorageSourceKey ?? asset.thumbnailStorageKey ?? asset.thumbnailPath;
        if (thumbnailKey && (asset.thumbnailUrl || asset.thumbnailStorageKey)) {
          const thumbnail = await source.getSourceKey(thumbnailKey);
          const thumbBytes = await bodyToBuffer(thumbnail.body, 512 * 1024 * 1024);
          const thumbSha = createHash('sha256').update(thumbBytes).digest('hex');
          const thumbLogicalKey = inventoryLogicalKey(asset.id, thumbnailKey, 'thumbnail');
          await prisma.asset.update({ where: { id: asset.id }, data: { thumbnailStorageKey: thumbLogicalKey, thumbnailStorageSourceKey: thumbnailKey, thumbnailStorageSize: thumbBytes.byteLength, thumbnailStorageSha256: thumbSha } });
          const thumbnailEntry = { logicalKey: thumbLogicalKey, sourceKey: thumbnailKey, size: thumbBytes.byteLength, sha256: thumbSha, contentType: renditionMime(thumbnailKey, thumbBytes, thumbnail.metadata.contentType) };
          manifest.push(thumbnailEntry);
          await seedMigrationManifest(prisma, [thumbnailEntry], { source: 'vercel', target: 's3' });
        }
        nextCursor = asset.id;
        await prisma.storageInventoryState.upsert({ where: { id: INVENTORY_ID }, update: { cursor: asset.id, providerFingerprint: fingerprint, lastError: null }, create: { id: INVENTORY_ID, cursor: asset.id, providerFingerprint: fingerprint, updatedAt: new Date() } });
      } catch (error) {
        failures++;
        const message = error instanceof Error ? error.message : String(error);
        await recordInventoryFailure(asset.id, message);
        await prisma.storageInventoryState.upsert({ where: { id: INVENTORY_ID }, update: { providerFingerprint: fingerprint, lastError: message }, create: { id: INVENTORY_ID, cursor: nextCursor, providerFingerprint: fingerprint, lastError: message, updatedAt: new Date() } });
        break;
      }
    }
    if (failures > 0) break;
    if (assets.length < limit) break;
  }
  if (failures > 0) throw new Error('Inventory parity failed for ' + failures + ' asset(s); resume from the recorded cursor after repairing source objects');
  const durableManifest = await prisma.storageMigrationEntry.findMany({ orderBy: { logicalKey: 'asc' }, select: { logicalKey: true, sourceKey: true, size: true, sha256: true, contentType: true } });
  process.stdout.write(JSON.stringify(durableManifest) + '\n');
}
async function ensureCutoverState(config: StorageConfig, digest: string, phase: 'dual-write' | 'rollback'): Promise<void> {
  const fingerprint = storageConfigFingerprint(config);
  const existing = await prisma.storageCutoverState.findUnique({ where: { id: 'default' } });
  if (existing && (existing.providerFingerprint !== fingerprint || existing.manifestSha256 !== digest)) throw new Error('Storage cutover state does not match provider configuration and manifest');
  if (!existing) {
    await prisma.storageCutoverState.create({ data: { id: 'default', phase, providerFingerprint: fingerprint, manifestSha256: digest, updatedAt: new Date() } });
    return;
  }
  if (existing.phase !== phase) {
    assertCutoverTransition(existing.phase as StorageConfig['phase'], phase);
    await prisma.storageCutoverState.update({ where: { id: 'default' }, data: { phase, updatedAt: new Date() } });
  }
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
  if (command === 'inventory') await inventory(Number(args[args.indexOf('--limit') + 1] ?? MAX_BATCH), args.includes('--cursor') ? value(args, '--cursor') : undefined);
  else if (command === 'verify' || command === 'rollback') await run(command, args);
  else usage();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

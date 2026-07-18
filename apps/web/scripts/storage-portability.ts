import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { isValidMimeType, normalizeMimeType } from '@sploot/common';
import { prisma } from '../lib/db';
import { assertCutoverTransition, canonicalLogicalKey, stableDeliveryUrl, storageConfigFromEnv, storageConfigFingerprint, type StorageConfig } from '../lib/storage/config';
import { type MigrationManifestEntry } from '../lib/storage/migration';
import { rollbackPrismaMigrationBatch, runPrismaMigrationBatch, seedMigrationManifest, storageMigrationReceipt } from '../lib/storage/prisma-journal';
import { S3CompatibleObjectStore, VercelObjectStore, bodyToBuffer } from '../lib/storage/object-store';
import { processStorageCleanup } from '../lib/storage/cleanup-outbox';

const MAX_BATCH = 100;
const INVENTORY_ID = 'legacy-assets';
const OPERATOR_ROLES = new Set(['sploot_stripe_schema_migrator', 'sploot_storage_operator']);

async function requireOperatorAuthority(database: PrismaClient = prisma): Promise<void> {
  const rows = await database.$queryRaw<Array<{ sessionUser: string; isSuperuser: boolean }>>(Prisma.sql`SELECT current_user AS "sessionUser", rolsuper AS "isSuperuser" FROM pg_roles WHERE rolname = current_user`);
  const authority = rows[0];
  if (!authority || (!OPERATOR_ROLES.has(authority.sessionUser) && !authority.isSuperuser)) throw new Error('Storage portability requires DATABASE_URL owned by the schema-migrator/operator authority');
}

export function manifestSha256(manifest: MigrationManifestEntry[]): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

async function recordInventoryFailure(database: PrismaClient, assetId: string, error: string): Promise<void> {
  await database.$executeRaw(Prisma.sql`INSERT INTO "storage_inventory_failures" ("asset_id", "kind", "error", "attempts", "updated_at") VALUES (${assetId}, 'asset', ${error}, 1, NOW()) ON CONFLICT ("asset_id", "kind") DO UPDATE SET "error" = EXCLUDED."error", "attempts" = "storage_inventory_failures"."attempts" + 1, "updated_at" = NOW()`);
}


function usage(): never {
  console.error('Usage: storage-portability.ts inventory [--limit N] [--cursor ID] | verify --manifest FILE --receipt FILE | rollback --manifest FILE --receipt FILE | gc [--limit N]');
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

export async function inventory(limit: number, cursor?: string, database: PrismaClient = prisma): Promise<void> {
  await requireOperatorAuthority(database);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH) throw new Error('Inventory batch size must be 1-' + MAX_BATCH);
  // Captured before `cursor`/`nextCursor` are consulted below: only a call
  // that started with no cursor at all re-seeds every live asset from the
  // absolute beginning in one unbroken pass, which is the only case safe to
  // treat as complete/authoritative for pruning and full-manifest emission.
  const isFreshPass = cursor === undefined;
  const config = storageConfigFromEnv();
  const fingerprint = storageConfigFingerprint(config);
  const source = new VercelObjectStore(config.legacyBaseUrl);
  const manifest: MigrationManifestEntry[] = [];
  let failures = 0;
  let nextCursor = cursor;
  while (true) {
    const assets = await database.asset.findMany({ where: { deletedAt: null, ...(nextCursor ? { id: { gt: nextCursor } } : {}) }, orderBy: { id: 'asc' }, take: limit, select: { id: true, storageKey: true, storageSourceKey: true, pathname: true, thumbnailStorageKey: true, thumbnailStorageSourceKey: true, thumbnailPath: true, thumbnailUrl: true, mime: true } });
    if (assets.length === 0) break;
    for (const asset of assets) {
      try {
        const sourceKey = asset.storageSourceKey ?? asset.storageKey ?? asset.pathname;
        const original = await source.getSourceKey(sourceKey);
        const bytes = await bodyToBuffer(original.body, 512 * 1024 * 1024);
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const logicalKey = inventoryLogicalKey(asset.id, sourceKey, 'original');
        await database.asset.update({ where: { id: asset.id }, data: { storageKey: logicalKey, storageSourceKey: sourceKey, storageConfigFingerprint: fingerprint, storageSize: bytes.byteLength, storageSha256: sha256 }, select: { id: true } });
        const originalEntry = { logicalKey, sourceKey, rendition: 'original' as const, sourceProvider: 'vercel', size: bytes.byteLength, sha256, contentType: renditionMime(sourceKey, bytes, original.metadata.contentType, asset.mime) };
        manifest.push(originalEntry);
        await seedMigrationManifest(database, [originalEntry], { source: 'vercel', target: 's3' });
        const thumbnailKey = asset.thumbnailStorageSourceKey ?? asset.thumbnailStorageKey ?? asset.thumbnailPath;
        if (thumbnailKey && (asset.thumbnailUrl || asset.thumbnailStorageKey)) {
          const thumbnail = await source.getSourceKey(thumbnailKey);
          const thumbBytes = await bodyToBuffer(thumbnail.body, 512 * 1024 * 1024);
          const thumbSha = createHash('sha256').update(thumbBytes).digest('hex');
          const thumbLogicalKey = inventoryLogicalKey(asset.id, thumbnailKey, 'thumbnail');
          await database.asset.update({ where: { id: asset.id }, data: { thumbnailStorageKey: thumbLogicalKey, thumbnailStorageSourceKey: thumbnailKey, thumbnailStorageSize: thumbBytes.byteLength, thumbnailStorageSha256: thumbSha }, select: { id: true } });
          const thumbnailEntry = { logicalKey: thumbLogicalKey, sourceKey: thumbnailKey, rendition: 'thumbnail' as const, sourceProvider: 'vercel', size: thumbBytes.byteLength, sha256: thumbSha, contentType: renditionMime(thumbnailKey, thumbBytes, thumbnail.metadata.contentType) };
          manifest.push(thumbnailEntry);
          await seedMigrationManifest(database, [thumbnailEntry], { source: 'vercel', target: 's3' });
        }
        nextCursor = asset.id;
        await database.storageInventoryState.upsert({ where: { id: INVENTORY_ID }, update: { cursor: asset.id, providerFingerprint: fingerprint, lastError: null }, create: { id: INVENTORY_ID, cursor: asset.id, providerFingerprint: fingerprint, updatedAt: new Date() } });
      } catch (error) {
        failures++;
        const message = error instanceof Error ? error.message : String(error);
        await recordInventoryFailure(database, asset.id, message);
        await database.storageInventoryState.upsert({ where: { id: INVENTORY_ID }, update: { providerFingerprint: fingerprint, lastError: message }, create: { id: INVENTORY_ID, cursor: nextCursor, providerFingerprint: fingerprint, lastError: message, updatedAt: new Date() } });
        break;
      }
    }
    if (failures > 0) break;
    if (assets.length < limit) break;
  }
  if (failures > 0) throw new Error('Inventory parity failed for ' + failures + ' asset(s); resume from the recorded cursor after repairing source objects');
  if (isFreshPass) {
    // A full, uninterrupted pass above re-seeds every non-deleted asset's
    // current original/thumbnail keys, so it is now safe to prune whatever
    // no longer matches any live asset.
    await pruneStaleMigrationEntries(database);
    const durableManifest = await database.storageMigrationEntry.findMany({ orderBy: { logicalKey: 'asc' }, select: { logicalKey: true, sourceKey: true, rendition: true, sourceProvider: true, size: true, sha256: true, contentType: true } });
    process.stdout.write(JSON.stringify(durableManifest) + '\n');
    return;
  }
  // A cursor-resumed pass only re-seeds a SUFFIX of the live asset set — it
  // must never be trusted as a complete inventory. Pruning and the durable
  // full-manifest emission stay gated on a fresh, cursor-less pass that
  // re-visits every live asset from the very beginning in one unbroken run;
  // this run's output is explicitly non-authoritative.
  process.stderr.write('Inventory resumed from cursor ' + cursor + '; seeded ' + manifest.length + ' entr' + (manifest.length === 1 ? 'y' : 'ies') + ' through ' + (nextCursor ?? cursor) + '. Re-run inventory WITHOUT --cursor for a complete, prunable, authoritative manifest before verify.\n');
  process.stdout.write(JSON.stringify({ resumed: true, cursor: nextCursor ?? null, seeded: manifest.length }) + '\n');
}

/**
 * A never-claimed ('pending') migration-entry row that no longer matches any
 * live asset's *current* original/thumbnail keys is orphaned — most commonly
 * a thumbnail entry whose physical object was superseded by
 * regenerate-thumbnails after it was inventoried (the crop-fix cron rewrites
 * `thumbnail_storage_key`/`thumbnail_storage_source_key` and deletes the old
 * object independently of this ledger). Left in place, a later commitCutover
 * would fail closed for the whole batch on that single entry ("no matching
 * live asset"), even though every other entry is fine.
 *
 * Only callable by inventory(), after a full, uninterrupted pass has re-seeded
 * every live asset's current keys — otherwise an asset merely outside the
 * current page's cursor range would look orphaned and get pruned by mistake.
 * In-flight ('copying') and terminal ('verified'/'rolled_back') rows are
 * never touched: pruning only ever discards work nothing has started yet.
 */
export async function pruneStaleMigrationEntries(db: PrismaClient): Promise<number> {
  const result = await db.$executeRaw(Prisma.sql`
    DELETE FROM storage_migration_entries e
    WHERE e.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM assets a
        WHERE a.deleted_at IS NULL
          AND (
            (e.rendition = 'original' AND (a.storage_source_key = e.source_key OR a.storage_key = e.logical_key))
            OR (e.rendition = 'thumbnail' AND (a.thumbnail_storage_source_key = e.source_key OR a.thumbnail_storage_key = e.logical_key))
          )
      )
  `);
  return result;
}
async function ensureCutoverState(config: StorageConfig, digest: string, phase: 'dual-write' | 'target' | 'rollback'): Promise<void> {
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


export async function commitCutover(manifest: MigrationManifestEntry[], config: StorageConfig, digest: string, database: PrismaClient = prisma): Promise<void> {
  const fingerprint = storageConfigFingerprint(config);
  if (config.provider !== 's3') throw new Error('Storage cutover requires the S3 target provider');
  await database.$transaction(async (tx) => {
    const state = await tx.storageCutoverState.findUnique({ where: { id: 'default' } });
    if (!state || state.phase !== 'dual-write' || state.providerFingerprint !== fingerprint || state.manifestSha256 !== digest) throw new Error('Cutover fence mismatch; refusing asset rebinding');
    const generation = state.generation + 1;
    for (const entry of manifest) {
      const rendition = entry.rendition ?? 'original';
      const assets = await tx.asset.findMany({ where: { deletedAt: null, OR: rendition === 'thumbnail'
        ? [{ thumbnailStorageSourceKey: entry.sourceKey }, { thumbnailStorageKey: entry.logicalKey }]
        : [{ storageSourceKey: entry.sourceKey }, { storageKey: entry.logicalKey }] }, select: { id: true, storageProvider: true, storageKey: true, storageSourceKey: true, blobUrl: true, thumbnailStorageKey: true, thumbnailStorageSourceKey: true, thumbnailUrl: true, mime: true } });
      if (assets.length === 0) throw new Error('Cutover manifest entry has no matching live asset: ' + entry.logicalKey);
      for (const asset of assets) {
        const sourceProvider = entry.sourceProvider ?? 'vercel';
        const sourceReplica = await tx.$queryRawUnsafe<Array<{ provider: string; source_key: string | null; logical_key: string; delivery_url: string }>>(
          'SELECT provider, source_key, logical_key, delivery_url FROM asset_storage_replicas WHERE asset_id=$1 AND rendition=$2 AND provider=$3 ORDER BY generation DESC LIMIT 1',
          asset.id,
          rendition,
          sourceProvider,
        );
        const recordedSource = sourceReplica[0];
        const fallbackSourceKey = rendition === 'thumbnail'
          ? asset.thumbnailStorageSourceKey ?? asset.thumbnailStorageKey
          : asset.storageSourceKey ?? asset.storageKey;
        const fallbackSourceUrl = rendition === 'thumbnail' ? asset.thumbnailUrl : asset.blobUrl;
        if (!recordedSource && (!fallbackSourceKey || !fallbackSourceUrl)) {
          throw new Error('Cutover source replica is missing for ' + asset.id + '/' + rendition);
        }
        const oldKey = recordedSource
          ? (recordedSource.provider === 'vercel' ? recordedSource.source_key ?? recordedSource.logical_key : recordedSource.logical_key)
          : fallbackSourceKey ?? entry.sourceKey;
        const oldUrl = recordedSource?.delivery_url ?? fallbackSourceUrl;
        if (!oldUrl) throw new Error('Cutover source delivery URL is missing for ' + asset.id + '/' + rendition);
        const targetUrl = stableDeliveryUrl(config, entry.logicalKey);
        await tx.$executeRawUnsafe('UPDATE asset_storage_replicas SET active=false, updated_at=NOW() WHERE asset_id=$1 AND rendition=$2', asset.id, rendition);
        await tx.$executeRawUnsafe('INSERT INTO asset_storage_replicas (id, asset_id, rendition, provider, source_key, logical_key, delivery_url, size, sha256, content_type, generation, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false) ON CONFLICT (asset_id, rendition, generation, provider) DO UPDATE SET source_key=EXCLUDED.source_key, logical_key=EXCLUDED.logical_key, delivery_url=EXCLUDED.delivery_url, size=EXCLUDED.size, sha256=EXCLUDED.sha256, content_type=EXCLUDED.content_type, active=false, updated_at=NOW()', randomUUID(), asset.id, rendition, sourceProvider, oldKey, entry.logicalKey, oldUrl, entry.size, entry.sha256, entry.contentType ?? asset.mime, generation);
        await tx.$executeRawUnsafe('INSERT INTO asset_storage_replicas (id, asset_id, rendition, provider, source_key, logical_key, delivery_url, size, sha256, content_type, generation, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true) ON CONFLICT (asset_id, rendition, generation, provider) DO UPDATE SET source_key=EXCLUDED.source_key, logical_key=EXCLUDED.logical_key, delivery_url=EXCLUDED.delivery_url, size=EXCLUDED.size, sha256=EXCLUDED.sha256, content_type=EXCLUDED.content_type, active=true, updated_at=NOW()', randomUUID(), asset.id, rendition, config.provider, entry.sourceKey, entry.logicalKey, targetUrl, entry.size, entry.sha256, entry.contentType ?? asset.mime, generation);
        await tx.asset.update({ where: { id: asset.id }, data: rendition === 'thumbnail' ? { storageProvider: config.provider, thumbnailStorageKey: entry.logicalKey, thumbnailStorageSourceKey: entry.sourceKey, thumbnailUrl: targetUrl, thumbnailStorageSize: entry.size, thumbnailStorageSha256: entry.sha256, storageConfigFingerprint: fingerprint } : { storageProvider: config.provider, storageKey: entry.logicalKey, storageSourceKey: entry.sourceKey, blobUrl: targetUrl, storageSize: entry.size, storageSha256: entry.sha256, storageConfigFingerprint: fingerprint }, select: { id: true } });
      }
    }
    const updated = await tx.storageCutoverState.updateMany({ where: { id: 'default', phase: 'dual-write', generation: state.generation, providerFingerprint: fingerprint, manifestSha256: digest }, data: { phase: 'target', generation, verifiedAt: new Date(), updatedAt: new Date() } });
    if (updated.count !== 1) throw new Error('Cutover fence lost while committing asset mappings');
  });
}


export async function restoreCutoverMappings(config: StorageConfig, digest: string, database: PrismaClient = prisma): Promise<void> {
  const fingerprint = storageConfigFingerprint(config);
  await database.$transaction(async (tx) => {
    const state = await tx.storageCutoverState.findUnique({ where: { id: 'default' } });
    if (!state || state.phase !== 'target' || state.providerFingerprint !== fingerprint || state.manifestSha256 !== digest) throw new Error('Rollback fence mismatch; refusing mapping restoration');
    // A target-phase thumbnail regeneration (regenerate-thumbnails cron) writes a
    // fresh replica pair at its own unix-seconds generation without deactivating
    // the cutover-generation pair it supersedes — the app runtime role has no
    // UPDATE grant on this table (insert-only; see the asset_storage_replicas
    // grants in stripe-ledger-bootstrap-post.sql), so it cannot deactivate
    // anything itself. Restoring blindly from `state.generation` would therefore
    // resurrect the stale pre-regeneration Vercel identity and leave the
    // regenerated S3 replica active. Instead, for every asset+rendition this
    // cutover touched (any row recorded at the cutover's own generation, i.e.
    // `scope` below), find the *freshest* still-active target-provider replica
    // for that asset+rendition — the cutover's own row when nothing regenerated
    // it since, or a later regen's row when one did, since a regen's
    // unix-seconds generation always outranks the small sequential cutover
    // generation — and require its paired source-provider peer at that exact
    // same generation (commitCutover and the regen cron always insert their pair
    // together at one shared generation, opposite providers). The LEFT JOINs
    // below surface a scoped asset+rendition with no active target row, or a
    // target row with no paired peer, as NULLs rather than silently dropping it;
    // either case fails the whole transaction closed instead of restoring a
    // stale or mixed-generation mapping.
    const rows = await tx.$queryRawUnsafe<Array<{ asset_id: string; rendition: string; target_generation: number | null; provider: string | null; source_key: string | null; logical_key: string | null; delivery_url: string | null; old_generation: number | null }>>('WITH scope AS (SELECT DISTINCT asset_id, rendition FROM asset_storage_replicas WHERE generation=$1), target AS (SELECT DISTINCT ON (t.asset_id, t.rendition) t.asset_id, t.rendition, t.generation FROM asset_storage_replicas t JOIN scope s ON s.asset_id=t.asset_id AND s.rendition=t.rendition WHERE t.provider=$2 AND t.active=true ORDER BY t.asset_id, t.rendition, t.generation DESC) SELECT s.asset_id, s.rendition, target.generation AS target_generation, old.provider, old.source_key, old.logical_key, old.delivery_url, old.generation AS old_generation FROM scope s LEFT JOIN target ON target.asset_id=s.asset_id AND target.rendition=s.rendition LEFT JOIN asset_storage_replicas old ON old.asset_id=target.asset_id AND old.rendition=target.rendition AND old.generation=target.generation AND old.provider<>$2', state.generation, config.provider);
    for (const row of rows) {
      if (row.target_generation === null || row.provider === null) {
        throw new Error('Rollback cannot find a complete provider-paired replica generation for ' + row.asset_id + '/' + row.rendition + '; refusing to restore a stale or mixed-generation mapping');
      }
      if (row.rendition === 'thumbnail') await tx.asset.update({ where: { id: row.asset_id }, data: { storageProvider: row.provider, thumbnailStorageKey: row.logical_key!, thumbnailStorageSourceKey: row.source_key, thumbnailUrl: row.delivery_url! }, select: { id: true } });
      else await tx.asset.update({ where: { id: row.asset_id }, data: { storageProvider: row.provider, storageKey: row.logical_key!, storageSourceKey: row.source_key, blobUrl: row.delivery_url! }, select: { id: true } });
      // Deactivate every generation of this asset+rendition — mirrors
      // commitCutover's own blanket deactivate — then reactivate exactly the row
      // just restored onto the asset above. This keeps the ledger's `active`
      // flag single-valued and in agreement with the asset's columns regardless
      // of how many un-deactivatable regen rows piled up since the cutover, and
      // commits atomically with the asset-column restore above and the phase
      // transition below (all inside this one transaction).
      await tx.$executeRawUnsafe('UPDATE asset_storage_replicas SET active=false, updated_at=NOW() WHERE asset_id=$1 AND rendition=$2', row.asset_id, row.rendition);
      await tx.$executeRawUnsafe('UPDATE asset_storage_replicas SET active=true, updated_at=NOW() WHERE asset_id=$1 AND rendition=$2 AND generation=$3 AND provider=$4', row.asset_id, row.rendition, row.old_generation, row.provider);
    }
    const updated = await tx.storageCutoverState.updateMany({ where: { id: 'default', phase: 'target', generation: state.generation, providerFingerprint: fingerprint, manifestSha256: digest }, data: { phase: 'rollback', rollbackAt: new Date(), updatedAt: new Date() } });
    if (updated.count !== 1) throw new Error('Rollback fence lost while restoring asset mappings');
  });
}


async function cleanup(limit: number): Promise<void> {
  await requireOperatorAuthority();
  const result = await processStorageCleanup(prisma, limit);
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.failed) throw new Error('Storage cleanup failed for ' + result.failed + ' item(s)');
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
  await ensureCutoverState(config, digest, command === 'rollback' ? 'target' : 'dual-write');
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
  if (command === 'verify') await commitCutover(manifest, config, digest);
  else await restoreCutoverMappings(config, digest);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'inventory') { const rawLimit = args.includes('--limit') ? value(args, '--limit') : String(MAX_BATCH); const parsed = Number(rawLimit); if (!Number.isSafeInteger(parsed)) throw new Error('--limit must be an integer'); await inventory(parsed, args.includes('--cursor') ? value(args, '--cursor') : undefined); }
  else if (command === 'gc') { const rawLimit = args.includes('--limit') ? value(args, '--limit') : String(MAX_BATCH); const parsed = Number(rawLimit); if (!Number.isSafeInteger(parsed)) throw new Error('--limit must be an integer'); await cleanup(parsed); }
  else if (command === 'verify' || command === 'rollback') await run(command, args);
  else usage();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../lib/db';
import { OPERATOR_ROLES } from './storage-portability';
import { storageConfigFromEnv } from '../lib/storage/config';
import {
  ObjectNotFoundError,
  S3CompatibleObjectStore,
  VercelObjectStore,
  bodyToBuffer,
  type ObjectStore,
} from '../lib/storage/object-store';

const MAX_BATCH = 200;
const RECONCILE_STATE_ID = 'storage-ledger';
const MAX_OBJECT_BYTES = 512 * 1024 * 1024;

async function requireOperatorAuthority(database: PrismaClient = prisma): Promise<void> {
  const rows = await database.$queryRaw<Array<{ sessionUser: string; isSuperuser: boolean }>>(
    Prisma.sql`SELECT current_user AS "sessionUser", rolsuper AS "isSuperuser" FROM pg_roles WHERE rolname = current_user`,
  );
  const authority = rows[0];
  if (!authority || (!OPERATOR_ROLES.has(authority.sessionUser) && !authority.isSuperuser)) {
    throw new Error('Storage ledger operations require DATABASE_URL owned by the schema-migrator/operator authority');
  }
}

function usage(): never {
  console.error('Usage: storage-ledger.ts backfill [--limit N] [--cursor ID] [--receipt FILE] | rollback-backfill --receipt FILE | reconcile [--limit N] [--cursor ID]');
  process.exit(2);
}

function value(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  const result = index >= 0 ? args[index + 1] : undefined;
  if (!result) usage();
  return result;
}

// ---------------------------------------------------------------------------
// Backfill: materialize AssetStorageReplica rows for assets that predate the
// ledger (created before the replica table existed, or before this backfill
// ran), sourced entirely from physical measurements already recorded on the
// Asset row — no provider reads, no network calls. Additive-only: an asset
// that already has any replica row (from ingest, thumbnail regen, or a prior
// backfill pass) is never revisited, so this is safe to re-run to
// completion or resume after an interruption via --cursor.
// ---------------------------------------------------------------------------

export interface BackfillOutcome {
  processed: number;
  created: number;
  skipped: number;
  nextCursor: string | null;
  backfilledAssetIds: string[];
}

export async function backfill(
  limit: number,
  cursor: string | undefined,
  database: PrismaClient = prisma,
): Promise<BackfillOutcome> {
  await requireOperatorAuthority(database);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH) throw new Error('Backfill batch size must be 1-' + MAX_BATCH);

  const assets = await database.asset.findMany({
    where: { storageReplicas: { none: {} }, ...(cursor ? { id: { gt: cursor } } : {}) },
    orderBy: { id: 'asc' },
    take: limit,
    select: {
      id: true,
      blobUrl: true,
      thumbnailUrl: true,
      pathname: true,
      thumbnailPath: true,
      storageProvider: true,
      storageKey: true,
      storageSourceKey: true,
      thumbnailStorageKey: true,
      thumbnailStorageSourceKey: true,
      storageSize: true,
      storageSha256: true,
      thumbnailStorageSize: true,
      thumbnailStorageSha256: true,
      mime: true,
      size: true,
      checksumSha256: true,
    },
  });

  let created = 0;
  let skipped = 0;
  const backfilledAssetIds: string[] = [];
  let nextCursor: string | null = cursor ?? null;

  for (const asset of assets) {
    nextCursor = asset.id;
    const provider = asset.storageProvider ?? 'vercel';
    const rows: Prisma.AssetStorageReplicaCreateManyInput[] = [{
      assetId: asset.id,
      rendition: 'original',
      provider,
      sourceKey: provider === 'vercel' ? (asset.storageSourceKey ?? asset.storageKey ?? asset.pathname) : null,
      logicalKey: asset.storageKey ?? asset.pathname,
      deliveryUrl: asset.blobUrl,
      // Prefer the physical measurement taken at ingest/inventory time;
      // fall back to the pre-processing upload size for assets that
      // predate that column (an approximation; reconcile detects drift only).
      size: asset.storageSize ?? asset.size,
      sha256: asset.storageSha256 ?? asset.checksumSha256,
      contentType: asset.mime,
      generation: 0,
      active: true,
    }];
    // Only backfill the thumbnail rendition when its physical size AND
    // hash were already verified (recorded at ingest or by
    // `storage:portability inventory`). Fabricating an unverified hash
    // would poison reconcile's mismatch detection; the meter's own
    // per-rendition legacy fallback (Asset.thumbnailStorageSize) already
    // covers thumbnail bytes for assets skipped here.
    if (asset.thumbnailUrl && asset.thumbnailStorageSize != null && asset.thumbnailStorageSha256) {
      rows.push({
        assetId: asset.id,
        rendition: 'thumbnail',
        provider,
        sourceKey: provider === 'vercel' ? (asset.thumbnailStorageSourceKey ?? asset.thumbnailStorageKey ?? asset.thumbnailPath) : null,
        logicalKey: asset.thumbnailStorageKey ?? asset.thumbnailPath ?? asset.pathname,
        deliveryUrl: asset.thumbnailUrl,
        size: asset.thumbnailStorageSize,
        sha256: asset.thumbnailStorageSha256,
        contentType: asset.mime,
        generation: 0,
        active: true,
      });
    } else if (asset.thumbnailUrl) {
      skipped++;
    }

    const result = await database.assetStorageReplica.createMany({ data: rows, skipDuplicates: true });
    created += result.count;
    if (result.count > 0) backfilledAssetIds.push(asset.id);
  }

  return {
    processed: assets.length,
    created,
    skipped,
    nextCursor: assets.length === limit ? nextCursor : null,
    backfilledAssetIds,
  };
}

export interface BackfillReceipt {
  startedAt: string;
  completedAt: string;
  backfilledAssetIds: string[];
}

/**
 * Rollback for a backfill run: deletes exactly the generation-0 replica
 * rows this backfill created, identified by the asset ids recorded in its
 * receipt. Safe and precise — a legacy asset selected by `backfill` had
 * zero replica rows beforehand, and normal app writes (ingest, thumbnail
 * regen) never produce a second generation-0 row for an asset that already
 * has one, so this can never delete a row backfill didn't create.
 */
export async function rollbackBackfill(receipt: BackfillReceipt, database: PrismaClient = prisma): Promise<number> {
  await requireOperatorAuthority(database);
  if (receipt.backfilledAssetIds.length === 0) return 0;
  const result = await database.assetStorageReplica.deleteMany({
    where: { assetId: { in: receipt.backfilledAssetIds }, generation: 0 },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Reconcile: dry-run parity check between the AssetStorageReplica ledger and
// what the provider actually has. Never mutates the ledger itself; records
// findings to storage_inventory_failures (kind 'ledger-missing' |
// 'ledger-mismatch') and advances a durable cursor in storage_inventory_state
// so a resumed run never re-scans — and never double-counts — a row a prior
// run already confirmed.
// ---------------------------------------------------------------------------

export interface ReconcileSummary {
  scanned: number;
  ok: number;
  missing: number;
  mismatched: number;
  unsupportedProvider: number;
  nextCursor: string | null;
}

function resolveStore(provider: string, config = storageConfigFromEnv()): ObjectStore {
  if (provider === 'vercel') return new VercelObjectStore(config.legacyBaseUrl);
  if (provider === 's3' && config.provider === 's3') return new S3CompatibleObjectStore(config);
  throw new Error(`No object store configured for provider "${provider}"`);
}

async function recordLedgerFailure(database: PrismaClient, assetId: string, kind: string, error: string): Promise<void> {
  await database.$executeRaw(Prisma.sql`INSERT INTO "storage_inventory_failures" ("asset_id", "kind", "error", "attempts", "updated_at") VALUES (${assetId}, ${kind}, ${error}, 1, NOW()) ON CONFLICT ("asset_id", "kind") DO UPDATE SET "error" = EXCLUDED."error", "attempts" = "storage_inventory_failures"."attempts" + 1, "updated_at" = NOW()`);
}

export async function reconcile(
  limit: number,
  cursor: string | undefined,
  database: PrismaClient = prisma,
  storeFor: (provider: string) => ObjectStore = resolveStore,
): Promise<ReconcileSummary> {
  await requireOperatorAuthority(database);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH) throw new Error('Reconcile batch size must be 1-' + MAX_BATCH);

  const replicas = await database.assetStorageReplica.findMany({
    where: { active: true, ...(cursor ? { id: { gt: cursor } } : {}) },
    orderBy: { id: 'asc' },
    take: limit,
    select: { id: true, assetId: true, provider: true, logicalKey: true, size: true, sha256: true },
  });

  let ok = 0;
  let missing = 0;
  let mismatched = 0;
  let unsupportedProvider = 0;
  let nextCursor: string | null = cursor ?? null;

  for (const replica of replicas) {
    nextCursor = replica.id;

    let store: ObjectStore;
    try {
      store = storeFor(replica.provider);
    } catch {
      unsupportedProvider++;
      await database.storageInventoryState.upsert({
        where: { id: RECONCILE_STATE_ID },
        update: { cursor: replica.id, providerFingerprint: 'ledger', lastError: null },
        create: { id: RECONCILE_STATE_ID, cursor: replica.id, providerFingerprint: 'ledger', updatedAt: new Date() },
      });
      continue;
    }

    try {
      const object = await store.get(replica.logicalKey);
      // The provider's reported content-length/checksum header is never
      // trusted for integrity (see object-store.ts) — recompute both from
      // the actual bytes read, exactly like storage-portability's inventory.
      const bytes = await bodyToBuffer(object.body, MAX_OBJECT_BYTES);
      const actualSize = bytes.byteLength;
      const actualSha256 = createHash('sha256').update(bytes).digest('hex');
      if (actualSize !== replica.size || actualSha256 !== replica.sha256) {
        mismatched++;
        await recordLedgerFailure(
          database,
          replica.assetId,
          'ledger-mismatch',
          `expected size=${replica.size} sha256=${replica.sha256}, got size=${actualSize} sha256=${actualSha256}`,
        );
      } else {
        ok++;
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        missing++;
        await recordLedgerFailure(database, replica.assetId, 'ledger-missing', error.message);
      } else {
        throw error;
      }
    }

    await database.storageInventoryState.upsert({
      where: { id: RECONCILE_STATE_ID },
      update: { cursor: replica.id, providerFingerprint: 'ledger', lastError: null },
      create: { id: RECONCILE_STATE_ID, cursor: replica.id, providerFingerprint: 'ledger', updatedAt: new Date() },
    });
  }

  return {
    scanned: replicas.length,
    ok,
    missing,
    mismatched,
    unsupportedProvider,
    nextCursor: replicas.length === limit ? nextCursor : null,
  };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const limitFor = (): number => {
    const raw = args.includes('--limit') ? value(args, '--limit') : String(MAX_BATCH);
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed)) throw new Error('--limit must be an integer');
    return parsed;
  };
  const cursorFor = (): string | undefined => (args.includes('--cursor') ? value(args, '--cursor') : undefined);

  if (command === 'backfill') {
    const startedAt = new Date().toISOString();
    const outcome = await backfill(limitFor(), cursorFor());
    if (args.includes('--receipt')) {
      const receipt: BackfillReceipt = { startedAt, completedAt: new Date().toISOString(), backfilledAssetIds: outcome.backfilledAssetIds };
      await writeFile(value(args, '--receipt'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
    }
    process.stdout.write(JSON.stringify(outcome) + '\n');
  } else if (command === 'rollback-backfill') {
    const receipt = JSON.parse(await readFile(value(args, '--receipt'), 'utf8')) as BackfillReceipt;
    const deleted = await rollbackBackfill(receipt);
    process.stdout.write(JSON.stringify({ deleted }) + '\n');
  } else if (command === 'reconcile') {
    const summary = await reconcile(limitFor(), cursorFor());
    process.stdout.write(JSON.stringify(summary) + '\n');
  } else {
    usage();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

import { createHash } from 'node:crypto';
import { canonicalLogicalKey } from './config';
import { bodyToBuffer, ObjectNotFoundError, ObjectParityError, type ObjectMetadata, type ObjectStore } from './object-store';

export type MigrationStatus = 'pending' | 'copying' | 'copied' | 'verified' | 'missing' | 'failed' | 'retried' | 'rolled_back';

export interface MigrationManifestEntry {
  logicalKey: string;
  sourceKey: string;
  size: number;
  sha256: string;
  contentType?: string;
}

export interface JournalEntry extends MigrationManifestEntry {
  status: MigrationStatus;
  attempts: number;
  lease?: { workerId: string; expiresAt: number };
  error?: string;
}

export interface MigrationReceipt {
  manifestSha256: string;
  entries: JournalEntry[];
  counts: Record<MigrationStatus, number>;
  verified: number;
  missing: number;
  failed: number;
  retried: number;
  rolledBack: number;
}

const MAX_BATCH = 100;
const MAX_CONCURRENCY = 8;

function metadata(entry: MigrationManifestEntry): ObjectMetadata {
  return { size: entry.size, sha256: entry.sha256, contentType: entry.contentType };
}

export class MigrationVerifier {
  private readonly entries: JournalEntry[];
  private readonly manifestSha256: string;

  constructor(private readonly options: { source: ObjectStore; target: ObjectStore; manifest: MigrationManifestEntry[]; maxAttempts?: number; leaseMs?: number }) {
    const manifest = options.manifest.map(entry => ({ ...entry, logicalKey: canonicalLogicalKey(entry.logicalKey), sourceKey: canonicalLogicalKey(entry.sourceKey) }));
    this.manifestSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    this.entries = manifest.map(entry => ({ ...entry, status: 'pending', attempts: 0 }));
  }

  async runBatch(options: { limit: number; workerId: string; concurrency?: number }): Promise<Pick<MigrationReceipt, 'verified' | 'missing' | 'failed' | 'retried'>> {
    const claims = this.claim(options.limit, options.workerId);
    const concurrency = Math.min(Math.max(options.concurrency ?? 4, 1), MAX_CONCURRENCY);
    for (let index = 0; index < claims.length; index += concurrency) {
      await Promise.all(claims.slice(index, index + concurrency).map(entry => this.copyOne(entry)));
    }
    const receipt = await this.receipt();
    return { verified: receipt.verified, missing: receipt.missing, failed: receipt.failed, retried: receipt.retried };
  }

  async rollback(options: { limit: number; workerId: string }): Promise<{ rolledBack: number; failed: number }> {
    const claims = this.claim(options.limit, options.workerId, 'verified');
    for (const entry of claims) {
      try {
        const source = await this.options.source.get(entry.sourceKey);
        const sourceBytes = await bodyToBuffer(source.body, Math.max(entry.size, 1));
        this.assertBytes(sourceBytes, entry);
        const target = await this.options.target.get(entry.logicalKey);
        const targetBytes = await bodyToBuffer(target.body, Math.max(entry.size, 1));
        this.assertBytes(targetBytes, entry);
        await this.options.target.delete(entry.logicalKey);
        await this.options.target.get(entry.logicalKey).then(() => { throw new Error('Rollback delete readback still exists'); }).catch(error => {
          if (!(error instanceof ObjectNotFoundError)) throw error;
        });
        entry.status = 'rolled_back';
        entry.lease = undefined;
      } catch (error) {
        entry.status = 'failed';
        entry.error = error instanceof Error ? error.message : String(error);
        entry.lease = undefined;
      }
    }
    const receipt = await this.receipt();
    return { rolledBack: receipt.rolledBack, failed: receipt.failed };
  }

  async receipt(): Promise<MigrationReceipt> {
    const entries = this.entries.map(entry => ({ ...entry, lease: entry.lease ? { ...entry.lease } : undefined }));
    const counts = Object.fromEntries((['pending', 'copying', 'copied', 'verified', 'missing', 'failed', 'retried', 'rolled_back'] as MigrationStatus[]).map(status => [status, entries.filter(entry => entry.status === status).length])) as Record<MigrationStatus, number>;
    return { manifestSha256: this.manifestSha256, entries, counts, verified: counts.verified, missing: counts.missing, failed: counts.failed, retried: entries.filter(entry => entry.attempts > 1).length, rolledBack: counts.rolled_back };
  }

  private claim(limit: number, workerId: string, status: MigrationStatus = 'pending'): JournalEntry[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH) throw new Error(`Migration batch must be 1-${MAX_BATCH}`);
    const now = Date.now();
    const leaseMs = this.options.leaseMs ?? 60_000;
    return this.entries.filter(entry => (entry.status === status || (status === 'pending' && entry.status === 'failed' && entry.attempts < (this.options.maxAttempts ?? 3))) && (!entry.lease || entry.lease.expiresAt <= now)).slice(0, limit).map(entry => {
      entry.status = status === 'verified' ? 'copying' : entry.attempts > 0 ? 'retried' : 'copying';
      entry.attempts += 1;
      entry.lease = { workerId, expiresAt: now + leaseMs };
      return entry;
    });
  }

  private async copyOne(entry: JournalEntry): Promise<void> {
    try {
      const existing = await this.options.target.get(entry.logicalKey);
      const existingBytes = await bodyToBuffer(existing.body, Math.max(entry.size, 1));
      this.assertBytes(existingBytes, entry);
      entry.status = 'verified';
      entry.lease = undefined;
      return;
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError) && !(error instanceof ObjectParityError)) {
        entry.status = 'failed';
        entry.error = error instanceof Error ? error.message : String(error);
        entry.lease = undefined;
        return;
      }
    }
    try {
      const source = await this.options.source.get(entry.sourceKey);
      const bytes = await bodyToBuffer(source.body, Math.max(entry.size, 1));
      this.assertBytes(bytes, entry);
      entry.status = 'copied';
      await this.options.target.put(entry.logicalKey, bytes, metadata(entry));
      const readback = await this.options.target.get(entry.logicalKey);
      const readbackBytes = await bodyToBuffer(readback.body, Math.max(entry.size, 1));
      this.assertBytes(readbackBytes, entry);
      entry.status = 'verified';
      entry.lease = undefined;
      entry.error = undefined;
    } catch (error) {
      entry.status = error instanceof ObjectNotFoundError ? 'missing' : 'failed';
      entry.error = error instanceof Error ? error.message : String(error);
      entry.lease = undefined;
    }
  }

  private assertBytes(bytes: Buffer, entry: MigrationManifestEntry): void {
    if (bytes.byteLength !== entry.size) throw new ObjectParityError(`Migration size mismatch for ${entry.logicalKey}`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== entry.sha256) throw new ObjectParityError(`Migration SHA-256 mismatch for ${entry.logicalKey}`);
  }
}

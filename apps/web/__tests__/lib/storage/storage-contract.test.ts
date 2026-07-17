import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { del } from '@vercel/blob';

vi.mock('@vercel/blob', () => ({ del: vi.fn(), put: vi.fn(), list: vi.fn() }));
import {
  canonicalLogicalKey,
  createStorageConfig,
  assertCutoverTransition,
  storageConfigFingerprint,
  stableDeliveryUrl,
} from '@/lib/storage/config';
import {
  InMemoryObjectStore,
  ObjectNotFoundError,
  PortableObjectStore,
  S3CompatibleObjectStore,
  VercelObjectStore,
  type ObjectMetadata,
} from '@/lib/storage/object-store';
import { replicasForPermanentDelete } from '@/lib/storage/permanent-delete';
import {
  MigrationVerifier,
  type MigrationManifestEntry,
} from '@/lib/storage/migration';

const bytes = Buffer.from('sploot storage contract');
const metadata: ObjectMetadata = {
  size: bytes.byteLength,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  contentType: 'image/png',
};

describe('portable storage contract', () => {
  it('accepts only canonical bounded ASCII logical keys', () => {
    expect(canonicalLogicalKey('assets/user_1/image.png')).toBe('assets/user_1/image.png');
    for (const key of [
      '../escape.png',
      'assets//image.png',
      'assets/%2e%2e/image.png',
      'assets/image?.png',
      'assets/image#.png',
      'assets/café.png',
      'assets/\u0000.png',
      '/assets/image.png',
      'assets/image.png/',
      '',
    ]) {
      expect(() => canonicalLogicalKey(key)).toThrow();
    }
  });

  it('fingerprints non-secret provider identity only', () => {
    const config = createStorageConfig({
      provider: 's3',
      publicUrlBase: 'https://objects.example.test',
      endpoint: 'https://objects.example.test',
      bucket: 'sploot',
      region: 'auto',
      configVersion: 'v1',
      accessKeyId: 'public-id',
      secretAccessKey: 'secret-one',
    });
    const changedSecret = { ...config, secretAccessKey: 'secret-two' };
    expect(storageConfigFingerprint(config)).toBe(storageConfigFingerprint(changedSecret));
    expect(storageConfigFingerprint({ ...config, bucket: 'other' })).not.toBe(
      storageConfigFingerprint(config),
    );
  });

  it('rejects runtime HTTP endpoints except explicit test fixtures', () => {
    expect(() =>
      createStorageConfig({ provider: 's3', endpoint: 'http://objects.example.test', bucket: 'x' }),
    ).toThrow(/HTTPS/);
    expect(
      createStorageConfig({
        provider: 's3',
      publicUrlBase: 'https://objects.example.test',
        endpoint: 'http://objects.example.test',
        bucket: 'x',
        allowHttpTestFixture: true,
      }).endpoint,
    ).toBe('http://objects.example.test');
  });

  it('requires verified evidence for target phases and forbids unsafe skips', () => {
    expect(() => createStorageConfig({ provider: 's3', phase: 'target', endpoint: 'https://objects.example.test', publicUrlBase: 'https://objects.example.test', bucket: 'sploot' })).toThrow(/manifest SHA-256/);
    expect(() => assertCutoverTransition('legacy', 'target')).toThrow(/Unsafe/);
    expect(() => assertCutoverTransition('dual-write', 'target')).not.toThrow();
  });

  it('validates actual bytes and exact-key readback before confirmation', async () => {
    const provider = new InMemoryObjectStore('legacy');
    const store = new PortableObjectStore({ legacy: provider, phase: 'legacy' });
    const result = await store.putVerified('assets/user_1/image.png', bytes, metadata);
    expect(result.confirmed).toBe(true);
    await expect(
      store.putVerified('assets/user_1/wrong.png', bytes, { ...metadata, sha256: '0'.repeat(64) }),
    ).rejects.toThrow(/SHA-256/);
    expect((await provider.get('assets/user_1/image.png')).metadata).toEqual(metadata);
  });

  it('fails closed when a provider mutates bytes after PUT', async () => {
    class MutatingStore extends InMemoryObjectStore {
      override async put(key: string, body: Uint8Array | ArrayBuffer | Blob | AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>, objectMetadata: ObjectMetadata) {
        const result = await super.put(key, body, objectMetadata);
        const object = this.objects.get(key)!;
        object.bytes[0] = object.bytes[0]! ^ 0xff;
        return result;
      }
    }
    const provider = new MutatingStore('legacy');
    const store = new PortableObjectStore({ legacy: provider, phase: 'legacy' });
    await expect(store.putVerified('assets/user_1/poison.png', bytes, metadata)).rejects.toThrow(/SHA-256/);
    expect(provider.objects.has('assets/user_1/poison.png')).toBe(false);
  });

  it('rejects expiring or credentialed delivery bases', () => {
    expect(() => createStorageConfig({ provider: 's3', endpoint: 'https://objects.example.test', publicUrlBase: 'https://objects.example.test?X-Amz-Expires=60', bucket: 'sploot' })).toThrow(/stable HTTPS/);
    expect(() => createStorageConfig({ provider: 's3', endpoint: 'https://objects.example.test', publicUrlBase: 'https://user:secret@cdn.example.test/assets', bucket: 'sploot' })).toThrow(/stable HTTPS/);
    for (const base of ['https://cdn.example.test/base/../evil', 'https://cdn.example.test/base/%2e%2e/evil', 'https://cdn.example.test/base\\evil']) {
      expect(() => createStorageConfig({ provider: 's3', endpoint: 'https://objects.example.test', publicUrlBase: base, bucket: 'sploot' })).toThrow(/path traversal|separators/);
    }
  });

  it('returns a fetchable HTTPS delivery URL for target writes', async () => {
    const target = new S3CompatibleObjectStore(createStorageConfig({ provider: 's3', endpoint: 'https://objects.example.test', publicUrlBase: 'https://objects.example.test/cdn/base', bucket: 'sploot', accessKeyId: 'public-id', secretAccessKey: 'secret' }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.byteLength), 'content-type': 'image/png', 'x-amz-meta-sha256': metadata.sha256 } }));
    const result = await target.put('assets/a.png', bytes, metadata);
    expect(result.url).toBe('https://objects.example.test/cdn/base/sploot/assets/a.png');
    expect(result.url).toBe(stableDeliveryUrl(createStorageConfig({ provider: 's3', endpoint: 'https://objects.example.test', publicUrlBase: 'https://objects.example.test/cdn/base', bucket: 'sploot', accessKeyId: 'public-id', secretAccessKey: 'secret' }), 'assets/a.png'));
    expect(result.url.match(/\/sploot\//g)).toHaveLength(1);
    expect(result.url).not.toMatch(/^s3:/);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: 'PUT' }));
    fetchMock.mockRestore();
  });

  it('reads back the exact URL returned by a provider', async () => {
    const calls: string[] = [];
    const provider = {
      provider: 'vercel',
      async put() { return { provider: 'vercel', key: 'actual-key', url: 'https://actual.example.test/actual-key', metadata }; },
      async get() { throw new Error('logical reconstruction must not be used'); },
      async getUrl(url: string) { calls.push(url); return { key: 'actual-key', url, metadata, body: bytes }; },
      async delete() {},
      async deleteUrl(url: string) { calls.push('delete:' + url); },
    };
    const store = new PortableObjectStore({ legacy: provider, phase: 'legacy' });
    const result = await store.putVerified('assets/a.png', bytes, metadata);
    expect(result.url).toBe('https://actual.example.test/actual-key');
    expect(calls).toEqual(['https://actual.example.test/actual-key']);
  });

  it('guards URL syntax and S3 bucket ownership', async () => {
    const legacy = new VercelObjectStore('https://blob.example.test');
    expect(legacy.ownsUrl('https://blob.example.test/assets/a.png')).toBe(true);
    expect(legacy.ownsUrl('https://store-123.public.blob.vercel-storage.com/assets/a.png')).toBe(false);
    expect(legacy.ownsUrl('https://other.example.test/assets/a.png')).toBe(false);
    expect(legacy.ownsUrl('https://blob.example.test.evil/assets/a.png')).toBe(false);
    expect(legacy.ownsUrl('https://user@blob.example.test/assets/a.png')).toBe(false);
    expect(legacy.ownsUrl('https://blob.example.test/assets/a.png?delete=all')).toBe(false);
    expect(legacy.ownsUrl('https://blob.example.test/assets/%2e%2e/secret.png')).toBe(false);
    expect(legacy.ownsUrl('https://blob.example.test/assets/../foreign.png')).toBe(false);
    expect(legacy.ownsUrl('https://blob.example.test/assets/%2e./foreign.png')).toBe(false);
    expect(legacy.ownsUrl('https://blob.example.test/assets/.%2e/foreign.png')).toBe(false);
    vi.mocked(del).mockClear();
    await expect(legacy.deleteUrl('https://blob.example.test/assets/../foreign.png')).rejects.toThrow(/not owned/);
    expect(del).not.toHaveBeenCalled();
    expect(legacy.ownsUrl('https://blob.example.test/assets/%2fsecret.png')).toBe(false);
    const scopedLegacy = new VercelObjectStore('https://blob.example.test/base');
    expect(scopedLegacy.ownsUrl('https://blob.example.test/base/file.png')).toBe(true);
    expect(scopedLegacy.ownsUrl('https://blob.example.test/base2/file.png')).toBe(false);

    const target = new S3CompatibleObjectStore(createStorageConfig({
      provider: 's3',
      publicUrlBase: 'https://objects.example.test',
      endpoint: 'https://objects.example.test',
      bucket: 'sploot',
      accessKeyId: 'public-id',
      secretAccessKey: 'secret',
    }));
    expect(target.ownsUrl('https://objects.example.test/sploot/assets/a.png')).toBe(true);
    expect(target.ownsUrl('s3://sploot/assets/a.png')).toBe(false);
    expect(target.ownsUrl('https://objects.example.test/other-bucket/assets/a.png')).toBe(false);
    expect(target.ownsUrl('https://objects.example.test/sploot/assets/a.png?delete=all')).toBe(false);
    for (const traversalUrl of [
      'https://objects.example.test/sploot/assets/../foreign.png',
      'https://objects.example.test/sploot/assets/%2e%2e/foreign.png',
      'https://objects.example.test/sploot/assets/.%2e/foreign.png',
    ]) {
      expect(target.ownsUrl(traversalUrl)).toBe(false);
      await expect(target.deleteUrl(traversalUrl)).rejects.toThrow(/not owned/);
    }
    const portable = new PortableObjectStore({ legacy, target, phase: 'target' });
    await expect(portable.deleteUrl('https://objects.example.test/other-bucket/assets/a.png')).rejects.toThrow(/not owned/);
  });

  it('deletes every active and inactive replica using provider-accurate keys', () => {
    const replicas = replicasForPermanentDelete([
      { provider: 'vercel', source_key: 'uploads/file%20name.png', logical_key: 'legacy/asset/original-deadbeef', delivery_url: 'https://blob.example.test/uploads/file%20name.png', active: false },
      { provider: 's3', source_key: 'uploads/file%20name.png', logical_key: 'assets/asset-1/original.png', delivery_url: 'https://objects.example.test/sploot/assets/asset-1/original.png', active: true },
      { provider: 'vercel', source_key: 'uploads/file%20name.png', logical_key: 'legacy/asset/original-deadbeef', delivery_url: 'https://blob.example.test/uploads/file%20name.png', active: false },
    ], []);
    expect(replicas).toEqual([
      { provider: 'vercel', key: 'uploads/file%20name.png', url: 'https://blob.example.test/uploads/file%20name.png' },
      { provider: 's3', key: 'assets/asset-1/original.png', url: 'https://objects.example.test/sploot/assets/asset-1/original.png' },
    ]);
  });

  it('accepts an encoded raw Vercel URL for provider-local deletion', async () => {
    const legacy = new VercelObjectStore('https://blob.example.test/base');
    vi.mocked(del).mockResolvedValue(undefined);
    await legacy.deleteUrl('https://blob.example.test/base/uploads/file%20name.png');
    expect(del).toHaveBeenCalledWith('https://blob.example.test/base/uploads/file%20name.png');
  });

  it('reclaims an expired in-flight migration lease', async () => {
    const source = new InMemoryObjectStore('legacy');
    let signalStarted: (() => void) | undefined;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    let releaseFirst: (() => void) | undefined;
    const release = new Promise<void>(resolve => { releaseFirst = resolve; });
    const target = new (class extends InMemoryObjectStore {
      private reads = 0;

      constructor() {
        super('s3');
      }

      override async get(key: string) {
        this.reads += 1;
        if (this.reads === 1) {
          signalStarted?.();
          await release;
          throw new ObjectNotFoundError(key);
        }
        return super.get(key);
      }
    })();
    await source.put('assets/retry.png', bytes, metadata);
    const verifier = new MigrationVerifier({
      source,
      target,
      manifest: [{ logicalKey: 'assets/retry.png', sourceKey: 'assets/retry.png', size: metadata.size, sha256: metadata.sha256 }],
      maxAttempts: 2,
      leaseMs: 5,
    });

    const firstRun = verifier.runBatch({ limit: 1, workerId: 'worker-a' });
    await started;
    await new Promise(resolve => setTimeout(resolve, 25));
    const secondRun = verifier.runBatch({ limit: 1, workerId: 'worker-b' });
    await secondRun;
    releaseFirst?.();
    await firstRun;

    expect((await verifier.receipt()).entries[0]).toMatchObject({ status: 'verified', attempts: 2 });
  });

  it('resumes bounded copies idempotently and rolls back only verified targets', async () => {
    const source = new InMemoryObjectStore('legacy');
    const target = new InMemoryObjectStore('s3');
    await source.put('assets/a.png', bytes, metadata);
    const manifest: MigrationManifestEntry[] = [
      { logicalKey: 'assets/a.png', sourceKey: 'assets/a.png', size: metadata.size, sha256: metadata.sha256 },
      { logicalKey: 'assets/missing.png', sourceKey: 'assets/missing.png', size: 1, sha256: '1'.repeat(64) },
    ];
    const verifier = new MigrationVerifier({ source, target, manifest, maxAttempts: 2 });
    const first = await verifier.runBatch({ limit: 1, workerId: 'worker-a' });
    expect(first.verified).toBe(1);
    const second = await verifier.runBatch({ limit: 10, workerId: 'worker-b' });
    expect(second.missing).toBe(1);
    expect((await verifier.receipt()).entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ logicalKey: 'assets/a.png', status: 'verified' }),
        expect.objectContaining({ logicalKey: 'assets/missing.png', status: 'missing' }),
      ]),
    );
    const rollback = await verifier.rollback({ limit: 10, workerId: 'rollback-a' });
    expect(rollback.rolledBack).toBe(1);
    await expect(target.get('assets/a.png')).rejects.toThrow(/not found/);
  });
});

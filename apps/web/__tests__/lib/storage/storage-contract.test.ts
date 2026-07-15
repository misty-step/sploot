import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalLogicalKey,
  createStorageConfig,
  assertCutoverTransition,
  storageConfigFingerprint,
} from '@/lib/storage/config';
import {
  InMemoryObjectStore,
  PortableObjectStore,
  type ObjectMetadata,
} from '@/lib/storage/object-store';
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
        endpoint: 'http://objects.example.test',
        bucket: 'x',
        allowHttpTestFixture: true,
      }).endpoint,
    ).toBe('http://objects.example.test');
  });

  it('requires verified evidence for target phases and forbids unsafe skips', () => {
    expect(() => createStorageConfig({ provider: 's3', phase: 'target', endpoint: 'https://objects.example.test', bucket: 'sploot' })).toThrow(/manifest SHA-256/);
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

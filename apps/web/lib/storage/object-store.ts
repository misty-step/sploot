import { createHash } from 'node:crypto';
import { createHmac } from 'node:crypto';
import { del, list as listVercel, put } from '@vercel/blob';
import { canonicalLogicalKey, createStorageConfig, storageConfigFingerprint, storageConfigFromEnv, type StorageConfig, type StoragePhase } from './config';

export interface ObjectMetadata {
  size: number;
  sha256: string;
  contentType?: string;
}

export interface StorageReplica { provider: string; key: string; url: string; }

export interface StorageWrite extends StorageReplica { metadata: ObjectMetadata; replicas?: StorageReplica[]; }

export interface StoredObject {
  key: string;
  url: string;
  metadata: ObjectMetadata;
  body: Uint8Array | AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;
}

export type ObjectBody = Uint8Array | ArrayBuffer | Blob | AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;

export interface ObjectStore {
  readonly provider: string;
  put(key: string, body: ObjectBody, metadata: ObjectMetadata): Promise<StorageWrite>;
  get(key: string): Promise<StoredObject>;
  getUrl?(url: string): Promise<StoredObject>;
  getSourceKey?(key: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  list?(prefix: string, limit: number): Promise<Array<{ pathname: string; url: string }>>;
  ownsUrl?(url: string): boolean;
  deleteUrl?(url: string): Promise<void>;
  keyFromUrl?(url: string): string | null;
}

export class ObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Object not found: ${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

export class ObjectParityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObjectParityError';
  }
}

export async function bodyToBuffer(body: ObjectBody, maxBytes: number): Promise<Buffer> {
  if (ArrayBuffer.isView(body)) return copyBounded(new Uint8Array(body.buffer, body.byteOffset, body.byteLength), maxBytes);
  if (body instanceof ArrayBuffer) return copyBounded(new Uint8Array(body), maxBytes);
  if (typeof Blob !== 'undefined' && body instanceof Blob) return copyBounded(new Uint8Array(await body.arrayBuffer()), maxBytes);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of toAsyncIterable(body as AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>)) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new ObjectParityError(`Object exceeds bounded limit of ${maxBytes} bytes`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}

async function* toAsyncIterable(body: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  if (typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === 'function') {
    yield* body as AsyncIterable<Uint8Array>;
    return;
  }
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return;
      yield next.value;
    }
  } finally {
    reader.releaseLock();
  }
}

function copyBounded(bytes: Uint8Array, maxBytes: number): Buffer {
  if (bytes.byteLength > maxBytes) throw new ObjectParityError(`Object exceeds bounded limit of ${maxBytes} bytes`);
  return Buffer.from(bytes);
}

function actualMetadata(bytes: Buffer, contentType?: string): ObjectMetadata {
  return { size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), contentType };
}

function assertMetadata(actual: ObjectMetadata, expected: ObjectMetadata): void {
  if (actual.size !== expected.size) throw new ObjectParityError(`Object size mismatch: expected ${expected.size}, got ${actual.size}`);
  if (actual.sha256 !== expected.sha256) throw new ObjectParityError(`Object SHA-256 mismatch: expected ${expected.sha256}, got ${actual.sha256}`);
  if (expected.contentType && actual.contentType?.toLowerCase().split(';')[0].trim() !== expected.contentType.toLowerCase().split(';')[0].trim()) {
    throw new ObjectParityError(`Object content type mismatch: expected ${expected.contentType}, got ${actual.contentType ?? 'missing'}`);
  }
}

export class PortableObjectStore {
  private readonly target?: ObjectStore;
  private readonly phase: StoragePhase;
  private readonly maxBytes: number;

  constructor(private readonly options: { legacy: ObjectStore; target?: ObjectStore; phase: StoragePhase; maxBytes?: number }) {
    this.target = options.target;
    this.phase = options.phase;
    this.maxBytes = options.maxBytes ?? 512 * 1024 * 1024;
    if (this.phase !== 'legacy' && !this.target) throw new Error(`Storage phase ${this.phase} requires a target provider`);
  }

  private providers(): ObjectStore[] {
    if (this.phase === 'legacy') return [this.options.legacy];
    if (!this.target) throw new Error('Target provider is not configured');
    return this.phase === 'target' ? [this.target, this.options.legacy] : [this.options.legacy, this.target];
  }

  async putVerified(key: string, body: ObjectBody, expected: ObjectMetadata): Promise<{ confirmed: true; key: string; url: string; providers: string[]; replicas: StorageReplica[] }> {
    const logicalKey = canonicalLogicalKey(key);
    const bytes = await bodyToBuffer(body, Math.min(this.maxBytes, Math.max(expected.size, 1)));
    const actual = actualMetadata(bytes, expected.contentType);
    assertMetadata(actual, expected);
    const written: Array<{ store: ObjectStore; replica: StorageReplica }> = [];
    const replicas: StorageReplica[] = [];
    try {
      for (const provider of this.providers()) {
        const replica = await provider.put(logicalKey, bytes, actual);
        const storedReplica = { provider: replica.provider, key: replica.key, url: replica.url };
        written.push({ store: provider, replica: storedReplica });
        replicas.push(storedReplica);
        const readback = provider.getUrl ? await provider.getUrl(replica.url) : await provider.get(logicalKey);
        const readbackBytes = await bodyToBuffer(readback.body, this.maxBytes);
        assertMetadata(actualMetadata(readbackBytes, readback.metadata.contentType), expected);
      }
    } catch (error) {
      await Promise.allSettled(written.map(({ store, replica }) => (store.getUrl && store.deleteUrl) ? store.deleteUrl(replica.url) : store.delete(replica.key)));
      throw error;
    }
    const primary = this.providers()[0];
    return { confirmed: true, key: logicalKey, url: replicas[0]!.url, providers: this.providers().map(p => p.provider), replicas };
  }

  async get(key: string): Promise<StoredObject> {
    const logicalKey = canonicalLogicalKey(key);
    let missing: unknown;
    for (const provider of this.providers()) {
      try { return await provider.get(logicalKey); } catch (error) {
        if (!(error instanceof ObjectNotFoundError)) throw error;
        missing = error;
      }
    }
    throw missing ?? new ObjectNotFoundError(logicalKey);
  }

  async delete(key: string): Promise<void> {
    const logicalKey = canonicalLogicalKey(key);
    const results = await Promise.allSettled(this.providers().map(provider => provider.delete(logicalKey)));
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failure) throw failure.reason;
  }

  async deleteUrl(url: string): Promise<void> {
    const owner = [this.options.legacy, this.target].find(provider => provider?.ownsUrl?.(url));
    if (!owner?.deleteUrl) throw new Error('Storage URL is not owned by a configured provider');
    // A URL identifies one provider-local object. Never derive a logical key
    // and delete the same-looking key from another provider: legacy source keys
    // can be inventory-rewritten and may contain encoded path bytes.
    await owner.deleteUrl(url);
  }

  async deleteReplica(replica: StorageReplica): Promise<void> {
    const provider = [this.options.legacy, this.target].find(candidate => candidate?.provider === replica.provider);
    if (!provider) throw new Error(`Storage provider is not configured: ${replica.provider}`);
    if (replica.provider === this.options.legacy.provider && provider.deleteUrl) {
      await provider.deleteUrl(replica.url);
      return;
    }
    await provider.delete(replica.key);
  }

  async deleteReplicas(replicas: StorageReplica[]): Promise<void> {
    const results = await Promise.allSettled(replicas.map(replica => this.deleteReplica(replica)));
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failure) throw failure.reason;
  }
}

export interface StorageWriter {
  readonly strict: boolean;
  put(key: string, body: ObjectBody, metadata: ObjectMetadata): Promise<StorageWrite>;
  deleteUrl(url: string): Promise<void>;
  deleteReplicas?(replicas: StorageReplica[]): Promise<void>;
  deleteReplica?(replica: StorageReplica): Promise<void>;
  deleteKey?(provider: string, key: string): Promise<void>;
}

/**
 * The only provider-selection seam used by upload callers. Legacy mode keeps
 * the current Vercel behavior; every explicit portability phase uses the
 * parity-checked dual-provider writer and fails closed on any mismatch.
 */
export class ConfiguredStorageWriter implements StorageWriter {
  private readonly legacy: VercelObjectStore;
  private readonly portable?: PortableObjectStore;
  readonly strict: boolean;

  constructor(private readonly config: StorageConfig = storageConfigFromEnv(), legacyAddRandomSuffix = false) {
    this.legacy = new VercelObjectStore(config.legacyBaseUrl, legacyAddRandomSuffix);
    if (config.phase !== 'legacy' || config.provider !== 'vercel') {
      this.portable = createDefaultObjectStore(config);
    }
    this.strict = !!this.portable;
  }

  private async assertRuntimeCutoverState(): Promise<void> {
    if (this.config.phase === 'legacy') return;
    if (!this.config.manifestSha256) throw new Error('Storage runtime requires STORAGE_CUTOVER_MANIFEST_SHA256');
    const { prisma } = await import('@/lib/db');
    const state = await prisma.storageCutoverState.findUnique({ where: { id: 'default' } });
    const fingerprint = storageConfigFingerprint(this.config);
    if (!state) throw new Error('Storage cutover state is absent; refusing non-legacy storage operation');
    if (state.phase !== this.config.phase || state.providerFingerprint !== fingerprint || state.manifestSha256 !== this.config.manifestSha256) {
      throw new Error('Storage cutover state does not match runtime provider configuration and manifest');
    }
  }

  async put(key: string, body: ObjectBody, metadata: ObjectMetadata) {
    await this.assertRuntimeCutoverState();
    if (this.portable) {
      const result = await this.portable.putVerified(key, body, metadata);
      return { provider: result.providers[0]!, key: result.key, url: result.url, metadata, replicas: result.replicas };
    }
    const result = await this.legacy.put(key, body, metadata);
    return { ...result, replicas: [{ provider: result.provider, key: result.key, url: result.url }] };
  }

  async get(key: string): Promise<StoredObject> {
    await this.assertRuntimeCutoverState();
    if (this.portable) return this.portable.get(key);
    return this.legacy.get(key);
  }

  async deleteKey(provider: string, key: string) {
    await this.assertRuntimeCutoverState();
    if (this.portable) {
      if (provider === 'vercel') throw new Error('Provider-local Vercel deletion requires the recorded delivery URL');
      return this.portable.deleteReplica({ provider, key, url: '' });
    }
    if (provider !== 'vercel') throw new Error(`Storage provider is not configured: ${provider}`);
    return this.legacy.delete(key);
  }

  async deleteReplica(replica: StorageReplica) {
    await this.assertRuntimeCutoverState();
    if (this.portable) return this.portable.deleteReplica(replica);
    if (replica.provider !== 'vercel') throw new Error(`Storage provider is not configured: ${replica.provider}`);
    return this.legacy.deleteUrl(replica.url);
  }

  async deleteReplicas(replicas: StorageReplica[]) {
    await this.assertRuntimeCutoverState();
    if (this.portable) return this.portable.deleteReplicas(replicas);
    return Promise.all(replicas.map(replica => this.deleteReplica(replica))).then(() => undefined);
  }

  async deleteUrl(url: string) {
    await this.assertRuntimeCutoverState();
    if (this.portable) return this.portable.deleteUrl(url);
    return this.legacy.delete(url);
  }
}

export class InMemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, { bytes: Buffer; metadata: ObjectMetadata }>();
  constructor(readonly provider: string) {}

  async put(key: string, body: ObjectBody, metadata: ObjectMetadata) {
    const bytes = await bodyToBuffer(body, Math.max(metadata.size, 1));
    const actual = actualMetadata(bytes, metadata.contentType);
    assertMetadata(actual, metadata);
    this.objects.set(canonicalLogicalKey(key), { bytes, metadata: actual });
    return { provider: this.provider, key, url: `${this.provider}://${key}`, metadata: actual };
  }

  async get(key: string): Promise<StoredObject> {
    const object = this.objects.get(canonicalLogicalKey(key));
    if (!object) throw new ObjectNotFoundError(key);
    return { key, url: `${this.provider}://${key}`, metadata: object.metadata, body: Buffer.from(object.bytes) };
  }

  async delete(key: string) { this.objects.delete(canonicalLogicalKey(key)); }
}

export class VercelObjectStore implements ObjectStore {
  readonly provider = 'vercel';
  constructor(
    private readonly baseUrl = process.env.NEXT_PUBLIC_BLOB_BASE_URL ?? 'https://your-blob-store.vercel-storage.com',
    private readonly addRandomSuffix = false,
  ) {}

  async put(key: string, body: ObjectBody, metadata: ObjectMetadata) {
    const bytes = await bodyToBuffer(body, Math.max(metadata.size, 1));
    const actual = actualMetadata(bytes, metadata.contentType);
    assertMetadata(actual, metadata);
    const result = await put(canonicalLogicalKey(key), bytes, {
      access: 'public', addRandomSuffix: this.addRandomSuffix, contentType: actual.contentType,
    });
    return { provider: this.provider, key: result.pathname, url: result.url, metadata: actual };
  }

  async get(key: string): Promise<StoredObject> {
    const logicalKey = canonicalLogicalKey(key);
    return this.readUrl(`${this.baseUrl.replace(/\/$/, '')}/${logicalKey}`, logicalKey);
  }

  async getSourceKey(key: string): Promise<StoredObject> {
    if (typeof key !== 'string' || key.length === 0 || key.length > 2048 || key.includes('\\') || key.includes('\0') || key.split('/').some(segment => segment === '.' || segment === '..' || segment.length === 0)) throw new Error('Legacy storage source key is invalid');
    const encoded = key.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return this.readUrl(`${this.baseUrl.replace(/\/$/, '')}/${encoded}`, key);
  }

  async getUrl(url: string): Promise<StoredObject> {
    const logicalKey = this.keyFromUrl(url);
    if (!logicalKey) throw new Error('Storage URL is not owned by the configured Vercel provider');
    return this.readUrl(url, logicalKey);
  }

  private async readUrl(url: string, logicalKey: string): Promise<StoredObject> {
    const response = await fetch(url);
    if (response.status === 404) throw new ObjectNotFoundError(logicalKey);
    if (!response.ok || !response.body) throw new Error(`Vercel Blob read failed: ${response.status}`);
    return { key: logicalKey, url: response.url, metadata: { size: Number(response.headers.get('content-length') ?? 0), sha256: response.headers.get('x-amz-meta-sha256') ?? '', contentType: response.headers.get('content-type') ?? undefined }, body: response.body };
  }
  ownsUrl(url: string): boolean {
    return this.ownsDeliveryUrl(url);
  }

  private ownsDeliveryUrl(url: string): boolean {
    try {
      // URL parsing normalizes literal/encoded dot segments, so reject those
      // bytes in the raw input before normalization can hide traversal.
      if (/(?:\\|%2e|%2f|%5c)/i.test(url)) return false;
      const candidate = new URL(url);
      const base = new URL(this.baseUrl);
      if (candidate.protocol !== 'https:' || candidate.origin !== base.origin || candidate.search || candidate.hash || candidate.username || candidate.password) return false;
      // Reject encoded traversal/separator bytes before passing the raw URL to
      // the provider; encoded spaces and other ordinary pathname bytes remain valid.
      if (/[\\]|%2e|%2f|%5c/i.test(candidate.pathname)) return false;
      const basePath = base.pathname.replace(/\/$/, '');
      const prefix = basePath ? `${basePath}/` : '/';
      return candidate.pathname.startsWith(prefix) && candidate.pathname.length > prefix.length;
    } catch {
      return false;
    }
  }

  keyFromUrl(url: string): string | null {
    try {
      const candidate = new URL(url);
      const base = new URL(this.baseUrl);
      if (candidate.protocol !== 'https:' || candidate.origin !== base.origin || candidate.search || candidate.hash || candidate.username || candidate.password) return null;
      const basePath = base.pathname.replace(/\/$/, '');
      const prefix = basePath ? `${basePath}/` : '/';
      const logicalKey = candidate.pathname.startsWith(prefix) ? candidate.pathname.slice(prefix.length) : '';
      canonicalLogicalKey(logicalKey);
      return logicalKey || null;
    } catch {
      return null;
    }
  }
  async deleteUrl(url: string) {
    // Deletion validates provider ownership without canonicalizing the raw URL.
    // Legacy Blob pathname bytes may be percent-encoded or contain spaces.
    if (!this.ownsDeliveryUrl(url)) throw new Error('Storage URL is not owned by the configured Vercel provider');
    await del(url);
  }

  async delete(key: string) {
    if (key.startsWith('http://') || key.startsWith('https://')) return this.deleteUrl(key);
    await del(`${this.baseUrl.replace(/\/$/, '')}/${canonicalLogicalKey(key)}`);
  }

  async list(prefix: string, limit: number) {
    const canonicalPrefix = prefix.endsWith('/') ? `${canonicalLogicalKey(prefix.slice(0, -1))}/` : canonicalLogicalKey(prefix);
    const result = await listVercel({ prefix: canonicalPrefix, limit });
    return result.blobs.map(blob => ({ pathname: blob.pathname, url: blob.url }));
  }
}

export class S3CompatibleObjectStore implements ObjectStore {
  readonly provider = 's3';
  private readonly endpoint: URL;
  private readonly publicUrlBase: URL;

  constructor(private readonly config: StorageConfig) {
    if (config.provider !== 's3' || !config.accessKeyId || !config.secretAccessKey) {
      throw new Error('S3-compatible storage requires explicit non-empty credentials');
    }
    this.endpoint = new URL(config.endpoint);
    if (!config.publicUrlBase) throw new Error('S3-compatible storage requires a stable public delivery base');
    this.publicUrlBase = new URL(config.publicUrlBase);
    if (this.endpoint.protocol !== 'https:' && !(config.allowHttpTestFixture && process.env.NODE_ENV === 'test')) {
      throw new Error('S3-compatible runtime endpoint must use HTTPS');
    }
  }

  async put(key: string, body: ObjectBody, metadata: ObjectMetadata) {
    const logicalKey = canonicalLogicalKey(key);
    const bytes = await bodyToBuffer(body, Math.max(metadata.size, 1));
    const actual = actualMetadata(bytes, metadata.contentType);
    assertMetadata(actual, metadata);
    const response = await this.request('PUT', logicalKey, bytes, metadata.contentType);
    if (!response.ok) throw new Error(`S3-compatible write failed: ${response.status}`);
    return { provider: this.provider, key: logicalKey, url: this.objectUrl(logicalKey), metadata: actual };
  }

  async get(key: string): Promise<StoredObject> {
    const logicalKey = canonicalLogicalKey(key);
    const response = await this.request('GET', logicalKey);
    if (response.status === 404) throw new ObjectNotFoundError(logicalKey);
    if (!response.ok || !response.body) throw new Error(`S3-compatible read failed: ${response.status}`);
    return {
      key: logicalKey,
      url: this.objectUrl(logicalKey),
      metadata: {
        size: Number(response.headers.get('content-length') ?? 0),
        sha256: response.headers.get('x-amz-meta-sha256') ?? '',
        contentType: response.headers.get('content-type') ?? undefined,
      },
      body: response.body,
    };
  }

  ownsUrl(url: string): boolean {
    return this.keyFromUrl(url) !== null;
  }

  async deleteUrl(url: string) {
    const key = this.keyFromUrl(url);
    if (!key) throw new Error('Storage URL is not owned by the configured S3 provider');
    await this.delete(key);
  }

  async delete(key: string) {
    const logicalKey = canonicalLogicalKey(key);
    const response = await this.request('DELETE', logicalKey);
    if (!response.ok && response.status !== 404) throw new Error(`S3-compatible delete failed: ${response.status}`);
  }

  keyFromUrl(url: string): string | null {
    try {
      const candidate = new URL(url);
      if (candidate.protocol !== 'https:' || candidate.origin !== this.publicUrlBase.origin || candidate.username || candidate.password || candidate.search || candidate.hash) return null;
      const prefix = `${this.publicUrlBase.pathname.replace(/\/$/, '')}/${encodeRfc3986(this.config.bucket)}/`;
      if (!candidate.pathname.startsWith(prefix)) return null;
      return canonicalLogicalKey(decodeURIComponent(candidate.pathname.slice(prefix.length)));
    } catch { return null; }
  }

  private objectUrl(key: string): string {
    const base = this.publicUrlBase.toString().replace(/\/$/, '');
    return `${base}/${encodeRfc3986(this.config.bucket)}/${key.split('/').map(encodeRfc3986).join('/')}`;
  }

  private async request(method: string, key: string, body?: Uint8Array, contentType?: string): Promise<Response> {
    const encodedKey = key.split('/').map(encodeRfc3986).join('/');
    const endpointBase = this.endpoint.toString().replace(/\/$/, '');
    const requestPath = `${this.endpoint.pathname.replace(/\/$/, '')}/${encodeRfc3986(this.config.bucket)}/${encodedKey}`;
    const url = new URL(`${endpointBase}/${encodeRfc3986(this.config.bucket)}/${encodedKey}`);
    const payloadHash = body ? sha256Hex(body) : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (body) headers['content-length'] = String(body.byteLength);
    if (contentType) headers['content-type'] = contentType;
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers).sort().map(name => `${name}:${headers[name]!.trim()}\n`).join('');
    const canonicalRequest = [method, requestPath, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${date}/${this.config.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(Buffer.from(canonicalRequest))].join('\n');
    const signingKey = hmac(hmac(hmac(hmac(Buffer.from(`AWS4${this.config.secretAccessKey}`), date), this.config.region), 's3'), 'aws4_request');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(signingKey, stringToSign).toString('hex')}`;
    return fetch(url, { method, headers, body: body as BodyInit | undefined });
  }
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Uint8Array, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

export function createDefaultObjectStore(config: StorageConfig = storageConfigFromEnv()): PortableObjectStore {
  const legacy = new VercelObjectStore(config.legacyBaseUrl);
  if (config.provider === 'vercel' && config.phase === 'legacy') return new PortableObjectStore({ legacy, phase: config.phase });
  const target = new S3CompatibleObjectStore(config);
  return new PortableObjectStore({ legacy, target, phase: config.phase });
}

export function defaultStorageConfig(): StorageConfig {
  return createStorageConfig({ provider: 'vercel', bucket: 'legacy-blob-store', endpoint: 'https://objects.invalid.example.test' });
}

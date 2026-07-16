import { createHash } from 'node:crypto';
import { createHmac } from 'node:crypto';
import { del, list as listVercel, put } from '@vercel/blob';
import { canonicalLogicalKey, createStorageConfig, storageConfigFromEnv, type StorageConfig, type StoragePhase } from './config';

export interface ObjectMetadata {
  size: number;
  sha256: string;
  contentType?: string;
}

export interface StoredObject {
  key: string;
  url: string;
  metadata: ObjectMetadata;
  body: Uint8Array | AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;
}

export type ObjectBody = Uint8Array | ArrayBuffer | Blob | AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;

export interface ObjectStore {
  readonly provider: string;
  put(key: string, body: ObjectBody, metadata: ObjectMetadata): Promise<{ provider: string; key: string; url: string; metadata: ObjectMetadata }>;
  get(key: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  list?(prefix: string, limit: number): Promise<Array<{ pathname: string; url: string }>>;
  ownsUrl?(url: string): boolean;
  deleteUrl?(url: string): Promise<void>;
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

  async putVerified(key: string, body: ObjectBody, expected: ObjectMetadata): Promise<{ confirmed: true; key: string; url: string; providers: string[] }> {
    const logicalKey = canonicalLogicalKey(key);
    const bytes = await bodyToBuffer(body, Math.min(this.maxBytes, Math.max(expected.size, 1)));
    const actual = actualMetadata(bytes, expected.contentType);
    assertMetadata(actual, expected);
    const written: Array<{ store: ObjectStore; key: string }> = [];
    try {
      for (const provider of this.providers()) {
        await provider.put(logicalKey, bytes, actual);
        written.push({ store: provider, key: logicalKey });
        const readback = await provider.get(logicalKey);
        const readbackBytes = await bodyToBuffer(readback.body, this.maxBytes);
        assertMetadata(actualMetadata(readbackBytes, actual.contentType), expected);
      }
    } catch (error) {
      await Promise.allSettled(written.map(({ store, key: writtenKey }) => store.delete(writtenKey)));
      throw error;
    }
    const primary = this.providers()[0];
    return { confirmed: true, key: logicalKey, url: (await primary.get(logicalKey)).url, providers: this.providers().map(p => p.provider) };
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
    for (const provider of [this.options.legacy, this.target].filter(Boolean) as ObjectStore[]) {
      if (provider.ownsUrl?.(url) && provider.deleteUrl) {
        await provider.deleteUrl(url);
        return;
      }
    }
    throw new Error('Storage URL is not owned by a configured provider');
  }
}

export interface StorageWriter {
  readonly strict: boolean;
  put(key: string, body: ObjectBody, metadata: ObjectMetadata): Promise<{ provider: string; key: string; url: string; metadata: ObjectMetadata }>;
  deleteUrl(url: string): Promise<void>;
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

  constructor(config: StorageConfig = storageConfigFromEnv(), legacyAddRandomSuffix = false) {
    this.legacy = new VercelObjectStore(config.legacyBaseUrl, legacyAddRandomSuffix);
    if (config.phase !== 'legacy' || config.provider !== 'vercel') {
      this.portable = createDefaultObjectStore(config);
    }
    this.strict = !!this.portable;
  }

  async put(key: string, body: ObjectBody, metadata: ObjectMetadata) {
    if (this.portable) {
      const result = await this.portable.putVerified(key, body, metadata);
      return { provider: result.providers[0]!, key: result.key, url: result.url, metadata };
    }
    return this.legacy.put(key, body, metadata);
  }

  async deleteUrl(url: string) {
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
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/${logicalKey}`);
    if (response.status === 404) throw new ObjectNotFoundError(logicalKey);
    if (!response.ok || !response.body) throw new Error(`Vercel Blob read failed: ${response.status}`);
    return { key: logicalKey, url: response.url, metadata: { size: Number(response.headers.get('content-length') ?? 0), sha256: response.headers.get('x-amz-meta-sha256') ?? '' }, body: response.body };
  }

  ownsUrl(url: string): boolean {
    try {
      const candidate = new URL(url);
      const base = new URL(this.baseUrl);
      const isVercelBlobHost = candidate.hostname.endsWith('.public.blob.vercel-storage.com') || candidate.hostname === 'blob.vercel-storage.com';
      if ((candidate.origin !== base.origin && !isVercelBlobHost) || candidate.protocol !== 'https:' || candidate.search || candidate.hash) return false;
      const basePath = candidate.origin === base.origin ? base.pathname.replace(/\/$/, '') : '';
      const prefix = basePath ? `${basePath}/` : '/';
      const logicalKey = candidate.pathname.startsWith(prefix) ? candidate.pathname.slice(prefix.length) : '';
      canonicalLogicalKey(logicalKey);
      return logicalKey.length > 0;
    } catch {
      return false;
    }
  }

  async deleteUrl(url: string) {
    if (!this.ownsUrl(url)) throw new Error('Storage URL is not owned by the configured Vercel provider');
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

  constructor(private readonly config: StorageConfig) {
    if (config.provider !== 's3' || !config.accessKeyId || !config.secretAccessKey) {
      throw new Error('S3-compatible storage requires explicit non-empty credentials');
    }
    this.endpoint = new URL(config.endpoint);
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

  private keyFromUrl(url: string): string | null {
    const prefix = `s3://${this.config.bucket}/`;
    if (!url.startsWith(prefix)) return null;
    try {
      return canonicalLogicalKey(url.slice(prefix.length));
    } catch {
      return null;
    }
  }

  private objectUrl(key: string): string {
    return `s3://${this.config.bucket}/${key}`;
  }

  private async request(method: string, key: string, body?: Uint8Array, contentType?: string): Promise<Response> {
    const encodedKey = key.split('/').map(encodeRfc3986).join('/');
    const url = new URL(`${this.endpoint.toString().replace(/\/$/, '')}/${encodeRfc3986(this.config.bucket)}/${encodedKey}`);
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
    const canonicalRequest = [method, `/${encodeRfc3986(this.config.bucket)}/${encodedKey}`, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
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

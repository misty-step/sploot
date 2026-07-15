import { createHash } from 'node:crypto';

export type StorageProvider = 'vercel' | 's3';
export type StoragePhase = 'legacy' | 'shadow' | 'dual-write' | 'target' | 'rollback';

const MAX_KEY_LENGTH = 1024;
const MAX_COMPONENT_LENGTH = 128;
const MAX_COMPONENTS = 32;
const COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface StorageConfig {
  provider: StorageProvider;
  phase: StoragePhase;
  endpoint: string;
  bucket: string;
  region: string;
  configVersion: string;
  legacyBaseUrl: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  allowHttpTestFixture: boolean;
  manifestSha256?: string;
}

export type StorageConfigInput = Partial<StorageConfig> & {
  provider: StorageProvider;
  endpoint?: string;
  bucket?: string;
  region?: string;
  configVersion?: string;
  phase?: StoragePhase;
  allowHttpTestFixture?: boolean;
  manifestSha256?: string;
};

export function canonicalLogicalKey(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_KEY_LENGTH) {
    throw new Error(`Logical storage key must be 1-${MAX_KEY_LENGTH} ASCII bytes`);
  }
  if (!/^[\x21-\x7e]+$/.test(value) || /[%?#]/.test(value)) {
    throw new Error('Logical storage key must be printable ASCII without percent/query/hash syntax');
  }
  if (value.startsWith('/') || value.endsWith('/') || value.includes('//')) {
    throw new Error('Logical storage key cannot have empty path components');
  }
  const components = value.split('/');
  if (components.length > MAX_COMPONENTS || components.some(component =>
    component.length === 0 || component.length > MAX_COMPONENT_LENGTH || component === '.' || component === '..' || !COMPONENT.test(component)
  )) {
    throw new Error('Logical storage key contains an invalid component');
  }
  return value;
}

function validateEndpoint(endpoint: string, allowHttpTestFixture: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('Storage endpoint must be an absolute URL');
  }
  const httpFixture = parsed.protocol === 'http:' && allowHttpTestFixture && process.env.NODE_ENV === 'test';
  if (parsed.protocol !== 'https:' && !httpFixture) {
    throw new Error('Runtime object-storage endpoint must use HTTPS');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Storage endpoint cannot contain credentials, query, or hash data');
  }
  return parsed.toString().replace(/\/$/, '');
}

export function createStorageConfig(input: StorageConfigInput): StorageConfig {
  const allowHttpTestFixture = input.allowHttpTestFixture ?? false;
  const endpoint = validateEndpoint(input.endpoint ?? 'https://invalid.example.test', allowHttpTestFixture);
  const legacyBaseUrl = validateEndpoint(input.legacyBaseUrl ?? 'https://your-blob-store.vercel-storage.com', false);
  if (input.provider === 's3' && !input.bucket) throw new Error('S3-compatible storage requires a bucket');
  if (!input.bucket || !/^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$/.test(input.bucket)) {
    throw new Error('Storage bucket identity is invalid');
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(input.configVersion ?? 'v1')) {
    throw new Error('Storage config version must be a bounded non-secret identity');
  }
  if ((input.phase === 'target' || input.phase === 'rollback') && !/^[a-f0-9]{64}$/.test(input.manifestSha256 ?? '')) {
    throw new Error(`${input.phase} phase requires a verified manifest SHA-256`);
  }
  return {
    provider: input.provider,
    phase: input.phase ?? 'legacy',
    endpoint,
    bucket: input.bucket,
    region: input.region ?? 'auto',
    configVersion: input.configVersion ?? 'v1',
    legacyBaseUrl,
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    allowHttpTestFixture,
    manifestSha256: input.manifestSha256,
  };
}

export function storageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const provider = (env.STORAGE_PROVIDER ?? 'vercel') as StorageProvider;
  const phase = (env.STORAGE_PHASE ?? 'legacy') as StoragePhase;
  if (!['vercel', 's3'].includes(provider)) throw new Error('STORAGE_PROVIDER must be vercel or s3');
  if (!['legacy', 'shadow', 'dual-write', 'target', 'rollback'].includes(phase)) throw new Error('STORAGE_PHASE is invalid');
  return createStorageConfig({
    provider,
    phase,
    endpoint: env.STORAGE_S3_ENDPOINT ?? 'https://objects.invalid.example.test',
    bucket: env.STORAGE_S3_BUCKET ?? 'sploot-portability-placeholder',
    region: env.STORAGE_S3_REGION,
    configVersion: env.STORAGE_CONFIG_VERSION,
    legacyBaseUrl: env.NEXT_PUBLIC_BLOB_BASE_URL,
    accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
    allowHttpTestFixture: env.STORAGE_ALLOW_HTTP_TEST_FIXTURE === 'true',
    manifestSha256: env.STORAGE_CUTOVER_MANIFEST_SHA256,
  });
}

export function storageConfigFingerprint(config: StorageConfig): string {
  const identity = JSON.stringify({
    provider: config.provider,
    phaseIndependentProvider: config.provider,
    endpoint: config.endpoint,
    bucket: config.bucket,
    region: config.region,
    configVersion: config.configVersion,
    legacyBaseUrl: config.legacyBaseUrl,
  });
  return createHash('sha256').update(identity).digest('hex');
}

export function assertCutoverTransition(from: StoragePhase, to: StoragePhase): void {
  const allowed: Record<StoragePhase, StoragePhase[]> = {
    legacy: ['shadow'],
    shadow: ['dual-write', 'rollback'],
    'dual-write': ['target', 'rollback'],
    target: ['rollback'],
    rollback: ['dual-write', 'legacy'],
  };
  if (!allowed[from].includes(to)) throw new Error(`Unsafe storage phase transition: ${from} -> ${to}`);
}

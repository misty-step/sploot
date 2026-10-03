import type { SplootConfig } from './config.js';

/**
 * Thin HTTP client over Sploot's published, token-scoped public contract
 * (apps/web/docs/PUBLIC_API.md): save (bytes or URL) and search. Deduping,
 * quotas, embeddings, and the similarity floor stay on the server. This client
 * forwards the published fields and accepts only a created receipt, a duplicate
 * receipt, or a search page. Busy, non-duplicate conflict, and unreadable
 * bodies are errors.
 */

export interface AssetTag {
  id: string;
  name: string;
}

export interface UploadedAsset {
  id: string;
  blobUrl: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum?: string;
  createdAt: string;
  needsEmbedding: boolean;
}

export interface SaveResponse {
  success: boolean;
  isDuplicate: boolean;
  asset: UploadedAsset;
  message: string;
}

export interface SearchResultItem {
  id: string;
  blobUrl: string;
  filename: string;
  mime: string;
  favorite: boolean;
  similarity: number;
  relevance: number;
  tags: AssetTag[];
}

export interface SearchResponse {
  results: SearchResultItem[];
  query: string;
  total: number;
  hasMore: boolean;
  nextCursor?: string;
  limit: number;
  threshold: number;
  processingTime: number;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  cursor?: string;
  favoriteOnly?: boolean;
  tagId?: string;
  offset?: number;
}

export class SplootApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = 'SplootApiError';
  }
}

type FetchLike = typeof fetch;

const SHA256_HEX = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUploadAsset(value: unknown): value is UploadedAsset {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.blobUrl === 'string' &&
    value.blobUrl.length > 0 &&
    typeof value.filename === 'string' &&
    value.filename.length > 0 &&
    typeof value.mimeType === 'string' &&
    value.mimeType.length > 0 &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    value.size >= 0 &&
    typeof value.checksum === 'string' &&
    SHA256_HEX.test(value.checksum) &&
    typeof value.createdAt === 'string' &&
    value.createdAt.length > 0 &&
    typeof value.needsEmbedding === 'boolean'
  );
}

function isCreatedReceipt(value: unknown): value is SaveResponse {
  return (
    isRecord(value) &&
    value.success === true &&
    value.isDuplicate === false &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    isUploadAsset(value.asset)
  );
}

function isDuplicateReceipt(value: unknown): value is SaveResponse {
  return (
    isRecord(value) &&
    value.success === true &&
    value.isDuplicate === true &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    isUploadAsset(value.asset)
  );
}

function isSearchResult(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.blobUrl !== 'string' || value.blobUrl.length === 0) return false;
  if (value.tags !== undefined && !Array.isArray(value.tags)) return false;
  return true;
}

function isSearchResponse(value: unknown): value is SearchResponse {
  if (!isRecord(value) || !Array.isArray(value.results) || !value.results.every(isSearchResult)) return false;
  if (typeof value.query !== 'string') return false;
  if (typeof value.total !== 'number' || !Number.isFinite(value.total)) return false;
  if (typeof value.limit !== 'number' || !Number.isFinite(value.limit)) return false;
  if (typeof value.threshold !== 'number' || !Number.isFinite(value.threshold) || value.threshold < 0 || value.threshold > 1) {
    return false;
  }
  if (typeof value.hasMore !== 'boolean') return false;
  if (typeof value.processingTime !== 'number' || !Number.isFinite(value.processingTime)) return false;
  if (value.hasMore && (typeof value.nextCursor !== 'string' || value.nextCursor.length === 0)) return false;
  if (value.nextCursor !== undefined && (typeof value.nextCursor !== 'string' || value.nextCursor.length === 0)) return false;
  return true;
}

async function readJson(res: Response): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const text = await res.text();
  if (text.trim() === '') return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function errorFrom(status: number, body: unknown, fallback: string): SplootApiError {
  if (isRecord(body) && typeof body.error === 'string' && body.error.length > 0) {
    const code = typeof body.code === 'string' && body.code.length > 0 ? ` (${body.code})` : '';
    return new SplootApiError(`${body.error}${code}`, status, body);
  }
  return new SplootApiError(fallback, status, body);
}

export class SplootClient {
  constructor(
    private readonly config: SplootConfig,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const body: Record<string, unknown> = { query };
    if (options.limit !== undefined) body.limit = options.limit;
    if (options.threshold !== undefined) body.threshold = options.threshold;
    if (options.cursor) body.cursor = options.cursor;
    if (options.favoriteOnly !== undefined) body.favoriteOnly = options.favoriteOnly;
    if (options.tagId) body.tagId = options.tagId;
    if (options.offset !== undefined) body.offset = options.offset;
    return this.postJson('/search', body, response => this.parseSearch(response));
  }

  async saveUrl(url: string, tags?: string[]): Promise<SaveResponse> {
    const body: { url: string; tags?: string[] } = { url };
    if (tags && tags.length > 0) body.tags = tags;
    return this.postJson('/upload/url', body, response => this.parseSave(response));
  }

  async saveBytes(
    bytes: Uint8Array,
    filename: string,
    mimeType: string,
    tags?: string[]
  ): Promise<SaveResponse> {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mimeType }), filename);
    if (tags && tags.length > 0) {
      form.append('tags', JSON.stringify(tags));
    }
    return this.postForm('/upload', form, response => this.parseSave(response));
  }

  private async postJson<T>(path: string, body: unknown, parse: (res: Response) => Promise<T>): Promise<T> {
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify(body),
    });
    return parse(res);
  }

  private async postForm<T>(path: string, form: FormData, parse: (res: Response) => Promise<T>): Promise<T> {
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
      },
      body: form,
    });
    return parse(res);
  }

  private async parseSave(res: Response): Promise<SaveResponse> {
    const parsed = await readJson(res);
    if (!parsed.ok) {
      throw new SplootApiError('Sploot API returned an unreadable response', res.status, undefined);
    }
    if (res.status === 201 && isCreatedReceipt(parsed.value)) return parsed.value;
    if (res.status === 409 && isDuplicateReceipt(parsed.value)) return parsed.value;
    throw errorFrom(res.status, parsed.value, 'Sploot API returned an invalid save receipt');
  }

  private async parseSearch(res: Response): Promise<SearchResponse> {
    const parsed = await readJson(res);
    if (!parsed.ok) {
      throw new SplootApiError('Sploot API returned an unreadable response', res.status, undefined);
    }
    if (res.status === 200 && isSearchResponse(parsed.value)) return parsed.value;
    throw errorFrom(res.status, parsed.value, 'Sploot API returned an invalid search response');
  }
}

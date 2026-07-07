import type { SplootConfig } from './config.js';

/**
 * Thin HTTP client over Sploot's published, token-scoped public contract
 * (apps/web/docs/PUBLIC_API.md): save (bytes or URL) and search. No business
 * logic lives here — every rule (dedupe, quota, embedding, similarity
 * threshold) lives server-side; this client only shapes requests/responses.
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
  limit: number;
  threshold: number;
  processingTime: number;
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

export class SplootClient {
  constructor(
    private readonly config: SplootConfig,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async search(
    query: string,
    options: { limit?: number; threshold?: number } = {}
  ): Promise<SearchResponse> {
    return this.postJson<SearchResponse>('/search', { query, ...options });
  }

  async saveUrl(url: string): Promise<SaveResponse> {
    return this.postJson<SaveResponse>('/upload/url', { url });
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
    return this.postForm<SaveResponse>('/upload', form);
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify(body),
    });
    return this.parse<T>(res);
  }

  private async postForm<T>(path: string, form: FormData): Promise<T> {
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
      },
      body: form,
    });
    return this.parse<T>(res);
  }

  private async parse<T>(res: Response): Promise<T> {
    const body: unknown = await res.json().catch(() => undefined);

    // 409 is a documented "duplicate" success shape (success: true), not an
    // error — every other non-2xx status is.
    if (!res.ok && res.status !== 409) {
      const message =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `Sploot API error (${res.status})`;
      throw new SplootApiError(message, res.status, body);
    }

    return body as T;
  }
}

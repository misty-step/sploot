import type { SplootConfig } from './config.js';
import type {
  SplootApiSearchResponse,
  SplootApiSearchResultDto,
  SplootApiUploadAsset,
  SplootApiUploadSuccessResponse,
} from '@sploot/common/api-types';
import {
  parseSplootApiSearchResponse,
  parseSplootApiUploadResponse,
} from '@sploot/common/api-types';

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

export type UploadedAsset = SplootApiUploadAsset;
export type SaveResponse = SplootApiUploadSuccessResponse;
export type SearchResultItem = SplootApiSearchResultDto;
export type SearchResponse = SplootApiSearchResponse;

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

function parseSaveResponse(value: unknown): SaveResponse | null {
  const parsed = parseSplootApiUploadResponse(value);
  return parsed?.success === true ? parsed : null;
}

export class SplootClient {
  constructor(
    private readonly config: SplootConfig,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async search(
    query: string,
    options: { limit?: number; threshold?: number } = {}
  ): Promise<SearchResponse> {
    return this.postJson('/search', { query, ...options }, parseSplootApiSearchResponse, 'search');
  }

  async saveUrl(url: string): Promise<SaveResponse> {
    return this.postJson('/upload/url', { url }, parseSaveResponse, 'upload');
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
    return this.postForm('/upload', form, parseSaveResponse, 'upload');
  }

  private async postJson<T>(path: string, body: unknown, validate: (value: unknown) => T | null, label: string): Promise<T> {
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify(body),
    });
    return this.parse(res, validate, label);
  }

  private async postForm<T>(path: string, form: FormData, validate: (value: unknown) => T | null, label: string): Promise<T> {
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
      },
      body: form,
    });
    return this.parse(res, validate, label);
  }

  private async parse<T>(res: Response, validate: (value: unknown) => T | null, label: string): Promise<T> {
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

    const parsed = validate(body);
    if (parsed === null) {
      throw new SplootApiError(`Invalid ${label} response`, res.status, body);
    }
    return parsed;
  }
}

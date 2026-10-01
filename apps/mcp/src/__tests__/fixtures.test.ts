import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { SplootClient } from '../client.js';
import {
  PRIVATE_MEDIA_NOTE,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_DEFAULT_THRESHOLD,
  SEARCH_TOOL_DESCRIPTION,
} from '../contract.js';
import { runSaveTool, runSearchTool } from '../tools.js';

interface ReceiptCase {
  name: string;
  endpoint: 'save' | 'search';
  status: number;
  outcome: 'success' | 'error';
  kind?: string;
  raw?: string;
  body?: unknown;
}

interface McpClientFixture {
  searchDefaults: { threshold: number; limit: number };
  searchPage: {
    query: string;
    limit: number;
    threshold: number;
    favoriteOnly: boolean;
    tagName: string;
  };
  receipts: ReceiptCase[];
}

const fixture = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/common/fixtures/mcp-client.json'), 'utf8')
) as McpClientFixture;

function responseFor(entry: ReceiptCase): Response {
  const raw = entry.raw ?? JSON.stringify(entry.body);
  return new Response(raw, { status: entry.status, headers: { 'content-type': 'application/json' } });
}

describe('shared MCP client fixtures', () => {
  it('publishes the same search defaults the Go library uses', () => {
    expect(SEARCH_DEFAULT_THRESHOLD).toBe(fixture.searchDefaults.threshold);
    expect(SEARCH_DEFAULT_LIMIT).toBe(fixture.searchDefaults.limit);
    expect(SEARCH_TOOL_DESCRIPTION).toContain(`server default similarity floor is ${fixture.searchDefaults.threshold}`);
    expect(SEARCH_TOOL_DESCRIPTION).toContain(PRIVATE_MEDIA_NOTE);
  });

  it.each(fixture.receipts.map(entry => [entry.name, entry] as const))(
    '%s maps to MCP success or isError',
    async (_name, entry) => {
      const fetchMock = vi.fn(async () => responseFor(entry));
      const client = new SplootClient(
        { baseUrl: 'https://sploot.test/api', token: 'splt_test_token' },
        fetchMock as unknown as typeof fetch
      );
      const result =
        entry.endpoint === 'search'
          ? await runSearchTool(client, { query: fixture.searchPage.query })
          : await runSaveTool(client, { url: 'https://example.com/meme.png' });

      expect(typeof result.content[0]?.text).toBe('string');
      expect(result.content[0]?.text.length).toBeGreaterThan(0);
      expect(result.content[0]?.text).not.toBe('undefined');

      if (entry.outcome === 'error') {
        expect(result.isError).toBe(true);
        return;
      }

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text) as { isDuplicate?: boolean; results?: unknown[] };
      if (entry.kind === 'duplicate') expect(parsed.isDuplicate).toBe(true);
      if (entry.kind === 'created') expect(parsed.isDuplicate).toBe(false);
      if (entry.kind === 'search') expect(Array.isArray(parsed.results)).toBe(true);
      if (entry.body !== undefined && JSON.stringify(entry.body).includes('"/media/')) {
        expect(result.content[1]?.text).toBe(PRIVATE_MEDIA_NOTE);
      }
    }
  );

  it('keeps filters on the second search page and returns distinct ids', async () => {
    const page = fixture.searchPage;
    const tagId = 'tag-reaction';
    const cursor = 'opaque-cursor';
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body.query).toBe(page.query);
      expect(body.limit).toBe(page.limit);
      expect(body.threshold).toBe(page.threshold);
      expect(body.favoriteOnly).toBe(page.favoriteOnly);
      expect(body.tagId).toBe(tagId);
      const first = body.cursor === undefined;
      return new Response(
        JSON.stringify({
          results: [{ id: first ? 'asset-a' : 'asset-b', blobUrl: first ? '/media/asset-a' : '/media/asset-b' }],
          query: page.query,
          total: 2,
          hasMore: first,
          ...(first ? { nextCursor: cursor } : {}),
          limit: page.limit,
          threshold: page.threshold,
          processingTime: 1,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });
    const client = new SplootClient(
      { baseUrl: 'https://sploot.test/api', token: 'splt_test_token' },
      fetchMock as unknown as typeof fetch
    );
    const first = await runSearchTool(client, {
      query: page.query,
      limit: page.limit,
      threshold: page.threshold,
      favoriteOnly: page.favoriteOnly,
      tagId,
    });
    const firstPage = JSON.parse(first.content[0].text) as { nextCursor: string; results: Array<{ id: string }> };
    const second = await runSearchTool(client, {
      query: page.query,
      limit: page.limit,
      threshold: page.threshold,
      favoriteOnly: page.favoriteOnly,
      tagId,
      cursor: firstPage.nextCursor,
    });
    const secondPage = JSON.parse(second.content[0].text) as { results: Array<{ id: string }> };
    const ids = [...firstPage.results, ...secondPage.results].map(result => result.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['asset-a', 'asset-b']);
    expect(first.isError).toBeUndefined();
    expect(second.isError).toBeUndefined();
  });
});

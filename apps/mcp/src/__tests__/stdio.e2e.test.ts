import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';
import { PRIVATE_MEDIA_NOTE, SEARCH_TOOL_DESCRIPTION } from '../contract.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const serverDir = resolve(repoRoot, 'apps/server');
const distIndex = resolve(repoRoot, 'apps/mcp/dist/index.js');
const fixturePath = resolve(repoRoot, 'packages/common/fixtures/mcp-client.json');

interface FixtureFile {
  urlSave: { tags: string[] };
  searchPage: {
    query: string;
    limit: number;
    threshold: number;
    favoriteOnly: boolean;
    tagName: string;
  };
}

interface ReadyFile {
  origin: string;
  images: string[];
}

interface ToolContent {
  type: string;
  text?: string;
}

interface ToolResult {
  content?: ToolContent[];
  isError?: boolean;
}

const children: ChildProcess[] = [];

afterEach(async () => {
  await Promise.all(children.splice(0).map(stop));
});

function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolveStop => {
    child.once('close', () => resolveStop());
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 5_000).unref();
  });
}

function assertLocal(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || url.includes('mistystep.io')) {
    throw new Error(`refusing non-local Sploot origin ${url}`);
  }
}

async function waitForReady(path: string, child: ChildProcess, logs: () => string): Promise<ReadyFile> {
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`isolated library exited early: ${logs()}`);
    try {
      const ready = JSON.parse(await readFile(path, 'utf8')) as ReadyFile;
      assertLocal(ready.origin);
      for (const image of ready.images) assertLocal(image);
      if (ready.images.length !== 3) throw new Error('isolated library did not publish three fixture images');
      return ready;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('refusing')) throw error;
      if (error instanceof Error && error.message.startsWith('isolated')) throw error;
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error(`isolated library did not become ready: ${logs()}`);
}

async function browser(
  origin: string,
  path: string,
  method: string,
  cookie: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; body: string; cookie: string }> {
  assertLocal(origin);
  const headers: Record<string, string> = { Origin: origin };
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.getSetCookie?.().find(value => value.startsWith('sploot_session='));
  const nextCookie = setCookie ? setCookie.split(';', 1)[0] : cookie;
  return { status: response.status, body: await response.text(), cookie: nextCookie ?? '' };
}

function textResult(result: ToolResult): unknown {
  const text = result.content?.find(item => item.type === 'text')?.text;
  if (typeof text !== 'string' || result.isError) {
    throw new Error(`expected an MCP success result, received ${JSON.stringify(result)}`);
  }
  return JSON.parse(text);
}

describe('built stdio MCP against an isolated Go library', () => {
  it('saves, duplicates, pages search, and honors revocation and private media', async () => {
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as FixtureFile;
    const directory = await mkdtemp(resolve(tmpdir(), 'sploot-mcp-stdio-'));
    const readyPath = resolve(directory, 'ready.json');
    const donePath = resolve(directory, 'done');
    let libraryLog = '';
    const library = spawn(
      'go',
      ['test', '-count=1', '-timeout', '240s', '-run', '^TestServeMCPClientLibrary$', './internal/httpapi'],
      {
        cwd: serverDir,
        env: {
          ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
          SPLOOT_MCP_E2E: '1',
          SPLOOT_MCP_E2E_READY: readyPath,
          SPLOOT_MCP_E2E_DONE: donePath,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    children.push(library);
    library.stdout.on('data', chunk => {
      libraryLog += chunk.toString();
    });
    library.stderr.on('data', chunk => {
      libraryLog += chunk.toString();
    });

    let transport: StdioClientTransport | undefined;
    let mcpLog = '';
    try {
      const ready = await waitForReady(readyPath, library, () => libraryLog);
      const email = `mcp-stdio-${randomUUID()}@example.invalid`;
      const password = `mcp-stdio-${randomUUID()}-password`;
      const registered = await browser(ready.origin, '/api/auth/register', 'POST', '', { email, password });
      expect(registered.status, registered.body).toBe(201);
      expect(registered.cookie.startsWith('sploot_session=')).toBe(true);

      const minted = await browser(ready.origin, '/api/upload-tokens', 'POST', registered.cookie, { name: 'mcp-stdio' });
      expect(minted.status, minted.body).toBe(201);
      const tokenBody = JSON.parse(minted.body) as { id: string; token: string };
      expect(tokenBody.token.startsWith('splt_')).toBe(true);

      transport = new StdioClientTransport({
        command: process.execPath,
        args: [distIndex],
        env: {
          ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
          SPLOOT_API_TOKEN: tokenBody.token,
          SPLOOT_API_BASE_URL: `${ready.origin}/api`,
        },
        stderr: 'pipe',
      });
      transport.stderr?.on('data', chunk => {
        mcpLog += chunk.toString();
      });
      const client = new Client({ name: 'sploot-mcp-stdio-e2e', version: '0.0.0' });
      await client.connect(transport);
      const listed = await client.listTools();
      const searchTool = listed.tools.find(tool => tool.name === 'sploot_search');
      expect(searchTool?.description).toBe(SEARCH_TOOL_DESCRIPTION);

      const save = async (url: string, tags?: string[]) => {
        const result = (await client.callTool({
          name: 'sploot_save',
          arguments: tags ? { url, tags } : { url },
        })) as ToolResult;
        return textResult(result) as {
          success: boolean;
          isDuplicate: boolean;
          asset: { id: string; blobUrl: string };
        };
      };

      const created = await save(ready.images[0], fixture.urlSave.tags);
      expect(created.success).toBe(true);
      expect(created.isDuplicate).toBe(false);
      expect(created.asset.blobUrl.startsWith('/media/')).toBe(true);

      const duplicate = await save(ready.images[0], fixture.urlSave.tags);
      expect(duplicate.isDuplicate).toBe(true);
      expect(duplicate.asset.id).toBe(created.asset.id);

      const tagged = await browser(ready.origin, `/api/assets/${created.asset.id}`, 'GET', registered.cookie);
      expect(tagged.status, tagged.body).toBe(200);
      const taggedAsset = JSON.parse(tagged.body) as { asset: { tags: Array<{ name: string }> } };
      expect(taggedAsset.asset.tags.map(tag => tag.name).sort()).toEqual([...fixture.urlSave.tags].sort());

      const second = await save(ready.images[1], fixture.urlSave.tags);
      const distractor = await save(ready.images[2]);
      expect(second.isDuplicate).toBe(false);
      expect(distractor.isDuplicate).toBe(false);

      for (const id of [created.asset.id, second.asset.id]) {
        const favorite = await browser(ready.origin, `/api/assets/${id}`, 'PATCH', registered.cookie, { favorite: true });
        expect(favorite.status, favorite.body).toBe(200);
      }

      const deadline = Date.now() + 30_000;
      for (const id of [created.asset.id, second.asset.id, distractor.asset.id]) {
        let status = '';
        while (Date.now() < deadline) {
          const asset = await browser(ready.origin, `/api/assets/${id}`, 'GET', registered.cookie);
          status = asset.body;
          if (asset.status === 200 && status.includes('"embeddingStatus":"ready"')) break;
          if (status.includes('"embeddingStatus":"failed"')) throw new Error(`indexing failed: ${status}`);
          await new Promise(resolveWait => setTimeout(resolveWait, 100));
        }
        expect(status).toContain('"embeddingStatus":"ready"');
      }

      const tags = await browser(ready.origin, '/api/tags', 'GET', registered.cookie);
      expect(tags.status, tags.body).toBe(200);
      const tagId = (JSON.parse(tags.body) as { tags: Array<{ id: string; name: string }> }).tags.find(
        tag => tag.name === fixture.searchPage.tagName
      )?.id;
      expect(tagId).toBeTruthy();

      const searchArgs = {
        query: fixture.searchPage.query,
        limit: fixture.searchPage.limit,
        threshold: fixture.searchPage.threshold,
        favoriteOnly: fixture.searchPage.favoriteOnly,
        tagId,
      };
      const firstResult = (await client.callTool({ name: 'sploot_search', arguments: searchArgs })) as ToolResult;
      expect(firstResult.isError).toBeUndefined();
      expect(firstResult.content?.[1]?.text).toBe(PRIVATE_MEDIA_NOTE);
      const firstPage = textResult(firstResult) as {
        results: Array<{ id: string }>;
        total: number;
        hasMore: boolean;
        nextCursor?: string;
        threshold: number;
      };
      expect(firstPage.total).toBe(2);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.threshold).toBe(fixture.searchPage.threshold);
      expect(firstPage.results).toHaveLength(1);
      expect(firstPage.nextCursor).toBeTruthy();

      const secondResult = (await client.callTool({
        name: 'sploot_search',
        arguments: { ...searchArgs, cursor: firstPage.nextCursor },
      })) as ToolResult;
      const secondPage = textResult(secondResult) as { results: Array<{ id: string }>; total: number; hasMore: boolean };
      expect(secondPage.total).toBe(2);
      expect(secondPage.hasMore).toBe(false);
      expect(secondPage.results).toHaveLength(1);
      const ids = [firstPage.results[0].id, secondPage.results[0].id];
      expect(new Set(ids).size).toBe(2);
      expect(ids).not.toContain(distractor.asset.id);
      expect(ids.sort()).toEqual([created.asset.id, second.asset.id].sort());

      const denied = await browser(ready.origin, created.asset.blobUrl, 'GET', '', undefined, tokenBody.token);
      expect(denied.status).toBe(401);
      const allowed = await browser(ready.origin, created.asset.blobUrl, 'GET', registered.cookie);
      expect(allowed.status).toBe(200);

      const revoked = await browser(ready.origin, `/api/upload-tokens/${tokenBody.id}`, 'DELETE', registered.cookie);
      expect(revoked.status, revoked.body).toBe(200);
      const afterRevoke = (await client.callTool({
        name: 'sploot_search',
        arguments: { query: fixture.searchPage.query },
      })) as ToolResult;
      expect(afterRevoke.isError).toBe(true);
      expect(afterRevoke.content?.[0]?.text).toContain('401');

      await client.close();
      transport = undefined;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${detail}\nlibrary:\n${libraryLog}\nmcp:\n${mcpLog}`);
    } finally {
      await transport?.close().catch(() => undefined);
      await writeFile(donePath, 'done\n');
      const exit = await new Promise<number | null>(resolveExit => {
        if (library.exitCode !== null) resolveExit(library.exitCode);
        else library.once('close', code => resolveExit(code));
      });
      await rm(directory, { recursive: true, force: true });
      expect(exit, libraryLog).toBe(0);
    }
  }, 240_000);
});

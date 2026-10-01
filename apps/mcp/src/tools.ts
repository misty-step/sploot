import { PRIVATE_MEDIA_NOTE } from './contract.js';
import { SplootApiError, type SearchOptions, type SplootClient } from './client.js';

/**
 * Tool handlers, factored out of index.ts so they can be unit-tested without
 * standing up a real MCP stdio transport. Each returns the MCP
 * CallToolResult content shape directly.
 */

export interface McpToolTextResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  // The SDK's CallToolResult carries an index signature for forward
  // compatibility (e.g. structuredContent, _meta) — mirror it here so this
  // return type stays assignable to server.registerTool's handler contract.
  [key: string]: unknown;
}

export interface SearchToolArgs {
  query: string;
  limit?: number;
  threshold?: number;
  cursor?: string;
  favoriteOnly?: boolean;
  tagId?: string;
  offset?: number;
}

export interface SaveToolArgs {
  url?: string;
  bytesBase64?: string;
  filename?: string;
  mimeType?: string;
  tags?: string[];
}

const DEFAULT_SAVE_FILENAME = 'upload.png';
const DEFAULT_SAVE_MIME_TYPE = 'image/png';

export function errorResult(error: unknown): McpToolTextResult {
  const text =
    error instanceof SplootApiError
      ? `Sploot API error (${error.status}): ${error.message}`
      : error instanceof Error
        ? error.message
        : String(error);

  return { content: [{ type: 'text', text }], isError: true };
}

function mentionsPrivateMedia(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(mentionsPrivateMedia);
  if (!value || typeof value !== 'object') return false;
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'blobUrl' && typeof nested === 'string' && nested.startsWith('/media/')) return true;
    if (mentionsPrivateMedia(nested)) return true;
  }
  return false;
}

function jsonResult(value: unknown): McpToolTextResult {
  const text = JSON.stringify(value, null, 2);
  if (typeof text !== 'string') {
    return errorResult(new Error('Sploot API returned an unreadable response'));
  }
  const content: McpToolTextResult['content'] = [{ type: 'text', text }];
  if (mentionsPrivateMedia(value)) {
    content.push({ type: 'text', text: PRIVATE_MEDIA_NOTE });
  }
  return { content };
}

function searchOptions(args: SearchToolArgs): SearchOptions {
  const options: SearchOptions = {};
  if (args.limit !== undefined) options.limit = args.limit;
  if (args.threshold !== undefined) options.threshold = args.threshold;
  if (args.cursor) options.cursor = args.cursor;
  if (args.favoriteOnly !== undefined) options.favoriteOnly = args.favoriteOnly;
  if (args.tagId) options.tagId = args.tagId;
  if (args.offset !== undefined) options.offset = args.offset;
  return options;
}

export async function runSearchTool(
  client: SplootClient,
  args: SearchToolArgs
): Promise<McpToolTextResult> {
  try {
    const result = await client.search(args.query, searchOptions(args));
    return jsonResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

export async function runSaveTool(
  client: SplootClient,
  args: SaveToolArgs
): Promise<McpToolTextResult> {
  try {
    if (!args.url && !args.bytesBase64) {
      throw new Error('Provide either "url" or "bytesBase64" to save an image.');
    }
    if (args.url && args.bytesBase64) {
      throw new Error('Provide only one of "url" or "bytesBase64", not both.');
    }

    const result = args.url
      ? await client.saveUrl(args.url, args.tags)
      : await client.saveBytes(
          Buffer.from(args.bytesBase64 as string, 'base64'),
          args.filename ?? DEFAULT_SAVE_FILENAME,
          args.mimeType ?? DEFAULT_SAVE_MIME_TYPE,
          args.tags
        );

    return jsonResult(result);
  } catch (error) {
    return errorResult(error);
  }
}

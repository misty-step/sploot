import { SplootApiError, type SplootClient } from './client.js';

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

function jsonResult(value: unknown): McpToolTextResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export async function runSearchTool(
  client: SplootClient,
  args: SearchToolArgs
): Promise<McpToolTextResult> {
  try {
    const result = await client.search(args.query, {
      limit: args.limit,
      threshold: args.threshold,
    });
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
      ? await client.saveUrl(args.url)
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

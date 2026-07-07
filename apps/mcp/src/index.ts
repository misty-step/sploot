#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfigFromEnv } from './config.js';
import { SplootClient } from './client.js';
import { runSaveTool, runSearchTool } from './tools.js';

const SERVER_NAME = 'sploot';
const SERVER_VERSION = '0.1.0';

function buildServer(client: SplootClient): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'sploot_search',
    {
      title: 'Search Sploot',
      description:
        'Semantic text-to-image search over the personal Sploot meme library. ' +
        'Describe what is in the image in plain words (e.g. "distracted ' +
        'boyfriend reaction", "cat looking judgmental") — this is not a tag ' +
        'or filename lookup.',
      inputSchema: {
        query: z.string().min(1).max(500).describe('Plain-words description of the meme to find.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of results to return (default 30).'),
        threshold: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('Minimum similarity score 0-1 (default 0.2). Real misses return zero results, never low-similarity padding.'),
      },
    },
    async args => runSearchTool(client, args)
  );

  server.registerTool(
    'sploot_save',
    {
      title: 'Save to Sploot',
      description:
        'Save an image to the personal Sploot meme library, either by URL ' +
        '(Sploot fetches it server-side) or by raw base64-encoded bytes ' +
        '(when there is no fetchable URL). Duplicates are detected and ' +
        'reported, not re-saved.',
      inputSchema: {
        url: z.string().url().optional().describe('Public URL of the image to fetch and save.'),
        bytesBase64: z
          .string()
          .optional()
          .describe('Base64-encoded image bytes. Provide this or url, not both.'),
        filename: z
          .string()
          .optional()
          .describe('Filename to record when saving by bytes (default "upload.png").'),
        mimeType: z
          .string()
          .optional()
          .describe('MIME type to record when saving by bytes (default "image/png").'),
        tags: z.array(z.string()).optional().describe('Tag names to attach to the saved asset.'),
      },
    },
    async args => runSaveTool(client, args)
  );

  return server;
}

async function main(): Promise<void> {
  const config = loadConfigFromEnv();
  const client = new SplootClient(config);
  const server = buildServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(error => {
  console.error('sploot-mcp failed to start:', error);
  process.exitCode = 1;
});

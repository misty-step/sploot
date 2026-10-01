#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfigFromEnv } from './config.js';
import { SplootClient } from './client.js';
import {
  SAVE_TOOL_DESCRIPTION,
  SEARCH_CURSOR_DESCRIPTION,
  SEARCH_FAVORITE_DESCRIPTION,
  SEARCH_LIMIT_DESCRIPTION,
  SEARCH_OFFSET_DESCRIPTION,
  SEARCH_TAG_DESCRIPTION,
  SEARCH_THRESHOLD_DESCRIPTION,
  SEARCH_TOOL_DESCRIPTION,
} from './contract.js';
import { runSaveTool, runSearchTool } from './tools.js';

const SERVER_NAME = 'sploot';
const SERVER_VERSION = '0.1.0';

function buildServer(client: SplootClient): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'sploot_search',
    {
      title: 'Search Sploot',
      description: SEARCH_TOOL_DESCRIPTION,
      inputSchema: {
        query: z.string().min(1).max(500).describe('Plain-words description of the meme to find.'),
        limit: z.number().int().min(1).max(100).optional().describe(SEARCH_LIMIT_DESCRIPTION),
        threshold: z.number().min(0).max(1).optional().describe(SEARCH_THRESHOLD_DESCRIPTION),
        cursor: z.string().min(1).max(8192).optional().describe(SEARCH_CURSOR_DESCRIPTION),
        favoriteOnly: z.boolean().optional().describe(SEARCH_FAVORITE_DESCRIPTION),
        tagId: z.string().min(1).max(200).optional().describe(SEARCH_TAG_DESCRIPTION),
        offset: z.number().int().min(0).max(500).optional().describe(SEARCH_OFFSET_DESCRIPTION),
      },
    },
    async args => runSearchTool(client, args)
  );

  server.registerTool(
    'sploot_save',
    {
      title: 'Save to Sploot',
      description: SAVE_TOOL_DESCRIPTION,
      inputSchema: {
        url: z.string().url().optional().describe('Public URL of the image to fetch and save. Optional tags are stored with it.'),
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

/**
 * Environment config for the sploot MCP server. A thin reader — no
 * validation logic beyond "is a token present" lives here; the client owns
 * everything about how the token is used.
 */

export interface SplootConfig {
  /** Sploot API base URL, no trailing slash, e.g. https://www.sploot.app/api */
  baseUrl: string;
  /** Personal API token (`splt_…`) — see apps/web/docs/PUBLIC_API.md. */
  token: string;
}

export const DEFAULT_BASE_URL = 'https://www.sploot.app/api';

export class MissingTokenError extends Error {
  constructor() {
    super(
      'SPLOOT_API_TOKEN is required. Mint a personal API token in Sploot ' +
        '(Settings → Upload tokens or POST /api/upload-tokens with a ' +
        'signed-in session), then set SPLOOT_API_TOKEN in the environment ' +
        'running this MCP server. See apps/web/docs/PUBLIC_API.md.'
    );
    this.name = 'MissingTokenError';
  }
}

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SplootConfig {
  const token = env.SPLOOT_API_TOKEN?.trim();
  if (!token) {
    throw new MissingTokenError();
  }

  const rawBaseUrl = env.SPLOOT_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');

  return { baseUrl, token };
}

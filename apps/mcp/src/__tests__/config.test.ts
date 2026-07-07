import { describe, expect, it } from 'vitest';
import { DEFAULT_BASE_URL, loadConfigFromEnv, MissingTokenError } from '../config.js';

describe('loadConfigFromEnv', () => {
  it('throws MissingTokenError when SPLOOT_API_TOKEN is absent', () => {
    expect(() => loadConfigFromEnv({})).toThrow(MissingTokenError);
  });

  it('throws MissingTokenError when SPLOOT_API_TOKEN is blank', () => {
    expect(() => loadConfigFromEnv({ SPLOOT_API_TOKEN: '   ' })).toThrow(MissingTokenError);
  });

  it('defaults baseUrl to the production public API', () => {
    const config = loadConfigFromEnv({ SPLOOT_API_TOKEN: 'splt_abc' });
    expect(config).toEqual({ baseUrl: DEFAULT_BASE_URL, token: 'splt_abc' });
  });

  it('uses SPLOOT_API_BASE_URL when provided, stripping a trailing slash', () => {
    const config = loadConfigFromEnv({
      SPLOOT_API_TOKEN: 'splt_abc',
      SPLOOT_API_BASE_URL: 'http://localhost:3001/api/',
    });
    expect(config.baseUrl).toBe('http://localhost:3001/api');
  });
});

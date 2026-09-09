import { describe, expect, it } from 'vitest';
import { getSplootAppUrl, getTrustedSplootAppUrl } from './app-url';
import { normalizeInstanceUrl } from './instance-url';

describe('instance URL boundary', () => {
  it('allows local HTTP and remote HTTPS without changing the credential origin', () => {
    expect(normalizeInstanceUrl('http://127.0.0.1:3001/')).toBe('http://127.0.0.1:3001');
    expect(normalizeInstanceUrl('https://LIBRARY.example:443/')).toBe('https://library.example');
    expect(getSplootAppUrl('/app/settings', 'https://library.example')).toBe('https://library.example/app/settings');
  });

  it.each(['http://remote.example', 'https://user:password@library.example', 'https://library.example/path', 'https://library.example?token=secret', 'file:///tmp/library'])('rejects unsafe instance selection: %s', value => {
    expect(() => normalizeInstanceUrl(value)).toThrow();
  });

  it.each(['//attacker.test/app', 'https://attacker.test/app', 'javascript:alert(1)', 'http://127.0.0.1:3002/app'])('rejects cross-origin notification actions: %s', value => {
    expect(getTrustedSplootAppUrl(value, 'http://127.0.0.1:3001')).toBeUndefined();
  });
});

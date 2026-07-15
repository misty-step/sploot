import { describe, expect, it } from 'vitest';
import { assertNoBrowserRequestFailures } from '@/lib/qa/request-failure-policy';

describe('browser request failure policy', () => {
  it('accepts an empty assertion-window failure set', () => {
    expect(() => assertNoBrowserRequestFailures([])).not.toThrow();
  });

  it('fails on an ordinary failed request with its exact URL', () => {
    expect(() => assertNoBrowserRequestFailures([
      'GET http://127.0.0.1:3474/api/assets?offset=10 — net::ERR_FAILED',
    ])).toThrow(/http:\/\/127\.0\.0\.1:3474\/api\/assets\?offset=10/);
  });

  it('fails on an aborted request instead of hiding it as tolerated cancellation', () => {
    expect(() => assertNoBrowserRequestFailures([
      'POST http://127.0.0.1:3474/api/search — net::ERR_ABORTED',
    ])).toThrow(/net::ERR_ABORTED/);
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSignedOutRedirectChain } from '../apps/web/scripts/smoke-redirects.mjs';

function redirect(status, location) {
  return new Response(null, {
    status,
    headers: { location },
  });
}

test('accepts a same-origin legacy redirect before the sign-in redirect', async () => {
  const requests = [];
  const responses = new Map([
    ['https://sploot.app/app/search', redirect(307, '/app')],
    ['https://sploot.app/app', redirect(307, '/sign-in')],
  ]);
  const fetchImpl = async (url) => {
    requests.push(url);
    return responses.get(url) ?? new Response(null, { status: 404 });
  };

  const result = await assertSignedOutRedirectChain({
    baseUrl: 'https://sploot.app',
    route: '/app/search',
    fetchImpl,
  });

  assert.deepEqual(requests, [
    'https://sploot.app/app/search',
    'https://sploot.app/app',
  ]);
  assert.deepEqual(result.redirects.map(({ status, location }) => ({ status, location })), [
    { status: 307, location: '/app' },
    { status: 307, location: '/sign-in' },
  ]);
});

test('rejects a redirect that escapes the deployment origin', async () => {
  await assert.rejects(
    assertSignedOutRedirectChain({
      baseUrl: 'https://sploot.app',
      route: '/app',
      fetchImpl: async () => redirect(307, 'https://attacker.example/sign-in'),
    }),
    /left deployment origin/
  );
});

test('rejects redirect cycles before exhausting the hop bound', async () => {
  const responses = new Map([
    ['https://sploot.app/app/search', redirect(307, '/app')],
    ['https://sploot.app/app', redirect(307, '/app/search')],
  ]);

  await assert.rejects(
    assertSignedOutRedirectChain({
      baseUrl: 'https://sploot.app',
      route: '/app/search',
      fetchImpl: async (url) => responses.get(url),
    }),
    /redirect cycle/
  );
});

test('rejects a protected route that returns content instead of redirecting', async () => {
  await assert.rejects(
    assertSignedOutRedirectChain({
      baseUrl: 'https://sploot.app',
      route: '/app',
      fetchImpl: async () => new Response('private content', { status: 200 }),
    }),
    /expected redirect to sign-in, got HTTP 200/
  );
});

test('rejects redirects without a location', async () => {
  await assert.rejects(
    assertSignedOutRedirectChain({
      baseUrl: 'https://sploot.app',
      route: '/app',
      fetchImpl: async () => new Response(null, { status: 307 }),
    }),
    /redirect is missing location/
  );
});

test('rejects a same-origin chain that never reaches sign-in within the hop bound', async () => {
  let hop = 0;
  await assert.rejects(
    assertSignedOutRedirectChain({
      baseUrl: 'https://sploot.app',
      route: '/app',
      maxHops: 2,
      fetchImpl: async () => redirect(307, `/alias-${hop++}`),
    }),
    /did not reach sign-in within 2 redirects/
  );
});

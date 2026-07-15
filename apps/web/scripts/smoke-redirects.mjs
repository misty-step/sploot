const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function routeLabel(url) {
  return `${url.pathname}${url.search}`;
}

/**
 * Prove that a signed-out protected route reaches the deployment's sign-in
 * page through a short, same-origin, acyclic redirect chain. Legacy route
 * aliases are applied by Next before Clerk middleware, so requiring the first
 * hop itself to be /sign-in would reject a correctly protected route.
 */
export async function assertSignedOutRedirectChain({
  baseUrl,
  route,
  fetchImpl = fetch,
  maxHops = 4,
}) {
  const deployment = new URL(baseUrl);
  let current = new URL(route, deployment);
  if (current.origin !== deployment.origin) {
    throw new Error(`${route}: protected route is outside the deployment origin`);
  }

  const seen = new Set([current.href]);
  const redirects = [];

  for (let hop = 0; hop < maxHops; hop += 1) {
    const response = await fetchImpl(current.href, {
      method: 'GET',
      redirect: 'manual',
    });
    const location = response.headers.get('location') ?? '';
    if (!REDIRECT_STATUSES.has(response.status)) {
      throw new Error(`${routeLabel(current)}: expected redirect to sign-in, got HTTP ${response.status}`);
    }
    if (!location) {
      throw new Error(`${routeLabel(current)}: redirect is missing location`);
    }

    const next = new URL(location, current);
    if (next.origin !== deployment.origin) {
      throw new Error(`${routeLabel(current)}: redirect left deployment origin for ${next.origin}`);
    }

    redirects.push({
      from: routeLabel(current),
      status: response.status,
      location,
    });

    if (next.pathname === '/sign-in' || next.pathname.startsWith('/sign-in/')) {
      return {
        redirects,
        signIn: routeLabel(next),
      };
    }
    if (seen.has(next.href)) {
      throw new Error(`${route}: redirect cycle detected at ${routeLabel(next)}`);
    }

    seen.add(next.href);
    current = next;
  }

  throw new Error(`${route}: did not reach sign-in within ${maxHops} redirects`);
}

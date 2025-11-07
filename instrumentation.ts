export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Optional: Add experimental onRequestError for automatic error capture
export const onRequestError = async (
  err: unknown,
  request: {
    path: string; // URL path, e.g., '/app/dashboard'
    method: string; // HTTP method, e.g., 'GET'
    headers: { [key: string]: string };
  },
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routePath: string; // Normalized route pattern, e.g., '/app/[id]'
    routeType: 'render' | 'route' | 'action' | 'middleware';
    renderSource: 'react-server-components' | 'server-rendering';
    revalidateReason: 'on-demand' | 'stale' | undefined;
    renderType: 'dynamic' | 'static';
  }
) => {
  // We'll implement logging in lib/observability-logger.ts later
  // For now, this hook is registered for Next.js instrumentation
  console.error('Next.js request error:', {
    error: err,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};

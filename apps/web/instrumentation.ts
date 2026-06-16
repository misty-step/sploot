export async function register() {
  // Canary reporting is wired through the request-error logger below.
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
  const { logger } = await import('./lib/observability-logger');

  logger.logError('next:request-error', err as Error, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
    renderType: context.renderType,
  });
};

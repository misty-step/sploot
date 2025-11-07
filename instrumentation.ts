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
  // Import Sentry and observability logger
  const Sentry = await import('@sentry/nextjs');
  const { logger } = await import('./lib/observability-logger');

  // Log structured error data
  logger.logError('next:request-error', err as Error, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
    renderType: context.renderType,
  });

  // Add breadcrumb to Sentry for debugging context
  Sentry.addBreadcrumb({
    category: 'request',
    message: `Request error on ${request.method} ${request.path}`,
    level: 'error',
    data: {
      routePath: context.routePath,
      routeType: context.routeType,
      renderType: context.renderType,
    },
  });

  // Capture exception in Sentry
  Sentry.captureException(err, {
    tags: {
      'request.path': request.path,
      'request.method': request.method,
      'route.type': context.routeType,
      'render.type': context.renderType,
    },
    contexts: {
      request: {
        url: request.path,
        method: request.method,
      },
      nextjs: {
        routePath: context.routePath,
        routeType: context.routeType,
        routerKind: context.routerKind,
        renderSource: context.renderSource,
        renderType: context.renderType,
      },
    },
  });
};

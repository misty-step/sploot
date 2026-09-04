import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const setTag = vi.fn();
  return {
    captureException: vi.fn(),
    postClientError: vi.fn(() => Promise.resolve()),
    setTag,
    withScope: vi.fn((run: (scope: { setTag: typeof setTag }) => void) =>
      run({ setTag })),
  };
});

vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  withScope: mocks.withScope,
}));
vi.mock('@/lib/telemetry-client', () => ({
  postClientError: mocks.postClientError,
}));

import { sendClientErrorTelemetry } from '@/lib/client-error-telemetry';

describe('client error telemetry ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withScope.mockImplementation((run) => run({ setTag: mocks.setTag }));
  });

  it('captures one Sentry exception and posts only bounded structural data', () => {
    const error = new Error('private user input');
    error.name = 'RenderError';

    sendClientErrorTelemetry('app-error', error, {
      errorInfo: { componentStack: 'private component text' },
    });

    expect(mocks.setTag).toHaveBeenCalledWith('sploot.boundary', 'app-error');
    expect(mocks.captureException).toHaveBeenCalledOnce();
    expect(mocks.captureException).toHaveBeenCalledWith(error);
    expect(mocks.postClientError).toHaveBeenCalledWith({
      boundary: 'app-error',
      name: 'RenderError',
      hasStack: true,
      hasComponentStack: true,
    });
    expect(JSON.stringify(mocks.postClientError.mock.calls)).not.toContain('private user input');
    expect(JSON.stringify(mocks.postClientError.mock.calls)).not.toContain('private component text');
  });

  it('keeps structured logging independent when Sentry capture fails', () => {
    mocks.withScope.mockImplementationOnce(() => {
      throw new Error('Sentry unavailable');
    });

    sendClientErrorTelemetry('app-error', new Error('render failed'));

    expect(mocks.postClientError).toHaveBeenCalledOnce();
  });
});

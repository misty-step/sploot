import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POSTHOG_READY_EVENT } from '@/lib/posthog/events';

const { useUserMock, posthogMock } = vi.hoisted(() => ({
  useUserMock: vi.fn(),
  posthogMock: {
    init: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    capture: vi.fn(),
    __loaded: false,
  },
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: useUserMock,
}));

vi.mock('posthog-js', () => ({
  default: posthogMock,
}));

vi.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { PostHogProvider } from '@/lib/posthog/PostHogProvider';

describe('PostHogProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    useUserMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    });
  });

  it('dispatches a ready event after PostHog loads', async () => {
    const readyListener = vi.fn();
    window.addEventListener(POSTHOG_READY_EVENT, readyListener);
    posthogMock.init.mockImplementation((_key: string, config: { loaded?: () => void }) => {
      config.loaded?.();
    });

    render(
      <PostHogProvider>
        <div>child</div>
      </PostHogProvider>
    );

    await waitFor(() => {
      expect(posthogMock.init).toHaveBeenCalledTimes(1);
    });
    expect(readyListener).toHaveBeenCalledTimes(1);
    window.removeEventListener(POSTHOG_READY_EVENT, readyListener);
  });

  it('catches and logs PostHog init failures', async () => {
    const initError = new Error('init failed');
    posthogMock.init.mockImplementation(() => {
      throw initError;
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <PostHogProvider>
        <div>child</div>
      </PostHogProvider>
    );

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('posthog.init failed', initError);
    });

    consoleErrorSpy.mockRestore();
  });

  it('catches and logs identify failures', async () => {
    const identifyError = new Error('identify failed');
    posthogMock.identify.mockImplementation(() => {
      throw identifyError;
    });
    useUserMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'user_123',
        createdAt: new Date('2024-01-02T03:04:05.000Z'),
      },
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <PostHogProvider>
        <div>child</div>
      </PostHogProvider>
    );

    await waitFor(() => {
      expect(posthogMock.identify).toHaveBeenCalledWith('user_123', {
        created_at: '2024-01-02T03:04:05.000Z',
      });
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('posthog.identify failed', identifyError);

    consoleErrorSpy.mockRestore();
  });

  it('catches and logs reset failures', async () => {
    const resetError = new Error('reset failed');
    posthogMock.reset.mockImplementation(() => {
      throw resetError;
    });
    useUserMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <PostHogProvider>
        <div>child</div>
      </PostHogProvider>
    );

    await waitFor(() => {
      expect(posthogMock.reset).toHaveBeenCalledTimes(1);
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('posthog.reset failed', resetError);

    consoleErrorSpy.mockRestore();
  });
});

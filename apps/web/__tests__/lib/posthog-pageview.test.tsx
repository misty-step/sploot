import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POSTHOG_READY_EVENT } from '@/lib/posthog/events';

const { usePathnameMock, useSearchParamsMock, posthogMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(),
  useSearchParamsMock: vi.fn(),
  posthogMock: {
    init: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    capture: vi.fn(),
    __loaded: false,
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
  useSearchParams: useSearchParamsMock,
}));

vi.mock('posthog-js', () => ({
  default: posthogMock,
}));

import { PostHogPageview } from '@/lib/posthog/PostHogPageview';

describe('PostHogPageview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue('/app/library');
    useSearchParamsMock.mockReturnValue(new URLSearchParams('q=testing'));
    posthogMock.__loaded = false;
  });

  it('waits for ready event before firing first pageview', async () => {
    render(<PostHogPageview />);
    expect(posthogMock.capture).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event(POSTHOG_READY_EVENT));
    });

    await waitFor(() => {
      expect(posthogMock.capture).toHaveBeenCalledWith('$pageview', {
        $current_url: 'http://localhost:3000/app/library?q=testing',
      });
    });
  });

  it('captures immediately when posthog is already loaded', async () => {
    posthogMock.__loaded = true;
    render(<PostHogPageview />);

    await waitFor(() => {
      expect(posthogMock.capture).toHaveBeenCalledWith('$pageview', {
        $current_url: 'http://localhost:3000/app/library?q=testing',
      });
    });
  });

  it('catches and logs pageview capture failures', async () => {
    posthogMock.__loaded = true;
    const captureError = new Error('capture failed');
    posthogMock.capture.mockImplementation(() => {
      throw captureError;
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<PostHogPageview />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('posthog.capture failed', captureError);
    });

    consoleErrorSpy.mockRestore();
  });
});

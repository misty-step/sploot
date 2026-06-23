import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/app-url', () => ({
  getSplootAppUrl: (path = '/app') => new URL(path, 'https://sploot.test').toString(),
}));

interface ChromeMock {
  notifications: {
    create: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    onClicked: {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
  };
  runtime: { getURL: ReturnType<typeof vi.fn> };
  tabs: { create: ReturnType<typeof vi.fn> };
  action: {
    setBadgeText: ReturnType<typeof vi.fn>;
    setBadgeBackgroundColor: ReturnType<typeof vi.fn>;
  };
}

let clickListeners: Array<(notificationId: string) => void>;
let chromeMock: ChromeMock;

beforeEach(() => {
  vi.resetModules(); // fresh module-level action map + click handler per test
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-18T12:00:00.000Z'));
  clickListeners = [];
  chromeMock = {
    notifications: {
      create: vi.fn(),
      clear: vi.fn(),
      onClicked: {
        addListener: vi.fn(listener => {
          clickListeners.push(listener);
        }),
        removeListener: vi.fn(),
      },
    },
    runtime: { getURL: vi.fn(path => `chrome-extension://extension-id/${path}`) },
    tabs: { create: vi.fn() },
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
  };
  vi.stubGlobal('chrome', chromeMock);
});

describe('notifications', () => {
  it('registers exactly one click listener regardless of how many notifications fire', async () => {
    const { setupNotificationFeedback, showSuccessNotification, showErrorNotification } =
      await import('./notifications');

    setupNotificationFeedback();
    showSuccessNotification('a.jpg');
    showSuccessNotification('b.jpg');
    showErrorNotification('boom');

    // The previous design added a listener per notification; this is the leak guard.
    expect(chromeMock.notifications.onClicked.addListener).toHaveBeenCalledTimes(1);
  });

  it('opens the Sploot app when a success notification is clicked', async () => {
    const { setupNotificationFeedback, showSuccessNotification } = await import('./notifications');

    setupNotificationFeedback();
    showSuccessNotification('meme.jpg');
    const id = chromeMock.notifications.create.mock.calls[0][0] as string;
    expect(id).toMatch(/^success-/);
    clickListeners[0](id);

    expect(chromeMock.notifications.create).toHaveBeenCalledWith(id, {
      type: 'basic',
      iconUrl: 'chrome-extension://extension-id/icon-128.png',
      title: 'Saved to Sploot',
      message: 'meme.jpg',
      priority: 1,
      isClickable: true,
    });
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://sploot.test/app' });
    expect(chromeMock.notifications.clear).toHaveBeenCalledWith(id);
  });

  it('flashes the success badge on save', async () => {
    const { setupNotificationFeedback, showSuccessNotification } = await import('./notifications');

    setupNotificationFeedback();
    showSuccessNotification('meme.jpg');

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '✓' });
  });

  it('flashes the error badge on failure', async () => {
    const { setupNotificationFeedback, showErrorNotification } = await import('./notifications');

    setupNotificationFeedback();
    showErrorNotification('boom');

    expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '!' });
  });

  it('uses explicit copy for duplicate success notifications', async () => {
    const { setupNotificationFeedback, showSuccessNotification } = await import('./notifications');

    setupNotificationFeedback();
    showSuccessNotification('meme.jpg', undefined, { isDuplicate: true });

    expect(chromeMock.notifications.create).toHaveBeenCalledWith(expect.stringMatching(/^success-/), {
      type: 'basic',
      iconUrl: 'chrome-extension://extension-id/icon-128.png',
      title: 'Already in Sploot',
      message: 'meme.jpg',
      priority: 1,
      isClickable: true,
    });
  });

  it('maps auth and timeout errors to user-facing notification messages', async () => {
    const { setupNotificationFeedback, showErrorNotification, toErrorNotificationMessage } =
      await import('./notifications');

    setupNotificationFeedback();
    expect(toErrorNotificationMessage('Authentication required')).toBe('Please login to sploot.app first');
    expect(toErrorNotificationMessage('Network error: offline')).toBe('Network error. Check your connection.');
    showErrorNotification('Authentication required');

    expect(chromeMock.notifications.create).toHaveBeenCalledWith(expect.stringMatching(/^error-/), {
      type: 'basic',
      iconUrl: 'chrome-extension://extension-id/icon-128.png',
      title: 'Save Failed',
      message: 'Please login to sploot.app first',
      priority: 2,
      isClickable: false,
    });
  });

  it('maps quota and upload gate errors to short actionable copy', async () => {
    const { toErrorNotificationMessage } = await import('./notifications');

    expect(toErrorNotificationMessage('Storage quota exceeded. Open Sploot settings to manage storage.'))
      .toBe('Storage quota exceeded. Open Sploot settings.');
    expect(toErrorNotificationMessage('Uploads are temporarily paused. Please try again later.'))
      .toBe('Uploads are paused. Please try again later.');
  });

  it('opens the remediation URL when an actionable error notification is clicked', async () => {
    const { setupNotificationFeedback, showErrorNotification } = await import('./notifications');

    setupNotificationFeedback();
    showErrorNotification({
      message: 'Storage quota exceeded. Open Sploot settings to manage storage.',
      actionHref: '/app/settings',
    });
    const id = chromeMock.notifications.create.mock.calls[0][0] as string;
    expect(id).toMatch(/^error-/);
    clickListeners[0](id);

    expect(chromeMock.notifications.create).toHaveBeenCalledWith(id, {
      type: 'basic',
      iconUrl: 'chrome-extension://extension-id/icon-128.png',
      title: 'Save Failed',
      message: 'Storage quota exceeded. Open Sploot settings.',
      priority: 2,
      isClickable: true,
    });
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://sploot.test/app/settings' });
    expect(chromeMock.notifications.clear).toHaveBeenCalledWith(id);
  });
});

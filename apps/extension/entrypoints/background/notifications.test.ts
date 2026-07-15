import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/app-url', () => ({
  getSplootAppUrl: (path = '/app') => new URL(path, 'https://sploot.test').toString(),
  getTrustedSplootAppUrl: (path = '/app') => {
    const url = new URL(path, 'https://sploot.test');
    return url.origin === 'https://sploot.test' && ['http:', 'https:'].includes(url.protocol)
      ? url.toString()
      : undefined;
  },
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
  storage: {
    local: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
    onChanged: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
  };
}

let clickListeners: Array<(notificationId: string) => void>;
let chromeMock: ChromeMock;
let persistedStorage: Record<string, unknown>;

beforeEach(() => {
  vi.resetModules(); // fresh module-level action map + click handler per test
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-18T12:00:00.000Z'));
  clickListeners = [];
  persistedStorage = {};
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
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: persistedStorage[key] })),
        set: vi.fn(async (values: Record<string, unknown>) => Object.assign(persistedStorage, values)),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
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
    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://sploot.test/app' }));
    await vi.waitFor(() => expect(chromeMock.notifications.clear).toHaveBeenCalledWith(id));

    expect(chromeMock.notifications.create).toHaveBeenCalledWith(id, {
      type: 'basic',
      iconUrl: 'chrome-extension://extension-id/icon-128.png',
      title: 'Saved to Sploot',
      message: 'meme.jpg',
      priority: 1,
      isClickable: true,
    });
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

  it('persists the success outcome so the popup shows it even when notifications are suppressed', async () => {
    const { setupNotificationFeedback, showSuccessNotification } = await import('./notifications');

    setupNotificationFeedback();
    showSuccessNotification('meme.jpg', undefined, { isDuplicate: true });

    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
      'sploot:last-save': {
        state: 'success',
        filename: 'meme.jpg',
        isDuplicate: true,
        at: new Date('2026-05-18T12:00:00.000Z').getTime(),
      },
    });
  });

  it('persists the user-facing error outcome for the popup status strip', async () => {
    const { setupNotificationFeedback, showErrorNotification } = await import('./notifications');

    setupNotificationFeedback();
    showErrorNotification('Authentication required');

    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
      'sploot:last-save': {
        state: 'error',
        message: 'Please login to sploot.app first',
        at: new Date('2026-05-18T12:00:00.000Z').getTime(),
      },
    });
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
    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://sploot.test/app/settings' }));
    await vi.waitFor(() => expect(chromeMock.notifications.clear).toHaveBeenCalledWith(id));

    expect(chromeMock.notifications.create).toHaveBeenCalledWith(id, {
      type: 'basic',
      iconUrl: 'chrome-extension://extension-id/icon-128.png',
      title: 'Save Failed',
      message: 'Storage quota exceeded. Open Sploot settings.',
      priority: 2,
      isClickable: true,
    });
    expect(chromeMock.notifications.clear).toHaveBeenCalledWith(id);
  });

  it.each(['https://evil.example/steal', 'javascript:alert(1)'])(
    'does not make an untrusted remediation URL clickable: %s',
    async actionHref => {
      const { setupNotificationFeedback, showErrorNotification } = await import('./notifications');

      setupNotificationFeedback();
      showErrorNotification({ message: 'Try this action', actionHref });
      const id = chromeMock.notifications.create.mock.calls[0][0] as string;
      clickListeners[0](id);

      expect(chromeMock.notifications.create).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ isClickable: false }),
      );
      expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    },
  );

  it('rejects an untrusted persisted action from an older worker', async () => {
    persistedStorage['sploot:notification-actions'] = [{
      notificationId: 'legacy-action',
      url: 'https://evil.example/steal',
    }];
    const { setupNotificationFeedback } = await import('./notifications');

    setupNotificationFeedback();
    clickListeners[0]('legacy-action');

    await vi.waitFor(() => expect(persistedStorage['sploot:notification-actions']).toEqual([]));
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });

  it('resolves a persisted action after the worker restarts', async () => {
    const first = await import('./notifications');
    first.setupNotificationFeedback();
    first.showSuccessNotification('restart.jpg');
    const id = chromeMock.notifications.create.mock.calls[0][0] as string;

    await vi.waitFor(() => expect(persistedStorage['sploot:notification-actions']).toEqual([
      { notificationId: id, url: 'https://sploot.test/app' },
    ]));

    vi.resetModules();
    const second = await import('./notifications');
    second.setupNotificationFeedback();
    clickListeners[1](id);

    await vi.waitFor(() => expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://sploot.test/app' }));
    await vi.waitFor(() => expect(persistedStorage['sploot:notification-actions']).toEqual([]));
  });

  it('bounds persisted notification actions', async () => {
    const { showSuccessNotification } = await import('./notifications');

    for (let index = 0; index < 40; index += 1) {
      showSuccessNotification(`meme-${index}.jpg`);
    }

    await vi.waitFor(() => {
      expect(persistedStorage['sploot:notification-actions']).toHaveLength(32);
    });
  });

  it('contains rejected notification, badge, status, action-write, clear, and timer APIs so later saves continue', async () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    chromeMock.notifications.create.mockRejectedValue(new Error('notifications unavailable'));
    chromeMock.notifications.clear.mockRejectedValue(new Error('clear unavailable'));
    chromeMock.action.setBadgeText.mockRejectedValue(new Error('badge unavailable'));
    chromeMock.action.setBadgeBackgroundColor.mockRejectedValue(new Error('badge color unavailable'));
    chromeMock.storage.local.set.mockRejectedValue(new Error('storage unavailable'));

    const { setupNotificationFeedback, showSuccessNotification, showErrorNotification } = await import('./notifications');
    setupNotificationFeedback();
    expect(() => showSuccessNotification('first.jpg')).not.toThrow();
    vi.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(() => showErrorNotification('second failure')).not.toThrow();
    await vi.waitFor(() => expect(report).toHaveBeenCalled());
    report.mockRestore();
  });

  it('contains a rejected notification action tab open and still clears the notification', async () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    chromeMock.tabs.create.mockRejectedValue(new Error('tabs unavailable'));
    const { setupNotificationFeedback, showSuccessNotification } = await import('./notifications');
    setupNotificationFeedback();
    showSuccessNotification('click.jpg');
    const id = chromeMock.notifications.create.mock.calls[0][0] as string;
    clickListeners[0](id);

    await vi.waitFor(() => expect(chromeMock.notifications.clear).toHaveBeenCalledWith(id));
    expect(() => showSuccessNotification('after-click.jpg')).not.toThrow();
    expect(report).toHaveBeenCalled();
    report.mockRestore();
  });
});

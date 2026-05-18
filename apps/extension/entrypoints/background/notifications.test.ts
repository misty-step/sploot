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
  runtime: {
    getURL: ReturnType<typeof vi.fn>;
  };
  tabs: {
    create: ReturnType<typeof vi.fn>;
  };
}

let clickListeners: Array<(notificationId: string) => void>;
let chromeMock: ChromeMock;

beforeEach(() => {
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
        removeListener: vi.fn(listener => {
          clickListeners = clickListeners.filter(existing => existing !== listener);
        }),
      },
    },
    runtime: {
      getURL: vi.fn(path => `chrome-extension://extension-id/${path}`),
    },
    tabs: {
      create: vi.fn(),
    },
  };
  vi.stubGlobal('chrome', chromeMock);
});

describe('notifications', () => {
  it('opens the Sploot app when a success notification is clicked', async () => {
    const { showSuccessNotification } = await import('./notifications');

    showSuccessNotification('meme.jpg');
    clickListeners[0]('success-1779105600000');

    expect(chromeMock.notifications.create).toHaveBeenCalledWith('success-1779105600000', {
      type: 'basic',
      iconUrl: 'chrome-extension://extension-id/icon-128.png',
      title: 'Saved to Sploot',
      message: 'meme.jpg',
      priority: 1,
      isClickable: true,
    });
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://sploot.test/app' });
    expect(chromeMock.notifications.clear).toHaveBeenCalledWith('success-1779105600000');
    expect(chromeMock.notifications.onClicked.removeListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it('maps auth and timeout errors to user-facing notification messages', async () => {
    const { showErrorNotification, toErrorNotificationMessage } = await import('./notifications');

    expect(toErrorNotificationMessage('Authentication required')).toBe('Please login to sploot.app first');
    expect(toErrorNotificationMessage('Network error: offline')).toBe('Network error. Check your connection.');
    showErrorNotification('Authentication required');
    showErrorNotification('Upload timeout. Please try again.');

    expect(chromeMock.notifications.create).toHaveBeenNthCalledWith(1, 'error-1779105600000', {
      type: 'basic',
      iconUrl: 'chrome-extension://extension-id/icon-128.png',
      title: 'Save Failed',
      message: 'Please login to sploot.app first',
      priority: 2,
      isClickable: false,
    });
    expect(chromeMock.notifications.create).toHaveBeenNthCalledWith(2, 'error-1779105600000', {
      type: 'basic',
      iconUrl: 'chrome-extension://extension-id/icon-128.png',
      title: 'Save Failed',
      message: 'Upload timeout. Please try again.',
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
    const { showErrorNotification } = await import('./notifications');

    showErrorNotification({
      message: 'Storage quota exceeded. Open Sploot settings to manage storage.',
      actionHref: '/app/settings',
    });
    clickListeners[0]('error-1779105600000');

    expect(chromeMock.notifications.create).toHaveBeenCalledWith('error-1779105600000', {
      type: 'basic',
      iconUrl: 'chrome-extension://extension-id/icon-128.png',
      title: 'Save Failed',
      message: 'Storage quota exceeded. Open Sploot settings.',
      priority: 2,
      isClickable: true,
    });
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://sploot.test/app/settings' });
    expect(chromeMock.notifications.clear).toHaveBeenCalledWith('error-1779105600000');
    expect(chromeMock.notifications.onClicked.removeListener).toHaveBeenCalledWith(expect.any(Function));
  });
});

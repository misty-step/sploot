import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UPLOAD } from '@sploot/common';

const mocks = vi.hoisted(() => ({
  enqueueCapturedSave: vi.fn(),
  showErrorNotification: vi.fn(),
}));

vi.mock('./context-menu-save-queue', () => ({ enqueueCapturedSave: mocks.enqueueCapturedSave }));
vi.mock('./notifications', () => ({
  showErrorNotification: mocks.showErrorNotification,
}));

import { captureAndSaveVisibleTab, setupScreenshotCapture } from './screenshot';

let chromeMock: {
  tabs: {
    query: ReturnType<typeof vi.fn>;
    captureVisibleTab: ReturnType<typeof vi.fn>;
  };
  runtime: {
    onMessage: { addListener: ReturnType<typeof vi.fn> };
  };
  storage: {
    local: { set: ReturnType<typeof vi.fn> };
    onChanged: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  chromeMock = {
    tabs: {
      query: vi.fn().mockResolvedValue([{ windowId: 1, url: 'https://twitter.com/i/status/1' }]),
      captureVisibleTab: vi.fn().mockResolvedValue('data:image/png;base64,AAAA'),
    },
    runtime: { onMessage: { addListener: vi.fn() } },
    storage: {
      local: { set: vi.fn().mockResolvedValue(undefined) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  };
  vi.stubGlobal('chrome', chromeMock);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ blob: async () => new Blob(['x'], { type: 'image/png' }) })
  );
  mocks.enqueueCapturedSave.mockResolvedValue(undefined);
});

describe('captureAndSaveVisibleTab', () => {
  it('captures the active tab and uploads it with a host-derived filename', async () => {
    await captureAndSaveVisibleTab();

    expect(chromeMock.tabs.captureVisibleTab).toHaveBeenCalledWith(1, { format: 'png' });
    expect(mocks.enqueueCapturedSave).toHaveBeenCalledOnce();
    const [, filename] = mocks.enqueueCapturedSave.mock.calls[0];
    expect(filename).toMatch(/^screenshot-twitter\.com-\d+\.png$/);
    expect(mocks.showErrorNotification).not.toHaveBeenCalled();
    expect(mocks.enqueueCapturedSave.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it('maps a restricted-page capture failure to user-facing copy', async () => {
    chromeMock.tabs.captureVisibleTab.mockRejectedValue(
      new Error("Either the '<all_urls>' or 'activeTab' permission is required.")
    );

    await captureAndSaveVisibleTab();

    expect(mocks.enqueueCapturedSave).not.toHaveBeenCalled();
    expect(mocks.showErrorNotification).toHaveBeenCalledWith(
      "Chrome doesn't allow capturing this page. Try a normal web page."
    );
  });

  it('persists captured bytes through the shared queue after capture', async () => {
    mocks.enqueueCapturedSave.mockRejectedValue(new Error('Sign in to Sploot before saving this image.'));
    const order: string[] = [];
    chromeMock.tabs.captureVisibleTab.mockImplementation(async () => {
      order.push('capture');
      return 'data:image/png;base64,AAAA';
    });
    await captureAndSaveVisibleTab();

    expect(chromeMock.tabs.captureVisibleTab).toHaveBeenCalled();
    expect(mocks.enqueueCapturedSave).toHaveBeenCalledOnce();
    expect(mocks.showErrorNotification).toHaveBeenCalled();
    expect(order).toEqual(['capture']);
  });

  it.each([
    'chrome://version',
    'chrome-extension://extension-id/popup.html',
    'data:text/html,hello',
    'file:///tmp/image.png',
    'ftp://example.com/image.png',
    'view-source:https://example.com',
  ])('rejects non-http(s) target %s before capture or upload', async url => {
    chromeMock.tabs.query.mockResolvedValue([{ windowId: 1, url }]);

    await captureAndSaveVisibleTab();

    expect(chromeMock.tabs.captureVisibleTab).not.toHaveBeenCalled();
    expect(mocks.enqueueCapturedSave).not.toHaveBeenCalled();
    expect(mocks.showErrorNotification).toHaveBeenCalledWith(
      "Chrome doesn't allow capturing this page. Try a normal web page."
    );
  });

  it('rejects a captured PNG above the shared multipart budget', async () => {
    const oversized = new Uint8Array(UPLOAD.multipartSafeSize + 1);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      blob: async () => new Blob([oversized], { type: 'image/png' }),
    }));

    await captureAndSaveVisibleTab();

    expect(mocks.enqueueCapturedSave).not.toHaveBeenCalled();
    expect(mocks.showErrorNotification).toHaveBeenCalledWith(
      expect.stringContaining('Image too large after compression')
    );
  });

  it('runs the real popup message listener through capture, upload, and feedback', async () => {
    let messageListener:
      | ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | undefined)
      | undefined;
    chromeMock.runtime.onMessage.addListener.mockImplementation(listener => {
      messageListener = listener;
    });
    const sendResponse = vi.fn();

    setupScreenshotCapture();
    expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalledOnce();
    const keepsWorkerAlive = messageListener?.(
      { type: 'CAPTURE_VISIBLE_TAB' },
      {},
      sendResponse,
    );

    expect(keepsWorkerAlive).toBe(true);
    await vi.waitFor(() => expect(mocks.enqueueCapturedSave).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ completed: true }));
    expect(mocks.showErrorNotification).not.toHaveBeenCalled();
  });

  it('does not answer the popup until the screenshot upload has completed', async () => {
    let messageListener:
      | ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | undefined)
      | undefined;
    chromeMock.runtime.onMessage.addListener.mockImplementation(listener => {
      messageListener = listener;
    });
    let completeUpload: (() => void) | undefined;
    mocks.enqueueCapturedSave.mockReturnValue(new Promise(resolve => {
      completeUpload = () => resolve(undefined);
    }));
    const sendResponse = vi.fn();

    setupScreenshotCapture();
    expect(messageListener?.({ type: 'CAPTURE_VISIBLE_TAB' }, {}, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(mocks.enqueueCapturedSave).toHaveBeenCalledOnce());
    expect(sendResponse).not.toHaveBeenCalled();

    completeUpload?.();
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ completed: true }));
  });

  it('answers the popup with failure when capture or upload fails', async () => {
    let messageListener:
      | ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | undefined)
      | undefined;
    chromeMock.runtime.onMessage.addListener.mockImplementation(listener => {
      messageListener = listener;
    });
    mocks.enqueueCapturedSave.mockRejectedValue(new Error('Network error. Check your connection.'));
    const sendResponse = vi.fn();

    setupScreenshotCapture();
    expect(messageListener?.({ type: 'CAPTURE_VISIBLE_TAB' }, {}, sendResponse)).toBe(true);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ completed: false }));
    expect(mocks.showErrorNotification).toHaveBeenCalledWith('Network error. Check your connection.');
  });
});

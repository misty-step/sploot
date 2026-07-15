import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  promptUserSignIn: vi.fn(),
  uploadImage: vi.fn(),
  showSuccessNotification: vi.fn(),
  showErrorNotification: vi.fn(),
}));

vi.mock('./auth-manager', () => ({
  isAuthenticated: mocks.isAuthenticated,
  promptUserSignIn: mocks.promptUserSignIn,
}));
vi.mock('../../shared/api-client', () => ({ uploadImage: mocks.uploadImage }));
vi.mock('./notifications', () => ({
  showSuccessNotification: mocks.showSuccessNotification,
  showErrorNotification: mocks.showErrorNotification,
}));

import { captureAndSaveVisibleTab } from './screenshot';

let chromeMock: {
  tabs: {
    query: ReturnType<typeof vi.fn>;
    captureVisibleTab: ReturnType<typeof vi.fn>;
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
  mocks.isAuthenticated.mockResolvedValue(true);
  mocks.uploadImage.mockResolvedValue({
    assetId: 'a1',
    blobUrl: 'b',
    thumbnailUrl: 't',
    isDuplicate: false,
  });
});

describe('captureAndSaveVisibleTab', () => {
  it('captures the active tab and uploads it with a host-derived filename', async () => {
    await captureAndSaveVisibleTab();

    expect(chromeMock.tabs.captureVisibleTab).toHaveBeenCalledWith(1, { format: 'png' });
    expect(mocks.uploadImage).toHaveBeenCalledOnce();
    const [, filename] = mocks.uploadImage.mock.calls[0];
    expect(filename).toMatch(/^screenshot-twitter\.com-\d+\.png$/);
    expect(mocks.showSuccessNotification).toHaveBeenCalled();
    expect(mocks.showErrorNotification).not.toHaveBeenCalled();
    // The real save pipeline records live progress for the popup strip.
    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
      'sploot:last-save': expect.objectContaining({ state: 'saving', label: 'Saving screenshot…' }),
    });
  });

  it('maps a restricted-page capture failure to user-facing copy', async () => {
    chromeMock.tabs.captureVisibleTab.mockRejectedValue(
      new Error("Either the '<all_urls>' or 'activeTab' permission is required.")
    );

    await captureAndSaveVisibleTab();

    expect(mocks.uploadImage).not.toHaveBeenCalled();
    expect(mocks.showErrorNotification).toHaveBeenCalledWith(
      "Chrome doesn't allow capturing this page. Try a normal web page."
    );
  });

  it('prompts sign-in and aborts (no capture) when unauthenticated and sign-in fails', async () => {
    mocks.isAuthenticated.mockResolvedValue(false);
    mocks.promptUserSignIn.mockResolvedValue(false);

    await captureAndSaveVisibleTab();

    expect(chromeMock.tabs.captureVisibleTab).not.toHaveBeenCalled();
    expect(mocks.uploadImage).not.toHaveBeenCalled();
    expect(mocks.showErrorNotification).toHaveBeenCalled();
  });
});

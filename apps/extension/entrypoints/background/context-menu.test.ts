import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchImage: vi.fn(),
  isAuthenticated: vi.fn(),
  promptUserSignIn: vi.fn(),
  runAuthDiagnostics: vi.fn(),
  uploadImage: vi.fn(),
  showSuccessNotification: vi.fn(),
  showErrorNotification: vi.fn(),
}));

vi.mock('./image-fetcher', () => ({ fetchImage: mocks.fetchImage }));
vi.mock('./auth-manager', () => ({
  isAuthenticated: mocks.isAuthenticated,
  promptUserSignIn: mocks.promptUserSignIn,
  runAuthDiagnostics: mocks.runAuthDiagnostics,
}));
vi.mock('../../shared/api-client', () => ({ uploadImage: mocks.uploadImage }));
vi.mock('./notifications', () => ({
  showSuccessNotification: mocks.showSuccessNotification,
  showErrorNotification: mocks.showErrorNotification,
}));
// save-flow is intentionally NOT mocked — exercise the real shared pipeline so
// the shipped right-click path is verified end-to-end, not just compiled.

import { setupContextMenu } from './context-menu';

type ClickHandler = (info: { menuItemId: string; srcUrl?: string }, tab?: { title?: string }) => Promise<void>;
let onClicked: ClickHandler;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', {
    contextMenus: {
      create: vi.fn(),
      onClicked: { addListener: vi.fn((fn: ClickHandler) => { onClicked = fn; }) },
    },
    runtime: { onInstalled: { addListener: vi.fn() } },
  });
  mocks.isAuthenticated.mockResolvedValue(true);
  mocks.fetchImage.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
  mocks.uploadImage.mockResolvedValue({
    assetId: 'a1',
    blobUrl: 'b',
    thumbnailUrl: 't',
    isDuplicate: false,
  });
  setupContextMenu();
});

describe('context menu save', () => {
  it('fetches and uploads the right-clicked image, then reports success', async () => {
    await onClicked({ menuItemId: 'save-to-sploot', srcUrl: 'https://x.test/cat.png' }, { title: 'Cat' });

    expect(mocks.fetchImage).toHaveBeenCalledWith('https://x.test/cat.png');
    expect(mocks.uploadImage).toHaveBeenCalledWith(expect.any(Blob), 'cat.png');
    expect(mocks.showSuccessNotification).toHaveBeenCalled();
    expect(mocks.showErrorNotification).not.toHaveBeenCalled();
  });

  it('shows an error and never uploads when there is no image URL', async () => {
    await onClicked({ menuItemId: 'save-to-sploot', srcUrl: undefined }, undefined);

    expect(mocks.showErrorNotification).toHaveBeenCalledWith('No image URL found');
    expect(mocks.fetchImage).not.toHaveBeenCalled();
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });
});

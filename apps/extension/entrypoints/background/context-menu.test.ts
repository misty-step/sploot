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

// Live build-mode toggle so both the dev and production branches are testable.
const buildMode = vi.hoisted(() => ({ dev: true }));
vi.mock('../../shared/build-mode', () => ({
  get IS_DEV_BUILD() {
    return buildMode.dev;
  },
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

import { ensureContextMenus, setupContextMenu } from './context-menu';

type ClickHandler = (info: { menuItemId: string; srcUrl?: string }, tab?: { title?: string }) => Promise<void>;
let onClicked: ClickHandler;
let contextMenusCreate: ReturnType<typeof vi.fn>;
let contextMenusRemove: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  buildMode.dev = true;
  contextMenusCreate = vi.fn();
  contextMenusRemove = vi.fn();
  vi.stubGlobal('chrome', {
    contextMenus: {
      create: contextMenusCreate,
      remove: contextMenusRemove,
      onClicked: { addListener: vi.fn((fn: ClickHandler) => { onClicked = fn; }) },
    },
    runtime: { onInstalled: { addListener: vi.fn() } },
    storage: {
      local: { set: vi.fn().mockResolvedValue(undefined) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
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

describe('debug diagnostics production gate', () => {
  it('creates the debug menu item only in dev builds', () => {
    buildMode.dev = true;
    ensureContextMenus();

    const createdIds = contextMenusCreate.mock.calls.map(([props]) => props.id);
    expect(createdIds).toContain('save-to-sploot');
    expect(createdIds).toContain('sploot-debug-auth');
  });

  it('never creates the debug menu item in production builds and removes a stale one', () => {
    buildMode.dev = false;
    ensureContextMenus();

    const createdIds = contextMenusCreate.mock.calls.map(([props]) => props.id);
    expect(createdIds).toEqual(['save-to-sploot']);
    expect(contextMenusRemove).toHaveBeenCalledWith('sploot-debug-auth', expect.any(Function));
  });

  it('ignores debug menu clicks in production builds', async () => {
    buildMode.dev = false;
    await onClicked({ menuItemId: 'sploot-debug-auth' }, undefined);

    expect(mocks.runAuthDiagnostics).not.toHaveBeenCalled();
  });

  it('runs diagnostics on debug menu clicks in dev builds', async () => {
    buildMode.dev = true;
    mocks.runAuthDiagnostics.mockResolvedValue({ ok: true });
    await onClicked({ menuItemId: 'sploot-debug-auth' }, undefined);

    expect(mocks.runAuthDiagnostics).toHaveBeenCalled();
  });
});

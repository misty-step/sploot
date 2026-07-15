import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  promptUserSignIn: vi.fn(),
  uploadImage: vi.fn(),
  showSuccessNotification: vi.fn(),
  showErrorNotification: vi.fn(),
  setSaveStatus: vi.fn(),
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
vi.mock('../../shared/save-status', () => ({ setSaveStatus: mocks.setSaveStatus }));

import { saveToSploot } from './save-flow';

const produce = async () => ({ blob: new Blob(['x']), filename: 'meme.png' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAuthenticated.mockResolvedValue(true);
  mocks.uploadImage.mockResolvedValue({
    assetId: 'a1',
    blobUrl: 'b',
    thumbnailUrl: 't',
    isDuplicate: false,
  });
});

describe('saveToSploot', () => {
  it('produces, uploads, and reports success when authenticated', async () => {
    await saveToSploot(produce, 'image');

    expect(mocks.uploadImage).toHaveBeenCalledWith(expect.any(Blob), 'meme.png');
    expect(mocks.showSuccessNotification).toHaveBeenCalledWith('meme.png', 't', { isDuplicate: false });
    expect(mocks.showErrorNotification).not.toHaveBeenCalled();
  });

  it('records live "saving" progress for the popup status strip', async () => {
    await saveToSploot(produce, 'screenshot');

    expect(mocks.setSaveStatus).toHaveBeenCalledWith({
      state: 'saving',
      label: 'Saving screenshot…',
      at: expect.any(Number),
    });
  });

  it('prompts sign-in and aborts (no produce, no upload) when sign-in fails', async () => {
    mocks.isAuthenticated.mockResolvedValue(false);
    mocks.promptUserSignIn.mockResolvedValue(false);
    const producer = vi.fn(produce);

    await saveToSploot(producer, 'screenshot');

    expect(producer).not.toHaveBeenCalled();
    expect(mocks.uploadImage).not.toHaveBeenCalled();
    expect(mocks.showErrorNotification).toHaveBeenCalledWith(
      'Sign in on Sploot, then try saving the screenshot again.'
    );
  });

  it('surfaces a produce error message verbatim', async () => {
    const producer = async () => {
      throw new Error('Cannot capture chrome:// pages');
    };

    await saveToSploot(producer, 'screenshot');

    expect(mocks.uploadImage).not.toHaveBeenCalled();
    expect(mocks.showErrorNotification).toHaveBeenCalledWith('Cannot capture chrome:// pages');
  });

  it('routes an actionHref error to the actionable notification', async () => {
    const err = Object.assign(new Error('Storage quota exceeded'), { actionHref: '/app/settings' });
    mocks.uploadImage.mockRejectedValue(err);

    await saveToSploot(produce, 'image');

    expect(mocks.showErrorNotification).toHaveBeenCalledWith({
      message: 'Storage quota exceeded',
      actionHref: '/app/settings',
    });
  });
});

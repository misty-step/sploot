import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareButton } from '@/components/library/share-button';

const mocks = vi.hoisted(() => ({
  webShare: {
    isSupported: false,
    canShareFiles: false,
  },
  isMobile: false,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/use-web-share', () => ({
  useWebShare: () => mocks.webShare,
}));

vi.mock('@/hooks/use-is-mobile', () => ({
  useIsMobile: () => mocks.isMobile,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

function mockNavigatorProperty<T>(key: string, value: T) {
  Object.defineProperty(navigator, key, {
    configurable: true,
    value,
  });
}

describe('ShareButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.webShare = {
      isSupported: false,
      canShareFiles: false,
    };
    mocks.isMobile = false;

    mockNavigatorProperty('share', undefined);
    mockNavigatorProperty('canShare', undefined);
    mockNavigatorProperty('clipboard', undefined);

    Object.defineProperty(window, 'ClipboardItem', {
      configurable: true,
      value: undefined,
    });
  });

  it('shares the actual meme file when Web Share supports files', async () => {
    mocks.webShare = {
      isSupported: true,
      canShareFiles: true,
    };
    mocks.isMobile = true;

    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    mockNavigatorProperty('share', share);
    mockNavigatorProperty('canShare', canShare);
    global.fetch = vi.fn().mockResolvedValue(
      new Response('image-bytes', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    );

    render(
      <ShareButton
        assetId="asset-1"
        blobUrl="https://blob.example/meme.png"
        filename="meme.png"
        mimeType="image/png"
      />
    );

    fireEvent.click(screen.getByLabelText('Share meme'));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));

    expect(fetch).toHaveBeenCalledWith('https://blob.example/meme.png');
    expect(fetch).not.toHaveBeenCalledWith('/api/assets/asset-1/share', { method: 'POST' });
    const shareData = share.mock.calls[0][0] as ShareData;
    expect(shareData.url).toBeUndefined();
    expect(shareData.files).toHaveLength(1);
    expect(shareData.files?.[0]).toBeInstanceOf(File);
    expect(shareData.files?.[0].name).toBe('meme.png');
    expect(shareData.files?.[0].type).toBe('image/png');
  });

  it('copies image pixels to the desktop clipboard before falling back to links', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const clipboardItemCalls: Array<Record<string, Blob>> = [];
    class ClipboardItemMock {
      constructor(items: Record<string, Blob>) {
        clipboardItemCalls.push(items);
      }
    }

    mockNavigatorProperty('clipboard', { write });
    Object.defineProperty(window, 'ClipboardItem', {
      configurable: true,
      value: ClipboardItemMock,
    });

    global.fetch = vi.fn().mockResolvedValue(
      new Response('image-bytes', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    );

    render(
      <ShareButton
        assetId="asset-1"
        blobUrl="https://blob.example/meme.png"
        filename="meme.png"
        mimeType="image/png"
      />
    );

    fireEvent.click(screen.getByLabelText('Share meme'));

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));

    expect(fetch).toHaveBeenCalledWith('https://blob.example/meme.png');
    expect(fetch).not.toHaveBeenCalledWith('/api/assets/asset-1/share', { method: 'POST' });
    expect(Object.keys(clipboardItemCalls[0])).toEqual(['image/png']);
    expect(clipboardItemCalls[0]['image/png'].type).toBe('image/png');
    expect(clipboardItemCalls[0]['image/png'].size).toBeGreaterThan(0);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Image copied. Paste it into Slack or a chat.');
  });
});

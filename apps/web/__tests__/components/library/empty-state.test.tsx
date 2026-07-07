import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {
  EmptyState,
  detectCaptureDevice,
  SPLOOT_EXTENSION_STORE_URL,
} from '@/components/library/empty-state';

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

const pwaState = {
  installable: false,
  installed: false,
  requiresManualInstall: false,
  promptInstall: vi.fn(async () => 'accepted' as const),
};

vi.mock('@/hooks/use-pwa-install', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-pwa-install')>();
  return {
    ...actual,
    usePwaInstallPrompt: () => pwaState,
  };
});

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    value: 0,
    configurable: true,
  });
}

describe('detectCaptureDevice', () => {
  it('classifies iOS, Android, and desktop user agents', () => {
    expect(detectCaptureDevice(IPHONE_UA)).toBe('ios');
    expect(detectCaptureDevice(ANDROID_UA)).toBe('android');
    expect(detectCaptureDevice(DESKTOP_UA)).toBe('desktop');
  });

  it('classifies iPadOS-masquerading-as-macOS as iOS via touch points', () => {
    const ipadUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    expect(detectCaptureDevice(ipadUa, 5)).toBe('ios');
    expect(detectCaptureDevice(ipadUa, 0)).toBe('desktop');
  });
});

describe('EmptyState first-use capture activation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pwaState.installable = false;
    pwaState.installed = false;
    pwaState.requiresManualInstall = false;
  });

  it('desktop first-run leads with a one-tap Chrome Web Store link', () => {
    setUserAgent(DESKTOP_UA);
    render(<EmptyState variant="first-use" />);

    const link = screen.getByRole('link', { name: /extension/i });
    expect(link).toHaveAttribute('href', SPLOOT_EXTENSION_STORE_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('iOS first-run leads with the shortcut setup path into settings tokens', () => {
    setUserAgent(IPHONE_UA);
    render(<EmptyState variant="first-use" />);

    const link = screen.getByRole('link', { name: /shortcut/i });
    expect(link).toHaveAttribute('href', '/app/settings#upload-tokens');
    // No Chrome extension pitch on a phone.
    expect(screen.queryByRole('link', { name: /extension/i })).toBeNull();
  });

  it('Android first-run with an available prompt installs the PWA in one tap', async () => {
    setUserAgent(ANDROID_UA);
    pwaState.installable = true;
    const user = userEvent.setup();
    render(<EmptyState variant="first-use" />);

    const button = screen.getByRole('button', { name: /share sheet/i });
    await user.click(button);
    expect(pwaState.promptInstall).toHaveBeenCalledTimes(1);
  });

  it('shows the demo pile (product action), not a generic illustration', () => {
    setUserAgent(DESKTOP_UA);
    render(<EmptyState variant="first-use" />);

    // The example pile demonstrates search: a locked match cell in the tableau.
    expect(screen.getAllByRole('article').length).toBeGreaterThanOrEqual(3);
    // MemeCell's lime "match" badge on the locked demo cell.
    expect(screen.getByText('match')).toBeInTheDocument();
  });

  it('keeps an immediate upload route for the aha path', () => {
    setUserAgent(DESKTOP_UA);
    const onUploadClick = vi.fn();
    render(<EmptyState variant="first-use" onUploadClick={onUploadClick} />);

    const upload = screen.getByRole('button', { name: /upload/i });
    upload.click();
    expect(onUploadClick).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyState search and filtered variants', () => {
  it('search variant reports the query with no capture rig', () => {
    setUserAgent(DESKTOP_UA);
    render(<EmptyState variant="search" searchQuery="screaming cat" />);
    expect(screen.getByText(/no matches in the pile/i)).toBeInTheDocument();
    expect(screen.getByText(/screaming cat/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /extension/i })).toBeNull();
  });

  it('filtered variant explains the filters', () => {
    setUserAgent(DESKTOP_UA);
    render(<EmptyState variant="filtered" />);
    expect(screen.getByText(/no memes match these filters/i)).toBeInTheDocument();
  });
});

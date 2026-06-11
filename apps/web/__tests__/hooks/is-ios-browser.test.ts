import { describe, expect, it } from 'vitest';
import { isIosBrowser } from '@/hooks/use-pwa-install';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.51 Mobile/15E148 Safari/604.1';
const IPADOS_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

describe('isIosBrowser', () => {
  it('detects iPhone Safari and iPhone Chrome (both WebKit, no install prompt)', () => {
    expect(isIosBrowser(IPHONE_UA)).toBe(true);
    expect(isIosBrowser(IPHONE_CHROME_UA)).toBe(true);
  });

  it('detects iPadOS masquerading as macOS via touch points', () => {
    expect(isIosBrowser(IPADOS_UA, 5)).toBe(true);
  });

  it('does not flag Android or desktop macOS', () => {
    expect(isIosBrowser(ANDROID_UA)).toBe(false);
    expect(isIosBrowser(MAC_UA, 0)).toBe(false);
  });
});

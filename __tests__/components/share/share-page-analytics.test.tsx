import { render } from '@testing-library/react';
import { SharePageAnalytics } from '@/components/share/share-page-analytics';
import { track } from '@vercel/analytics';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock @vercel/analytics
vi.mock('@vercel/analytics', () => ({
  track: vi.fn(),
}));

describe('SharePageAnalytics', () => {
  const mockAssetId = 'test-asset-123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render nothing (invisible component)', () => {
    const { container } = render(<SharePageAnalytics assetId={mockAssetId} />);
    expect(container.firstChild).toBeNull();
  });

  it('should track page view on mount', () => {
    render(<SharePageAnalytics assetId={mockAssetId} />);

    expect(track).toHaveBeenCalledWith('share_page_view', {
      assetId: mockAssetId,
      referrer: 'direct', // No referrer in test environment
      timestamp: expect.any(Number),
    });
  });

  it('should use document.referrer when available', () => {
    const mockReferrer = 'https://twitter.com/user/status/123';
    Object.defineProperty(document, 'referrer', {
      value: mockReferrer,
      writable: true,
      configurable: true,
    });

    render(<SharePageAnalytics assetId={mockAssetId} />);

    expect(track).toHaveBeenCalledWith('share_page_view', {
      assetId: mockAssetId,
      referrer: mockReferrer,
      timestamp: expect.any(Number),
    });

    // Cleanup
    Object.defineProperty(document, 'referrer', {
      value: '',
      writable: true,
      configurable: true,
    });
  });

  it('should track bounce when user leaves within 5 seconds', () => {
    const { unmount } = render(<SharePageAnalytics assetId={mockAssetId} />);

    // Clear the page_view call
    vi.clearAllMocks();

    // Advance time by 2 seconds
    vi.advanceTimersByTime(2000);

    // Unmount (user leaves page) - cleanup runs synchronously
    unmount();

    expect(track).toHaveBeenCalledWith('share_page_bounce', {
      assetId: mockAssetId,
      timeOnPage: expect.any(Number),
    });

    // Verify timeOnPage is around 2000ms (±50ms tolerance for test timing)
    const bounceCall = (track as any).mock.calls.find(
      (call: any) => call[0] === 'share_page_bounce'
    );
    expect(bounceCall[1].timeOnPage).toBeGreaterThanOrEqual(1950);
    expect(bounceCall[1].timeOnPage).toBeLessThanOrEqual(2050);
  });

  it('should track bounce on immediate unmount (0ms)', () => {
    const { unmount } = render(<SharePageAnalytics assetId={mockAssetId} />);

    // Clear the page_view call
    vi.clearAllMocks();

    // Unmount immediately (user leaves instantly)
    unmount();

    expect(track).toHaveBeenCalledWith('share_page_bounce', {
      assetId: mockAssetId,
      timeOnPage: expect.any(Number),
    });

    // Verify timeOnPage is very small (< 100ms)
    const bounceCall = (track as any).mock.calls.find(
      (call: any) => call[0] === 'share_page_bounce'
    );
    expect(bounceCall[1].timeOnPage).toBeLessThan(100);
  });

  it('should NOT track bounce when user stays longer than 5 seconds', () => {
    const { unmount } = render(<SharePageAnalytics assetId={mockAssetId} />);

    // Clear the page_view call
    vi.clearAllMocks();

    // Advance time by 6 seconds (user stays engaged)
    vi.advanceTimersByTime(6000);

    // Unmount after staying >5s
    unmount();

    // Bounce event should NOT be tracked
    expect(track).not.toHaveBeenCalled();
  });

  it('should track bounce at exactly 4.9 seconds (edge case before threshold)', () => {
    const { unmount } = render(<SharePageAnalytics assetId={mockAssetId} />);

    // Clear the page_view call
    vi.clearAllMocks();

    // Advance time to just before 5 seconds
    vi.advanceTimersByTime(4900);

    // Unmount
    unmount();

    expect(track).toHaveBeenCalledWith('share_page_bounce', {
      assetId: mockAssetId,
      timeOnPage: expect.any(Number),
    });

    const bounceCall = (track as any).mock.calls.find(
      (call: any) => call[0] === 'share_page_bounce'
    );
    expect(bounceCall[1].timeOnPage).toBeGreaterThanOrEqual(4850);
    expect(bounceCall[1].timeOnPage).toBeLessThan(5000);
  });

  it('should NOT track bounce at exactly 5 seconds (edge case at threshold)', () => {
    const { unmount } = render(<SharePageAnalytics assetId={mockAssetId} />);

    // Clear the page_view call
    vi.clearAllMocks();

    // Advance time to exactly 5 seconds
    vi.advanceTimersByTime(5000);

    // Unmount
    unmount();

    // Bounce should NOT be tracked (timeOnPage >= 5000)
    expect(track).not.toHaveBeenCalled();
  });

  it('should track page view with correct assetId when assetId changes', () => {
    const { rerender } = render(<SharePageAnalytics assetId="asset-1" />);

    expect(track).toHaveBeenCalledWith('share_page_view', {
      assetId: 'asset-1',
      referrer: 'direct',
      timestamp: expect.any(Number),
    });

    vi.clearAllMocks();

    // Change assetId (triggers useEffect re-run)
    rerender(<SharePageAnalytics assetId="asset-2" />);

    expect(track).toHaveBeenCalledWith('share_page_view', {
      assetId: 'asset-2',
      referrer: 'direct',
      timestamp: expect.any(Number),
    });
  });

  it('should track bounce with old assetId when component unmounts after assetId change', () => {
    const { rerender, unmount } = render(<SharePageAnalytics assetId="asset-1" />);

    vi.clearAllMocks();

    // Advance time by 2 seconds
    vi.advanceTimersByTime(2000);

    // Change assetId (this triggers cleanup of previous effect)
    rerender(<SharePageAnalytics assetId="asset-2" />);

    // Should have tracked bounce for asset-1 (old assetId)
    expect(track).toHaveBeenCalledWith('share_page_bounce', {
      assetId: 'asset-1',
      timeOnPage: expect.any(Number),
    });

    vi.clearAllMocks();
    vi.advanceTimersByTime(6000);

    // Final unmount (asset-2 should NOT bounce - >5s)
    unmount();

    expect(track).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SharePageCTA } from '@/components/share/share-page-cta';
import React from 'react';

// Mock Button component to avoid Radix UI complexity in tests
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    asChild,
    className,
    size,
    ...props
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    className?: string;
    size?: string;
    [key: string]: unknown;
  }) => {
    if (asChild) {
      // When asChild is true, render children directly (Link component)
      return <div className={className} data-size={size} {...props}>{children}</div>;
    }
    return <button className={className} data-size={size} {...props}>{children}</button>;
  },
}));

describe('SharePageCTA', () => {
  const mockAssetId = 'test-asset-123';

  describe('Rendering', () => {
    it('should render CTA button text', () => {
      render(<SharePageCTA assetId={mockAssetId} />);

      expect(screen.getByText('Create your collection')).toBeInTheDocument();
    });

    it('should render with correct aria-label for accessibility', () => {
      render(<SharePageCTA assetId={mockAssetId} />);

      const cta = screen.getByLabelText('Create your collection on Sploot');
      expect(cta).toBeInTheDocument();
    });

    it('should apply custom className when provided', () => {
      const { container } = render(
        <SharePageCTA assetId={mockAssetId} className="custom-test-class" />
      );

      const button = container.firstChild as HTMLElement;
      expect(button).toHaveClass('custom-test-class');
    });
  });

  describe('Link Construction', () => {
    it('should link to sign-up page with UTM parameters', () => {
      render(<SharePageCTA assetId={mockAssetId} />);

      const link = screen.getByText('Create your collection').closest('a');
      expect(link).toHaveAttribute('href', `/sign-up?ref=share&id=${mockAssetId}`);
    });

    it('should include asset ID in query parameters', () => {
      const customAssetId = 'custom-asset-456';
      render(<SharePageCTA assetId={customAssetId} />);

      const link = screen.getByText('Create your collection').closest('a');
      expect(link?.getAttribute('href')).toContain(`id=${customAssetId}`);
    });

    it('should include ref parameter for tracking', () => {
      render(<SharePageCTA assetId={mockAssetId} />);

      const link = screen.getByText('Create your collection').closest('a');
      expect(link?.getAttribute('href')).toContain('ref=share');
    });

    it('should URL-encode asset IDs with ampersands', () => {
      const assetIdWithAmpersand = 'id&foo=bar';
      render(<SharePageCTA assetId={assetIdWithAmpersand} />);

      const link = screen.getByText('Create your collection').closest('a');
      // & should be encoded as %26
      expect(link).toHaveAttribute('href', '/sign-up?ref=share&id=id%26foo%3Dbar');
    });

    it('should URL-encode asset IDs with question marks', () => {
      const assetIdWithQuestion = 'asset?query=test';
      render(<SharePageCTA assetId={assetIdWithQuestion} />);

      const link = screen.getByText('Create your collection').closest('a');
      // ? should be encoded as %3F
      expect(link).toHaveAttribute('href', '/sign-up?ref=share&id=asset%3Fquery%3Dtest');
    });

    it('should URL-encode asset IDs with spaces', () => {
      const assetIdWithSpace = 'asset with spaces';
      render(<SharePageCTA assetId={assetIdWithSpace} />);

      const link = screen.getByText('Create your collection').closest('a');
      // Spaces should be encoded as %20
      expect(link).toHaveAttribute('href', '/sign-up?ref=share&id=asset%20with%20spaces');
    });

    it('should URL-encode asset IDs with hash symbols', () => {
      const assetIdWithHash = 'asset#fragment';
      render(<SharePageCTA assetId={assetIdWithHash} />);

      const link = screen.getByText('Create your collection').closest('a');
      // # should be encoded as %23
      expect(link).toHaveAttribute('href', '/sign-up?ref=share&id=asset%23fragment');
    });

    it('should handle simple asset IDs without double-encoding', () => {
      // Simple IDs without special chars should work as before
      const simpleId = 'simple-asset-id-123';
      render(<SharePageCTA assetId={simpleId} />);

      const link = screen.getByText('Create your collection').closest('a');
      expect(link).toHaveAttribute('href', `/sign-up?ref=share&id=${simpleId}`);
    });
  });

  describe('Styling', () => {
    it('should apply primary button styling', () => {
      const { container } = render(<SharePageCTA assetId={mockAssetId} />);

      const button = container.firstChild as HTMLElement;
      expect(button).toHaveClass('bg-primary', 'text-primary-foreground');
    });

    it('should include hover effects', () => {
      const { container } = render(<SharePageCTA assetId={mockAssetId} />);

      const button = container.firstChild as HTMLElement;
      expect(button.className).toContain('hover:bg-primary/90');
      expect(button.className).toContain('hover:shadow-lg');
      expect(button.className).toContain('hover:shadow-primary/20');
    });

    it('should include touch feedback with active state', () => {
      const { container } = render(<SharePageCTA assetId={mockAssetId} />);

      const button = container.firstChild as HTMLElement;
      expect(button.className).toContain('active:scale-95');
    });

    it('should include transition for smooth animations', () => {
      const { container } = render(<SharePageCTA assetId={mockAssetId} />);

      const button = container.firstChild as HTMLElement;
      expect(button.className).toContain('transition-all');
      expect(button.className).toContain('duration-200');
    });

    it('should prevent text selection for better touch experience', () => {
      const { container } = render(<SharePageCTA assetId={mockAssetId} />);

      const button = container.firstChild as HTMLElement;
      expect(button).toHaveClass('select-none');
    });
  });

  describe('Touch Optimization', () => {
    it('should have minimum 48px touch target on mobile', () => {
      const { container } = render(<SharePageCTA assetId={mockAssetId} />);

      const button = container.firstChild as HTMLElement;
      // h-12 = 48px (3rem)
      expect(button).toHaveClass('h-12');
    });

    it('should apply responsive sizing for desktop', () => {
      const { container } = render(<SharePageCTA assetId={mockAssetId} />);

      const button = container.firstChild as HTMLElement;
      // Desktop: h-10 = 40px
      expect(button.className).toContain('sm:h-10');
    });

    it('should have adequate padding for touch targets', () => {
      const { container } = render(<SharePageCTA assetId={mockAssetId} />);

      const button = container.firstChild as HTMLElement;
      expect(button).toHaveClass('px-4');
      expect(button.className).toContain('sm:px-6');
    });

    it('should use appropriate text size', () => {
      const { container } = render(<SharePageCTA assetId={mockAssetId} />);

      const button = container.firstChild as HTMLElement;
      expect(button).toHaveClass('text-sm');
    });
  });

  describe('Accessibility', () => {
    it('should have focus visible styles', () => {
      const { container } = render(<SharePageCTA assetId={mockAssetId} />);

      const button = container.firstChild as HTMLElement;
      expect(button.className).toContain('focus-visible:ring-2');
      expect(button.className).toContain('focus-visible:ring-primary');
    });

    it('should use default button size', () => {
      const { container } = render(<SharePageCTA assetId={mockAssetId} />);

      const button = container.firstChild as HTMLElement;
      expect(button).toHaveAttribute('data-size', 'default');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty asset ID gracefully', () => {
      render(<SharePageCTA assetId="" />);

      const link = screen.getByText('Create your collection').closest('a');
      expect(link?.getAttribute('href')).toBe('/sign-up?ref=share&id=');
    });

    it('should handle asset ID with special characters', () => {
      const specialId = 'asset-123_ABC.xyz';
      render(<SharePageCTA assetId={specialId} />);

      const link = screen.getByText('Create your collection').closest('a');
      expect(link?.getAttribute('href')).toContain(`id=${specialId}`);
    });

    it('should properly encode asset ID with spaces in URL', () => {
      const idWithSpace = 'asset 123';
      render(<SharePageCTA assetId={idWithSpace} />);

      const link = screen.getByText('Create your collection').closest('a');
      // Spaces should be encoded as %20
      expect(link?.getAttribute('href')).toBe('/sign-up?ref=share&id=asset%20123');
    });
  });
});

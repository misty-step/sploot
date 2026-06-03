import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Navbar, NavbarSpacer } from '@/components/chrome/navbar';
import React from 'react';

// Mock child components
vi.mock('@/components/chrome/user-avatar', () => ({
  UserAvatar: ({ onSignOut }: { onSignOut?: () => void }) => (
    <button data-testid="user-avatar" onClick={onSignOut}>
      User Avatar
    </button>
  ),
}));

describe('Navbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render navigation element with correct role', () => {
      render(<Navbar />);

      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
      expect(nav.tagName).toBe('NAV');
    });

    it('should render overlapping circles logo and SPLOOT wordmark', () => {
      render(<Navbar />);

      // Check for logo link with correct aria-label
      const logoLink = screen.getByLabelText('Sploot - Home');
      expect(logoLink).toBeInTheDocument();
      expect(logoLink).toHaveAttribute('href', '/app');

      // Check for SPLOOT wordmark
      expect(screen.getByText('SPLOOT')).toBeInTheDocument();
    });

    it('should render UserAvatar when showUserAvatar is true (default)', () => {
      render(<Navbar />);

      expect(screen.getByTestId('user-avatar')).toBeInTheDocument();
    });

    it('should not render UserAvatar when showUserAvatar is false', () => {
      render(<Navbar showUserAvatar={false} />);

      expect(screen.queryByTestId('user-avatar')).not.toBeInTheDocument();
    });

    it('should render custom children when provided', () => {
      render(
        <Navbar>
          <div data-testid="custom-child">Custom Content</div>
        </Navbar>
      );

      expect(screen.getByTestId('custom-child')).toBeInTheDocument();
    });
  });

  describe('Styling and Layout', () => {
    it('should have fixed positioning at top', () => {
      render(<Navbar />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('fixed', 'top-0', 'left-0', 'right-0');
    });

    it('should have correct height (48px mobile, 64px desktop)', () => {
      render(<Navbar />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('h-12', 'md:h-16');
    });

    it('should have correct z-index for layering', () => {
      render(<Navbar />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('z-50');
    });

    it('should have background and border styling', () => {
      render(<Navbar />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('bg-background', 'border-b', 'border-border');
    });

    it('should have backdrop blur effect', () => {
      render(<Navbar />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('backdrop-blur-sm');
    });

    it('should apply custom className when provided', () => {
      render(<Navbar className="custom-navbar-class" />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('custom-navbar-class');
    });
  });

  describe('Callbacks', () => {
    it('should pass onSignOut callback to UserAvatar', () => {
      const mockSignOut = vi.fn();
      render(<Navbar onSignOut={mockSignOut} />);

      const userAvatar = screen.getByTestId('user-avatar');
      userAvatar.click();

      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });
});

describe('NavbarSpacer', () => {
  it('should render a spacer div with correct height', () => {
    const { container } = render(<NavbarSpacer />);

    const spacer = container.firstChild as HTMLElement;
    expect(spacer).toBeInTheDocument();
    expect(spacer).toHaveClass('h-[calc(3rem+env(safe-area-inset-top))]', 'md:h-[calc(4rem+env(safe-area-inset-top))]');
  });

  it('should match navbar height (48px mobile, 64px desktop)', () => {
    const { container: navbarContainer } = render(<Navbar />);
    const { container: spacerContainer } = render(<NavbarSpacer />);

    const navbar = navbarContainer.querySelector('nav');
    const spacer = spacerContainer.firstChild as HTMLElement;

    // Navbar has responsive height, spacer includes safe area inset
    expect(navbar).toHaveClass('h-12', 'md:h-16');
    expect(spacer).toHaveClass('h-[calc(3rem+env(safe-area-inset-top))]', 'md:h-[calc(4rem+env(safe-area-inset-top))]');
  });
});

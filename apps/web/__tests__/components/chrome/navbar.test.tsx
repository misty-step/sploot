import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Navbar, NavbarSpacer } from '@/components/chrome/navbar';
import React from 'react';

// Mock child components
vi.mock('@/components/chrome/user-avatar', () => ({
  UserAvatar: ({
    onSignOut,
    className,
  }: {
    onSignOut?: () => void;
    className?: string;
  }) => (
    <button
      aria-label="User menu"
      data-testid="user-avatar"
      className={`${className ?? ''} max-sm:size-[var(--sploot-touch-target)]`}
      onClick={onSignOut}
    >
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

    it('reserves a touch-safe rail instead of clipping compact controls', () => {
      render(<Navbar />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass(
        'h-auto',
        'min-h-[calc(var(--sploot-touch-target)+0.75rem+env(safe-area-inset-top)+3px)]',
        'md:min-h-[calc(4rem+env(safe-area-inset-top)+3px)]'
      );
    });

    it('should have correct z-index for layering', () => {
      render(<Navbar />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('z-50');
    });

    it('should have background and border styling', () => {
      render(<Navbar />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('bg-background', 'border-b-[3px]', 'border-sploot-ink');
    });

    it('should be opaque chrome with no backdrop blur (DESIGN.md bans soft chrome)', () => {
      render(<Navbar />);

      const nav = screen.getByRole('navigation');
      expect(nav.className).not.toMatch(/backdrop-blur/);
    });

    it('should apply custom className when provided', () => {
      render(<Navbar className="custom-navbar-class" />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('custom-navbar-class');
    });

    it('keeps all navbar controls centered inside a touch-safe mobile chrome rail', () => {
      render(<Navbar />);

      const nav = screen.getByRole('navigation');
      const help = screen.getByRole('button', { name: 'keyboard shortcuts' });
      const theme = screen.getByRole('button', { name: 'switch theme' });
      const auth = screen.getByRole('button', { name: 'User menu' });

      expect(nav).toHaveClass(
        'min-h-[calc(var(--sploot-touch-target)+0.75rem+env(safe-area-inset-top)+3px)]',
        'md:min-h-[calc(4rem+env(safe-area-inset-top)+3px)]',
        'items-center'
      );
      for (const control of [help, theme, auth]) {
        expect(control).toHaveClass('max-sm:size-[var(--sploot-touch-target)]');
      }
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
    expect(spacer).toHaveClass(
      'h-[calc(var(--sploot-touch-target)+0.75rem+env(safe-area-inset-top)+3px)]',
      'md:h-[calc(4rem+env(safe-area-inset-top)+3px)]'
    );
  });

  it('keeps the spacer aligned with the touch-safe navbar rail', () => {
    const { container: navbarContainer } = render(<Navbar />);
    const { container: spacerContainer } = render(<NavbarSpacer />);

    const navbar = navbarContainer.querySelector('nav');
    const spacer = spacerContainer.firstChild as HTMLElement;

    expect(navbar).toHaveClass(
      'min-h-[calc(var(--sploot-touch-target)+0.75rem+env(safe-area-inset-top)+3px)]',
      'md:min-h-[calc(4rem+env(safe-area-inset-top)+3px)]'
    );
    expect(spacer).toHaveClass(
      'h-[calc(var(--sploot-touch-target)+0.75rem+env(safe-area-inset-top)+3px)]',
      'md:h-[calc(4rem+env(safe-area-inset-top)+3px)]'
    );
  });
});

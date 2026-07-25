import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SharePageLayout } from '@/components/share/share-page-layout';
import React from 'react';

describe('SharePageLayout', () => {
  describe('Rendering', () => {
    it('should render all required slot children', () => {
      render(
        <SharePageLayout
          logo={<div data-testid="logo">Logo</div>}
          cta={<button data-testid="cta">CTA</button>}
          image={<img data-testid="image" alt="test" />}
        />
      );

      expect(screen.getByTestId('logo')).toBeInTheDocument();
      expect(screen.getByTestId('cta')).toBeInTheDocument();
      expect(screen.getByTestId('image')).toBeInTheDocument();
    });

    it('should render optional metadata slot when provided', () => {
      render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
          metadata={<div data-testid="metadata">Metadata</div>}
        />
      );

      expect(screen.getByTestId('metadata')).toBeInTheDocument();
    });

    it('should not render footer when metadata is not provided', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
        />
      );

      const footer = container.querySelector('footer');
      expect(footer).not.toBeInTheDocument();
    });
  });

  describe('Semantic HTML', () => {
    it('should use semantic header element', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
        />
      );

      const header = container.querySelector('header');
      expect(header).toBeInTheDocument();
      expect(header?.tagName).toBe('HEADER');
    });

    it('should use semantic main element', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
        />
      );

      const main = container.querySelector('main');
      expect(main).toBeInTheDocument();
      expect(main?.tagName).toBe('MAIN');
    });

    it('should use semantic footer element when metadata provided', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
          metadata={<div>Metadata</div>}
        />
      );

      const footer = container.querySelector('footer');
      expect(footer).toBeInTheDocument();
      expect(footer?.tagName).toBe('FOOTER');
    });
  });

  describe('Layout Structure', () => {
    it('should apply toybox shelf background', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
        />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('bg-sploot-workbench', 'text-sploot-ink');
    });

    it('should apply flexbox column layout', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
        />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex', 'flex-col');
    });

    it('should apply minimum full-screen height', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
        />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('min-h-screen');
    });

    it('should apply custom className when provided', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
          className="custom-class"
        />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('Safe Area Insets', () => {
    it('should include iOS safe area inset padding', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
        />
      );

      const wrapper = container.firstChild as HTMLElement;
      // Check that safe area CSS custom properties are applied
      expect(wrapper.className).toContain('pb-[env(safe-area-inset-bottom)]');
      expect(wrapper.className).toContain('pt-[env(safe-area-inset-top)]');
    });
  });

  describe('Responsive Layout', () => {
    it('should apply responsive padding to header', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
        />
      );

      const header = container.querySelector('header');
      expect(header).toHaveClass('px-4', 'py-3');
      expect(header?.className).toContain('sm:px-6');
      expect(header?.className).toContain('sm:py-4');
    });

    it('should apply responsive padding to main', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
        />
      );

      const main = container.querySelector('main');
      expect(main).toHaveClass('p-4');
      expect(main?.className).toContain('sm:p-6');
    });

    it('should center content in main section', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
        />
      );

      const main = container.querySelector('main');
      expect(main).toHaveClass('flex', 'items-center', 'justify-center');
    });
  });

  describe('Header Layout', () => {
    it('should position logo and CTA with space between', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
        />
      );

      const header = container.querySelector('header');
      expect(header).toHaveClass('flex', 'items-center', 'justify-between');
    });

    it('should have border bottom on header', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
        />
      );

      const header = container.querySelector('header');
      expect(header).toHaveClass('border-b', 'border-sploot-ink/15');
    });
  });

  describe('Footer Layout', () => {
    it('should center metadata content in footer', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
          metadata={<div>Metadata</div>}
        />
      );

      const footer = container.querySelector('footer');
      expect(footer).toHaveClass('flex', 'items-center', 'justify-center');
    });

    it('should have border top on footer', () => {
      const { container } = render(
        <SharePageLayout
          logo={<div>Logo</div>}
          cta={<button>CTA</button>}
          image={<img alt="test" />}
          metadata={<div>Metadata</div>}
        />
      );

      const footer = container.querySelector('footer');
      expect(footer).toHaveClass('border-t', 'border-sploot-ink/15');
    });
  });
});

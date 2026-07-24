import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SharePageTagline } from '@/components/share/share-page-tagline';
import React from 'react';

describe('SharePageTagline', () => {
  it('renders the toybox brand line for a stranger recipient', () => {
    render(<SharePageTagline />);

    expect(screen.getByText('no folders. just vibes.')).toBeInTheDocument();
  });

  it('never leaks file size, pixel dimensions, or MIME type', () => {
    render(<SharePageTagline />);

    expect(screen.queryByText(/size:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dimensions:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/type:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+(\.\d+)?(B|KB|MB)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*×\s*\d+/)).not.toBeInTheDocument();
  });

  it('applies a custom className alongside the base styling', () => {
    const { container } = render(<SharePageTagline className="custom-tagline-class" />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-tagline-class', 'font-mono', 'text-sploot-ink/60');
  });
});

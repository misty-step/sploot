import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, buttonVariants } from '@/components/ui/button';

describe('compact control button', () => {
  it('is a dedicated flat control instead of a scaled-down heavy action button', () => {
    render(
      <Button variant={'compact' as never} size="icon" aria-label="compact action">
        x
      </Button>
    );

    const control = screen.getByRole('button', { name: 'compact action' });
    const compactClasses = buttonVariants({ variant: 'compact' as never, size: 'icon' });

    expect(control).toHaveAttribute('data-variant', 'compact');
    expect(compactClasses).not.toContain('sploot-press');
    expect(compactClasses).not.toContain('sploot-shadow');
    expect(compactClasses).not.toContain('border-[length:var(--sploot-active-border-width)]');
  });
});

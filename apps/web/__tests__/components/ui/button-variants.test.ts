import { describe, it, expect } from 'vitest';
import { buttonVariants } from '@/components/ui/button';

// The toybox button grammar contract (lab-034 AFD-8). Several consumer tests
// mock the Button component away, so this file is the single place that
// asserts the real variant classes: physics utility, on-color foregrounds,
// pill shell, and focus treatment. If these regress, dark-mode contrast and
// the hover-physics law regress with them.
describe('buttonVariants (toybox grammar)', () => {
  it('primary rides the physics utility with theme-aware on-blue text', () => {
    const cls = buttonVariants({ variant: 'default' });
    expect(cls).toContain('sploot-press');
    expect(cls).toContain('bg-sploot-blue');
    expect(cls).toContain('text-sploot-on-blue');
    expect(cls).toContain('sploot-shadow');
  });

  it('destructive uses the on-red foreground (AA in both themes)', () => {
    const cls = buttonVariants({ variant: 'destructive' });
    expect(cls).toContain('bg-sploot-red');
    expect(cls).toContain('text-sploot-on-red');
  });

  it('every variant is a pill with the ink shell and visible focus', () => {
    const cls = buttonVariants({ variant: 'secondary' });
    expect(cls).toContain('rounded-[var(--sploot-radius-pill)]');
    expect(cls).toContain('border-sploot-ink');
    expect(cls).toContain('focus-visible:outline-4');
    expect(cls).toContain('focus-visible:outline-sploot-focus');
  });

  it('uses the shared control height ladder for action sizes', () => {
    expect(buttonVariants({ size: 'sm' })).toContain('h-[var(--sploot-control-height-sm)]');
    expect(buttonVariants({ size: 'default' })).toContain('min-h-[var(--sploot-control-height)]');
    expect(buttonVariants({ size: 'lg' })).toContain('min-h-[var(--sploot-control-height-lg)]');
  });

  it('link stays flat: no physics, no shell fill', () => {
    const cls = buttonVariants({ variant: 'link' });
    expect(cls).not.toContain('sploot-press');
    expect(cls).toContain('bg-transparent');
  });
});

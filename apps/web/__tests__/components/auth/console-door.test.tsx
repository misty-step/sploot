import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ConsoleDoor,
  consoleDoorAppearance,
} from '@/components/auth/console-door';

vi.mock('@clerk/nextjs', () => ({
  SignIn: ({ appearance }: { appearance: typeof consoleDoorAppearance }) => (
    <form aria-label="Clerk sign in">
      <label>
        email
        <input className={appearance.elements?.formFieldInput} placeholder="email" />
      </label>
      <button className={appearance.elements?.formButtonPrimary} type="submit">Continue</button>
    </form>
  ),
}));

import { SignIn } from '@clerk/nextjs';
import SignInPage from '@/app/sign-in/[[...sign-in]]/page';

function contrastRatio(foreground: string, background: string): number {
  const channel = (hex: string, offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) =>
    0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
  const light = luminance(foreground);
  const dark = luminance(background);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

describe('ConsoleDoor auth shell', () => {
  it('provides one main landmark and a keyboard bypass to the Clerk surface', () => {
    render(
      <ConsoleDoor title="sign in to your pile">
        <SignIn appearance={consoleDoorAppearance} />
      </ConsoleDoor>
    );

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'skip to sign in' })).toHaveAttribute(
      'href',
      '#auth-content'
    );
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('main')).toHaveClass('focus-visible:outline-4');
    expect(screen.getByRole('heading', { name: 'sploot' })).toBeInTheDocument();
    expect(screen.getByText('sign in to your pile')).toBeInTheDocument();
  });

  it('keeps Clerk text, placeholders, and desktop controls on the contrast/target contract', () => {
    expect(consoleDoorAppearance.variables).toMatchObject({
      colorText: 'var(--foreground)',
      colorTextSecondary: 'var(--muted-foreground)',
      colorInputText: 'var(--foreground)',
      colorInputBackground: 'var(--background)',
    });

    expect(consoleDoorAppearance.elements?.formFieldInput).toContain(
      'min-h-[var(--sploot-touch-target)]'
    );
    expect(consoleDoorAppearance.elements?.formButtonPrimary).toContain(
      'min-h-[var(--sploot-touch-target)]'
    );
    expect(consoleDoorAppearance.elements?.formFieldInputShowPasswordButton).toContain(
      'min-w-[var(--sploot-touch-target)]'
    );
  });

  it('renders the Clerk target-size contract through the sign-in page shell', async () => {
    render(await SignInPage());

    expect(screen.getByRole('form', { name: 'Clerk sign in' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('email')).toHaveClass('min-h-[var(--sploot-touch-target)]');
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('min-h-[var(--sploot-touch-target)]');
    expect(contrastRatio('#d9ccba', '#2d255e')).toBeGreaterThanOrEqual(3);
  });
});

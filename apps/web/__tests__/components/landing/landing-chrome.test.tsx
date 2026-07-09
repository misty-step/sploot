import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/lib/auth/server', () => ({
  getAuth: vi.fn().mockResolvedValue({ userId: null }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}));

import Home from '@/app/page';

describe('landing page chrome', () => {
  it('keeps sign-in and theme controls readable on hover without heavy button chrome', async () => {
    await act(async () => {
      render(await Home());
    });

    const signIn = screen.getByRole('link', { name: /sign in/i });
    expect(signIn.className).toMatch(/hover:bg-(sploot-ink|black)/);
    expect(signIn.className).toMatch(/hover:text-(white|sploot-paper)/);

    const theme = await waitFor(() => screen.getByRole('button', { name: /toggle theme/i }));
    expect(theme).toHaveAttribute('data-variant', 'compact');
    expect(theme).not.toHaveClass('sploot-press', 'sploot-shadow-sm');
  });
});

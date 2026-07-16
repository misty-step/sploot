import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  EnrollmentIdentityConflict,
  EnrollmentPaused,
  EnrollmentUnavailable,
} from '@/components/enrollment/enrollment-paused';

const { signOut, useUser } = vi.hoisted(() => ({ signOut: vi.fn(), useUser: vi.fn() }));
vi.mock('@clerk/nextjs', () => ({ useUser }));
vi.mock('@/lib/auth/client', () => ({
  useAuthActions: () => ({ signOut }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('enrollment terminal states', () => {
  it.each([EnrollmentPaused, EnrollmentUnavailable, EnrollmentIdentityConflict])('keeps signed-out escapes truthful', (Component) => {
    useUser.mockReturnValue({ isLoaded: true, isSignedIn: false });
    render(<Component />);

    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Existing user: sign in' })).toHaveAttribute('href', '/sign-in');
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('class', expect.stringContaining('min-h-screen'));
  });

  it('shows sign out only after Clerk confirms an existing session', () => {
    useUser.mockReturnValue({ isLoaded: true, isSignedIn: true });
    render(<EnrollmentPaused />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  EnrollmentIdentityConflict,
  EnrollmentPaused,
  EnrollmentUnavailable,
} from '@/components/enrollment/enrollment-paused';

const signOut = vi.fn();
vi.mock('@/lib/auth/client', () => ({
  useAuthActions: () => ({ signOut }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('enrollment terminal states', () => {
  it.each([EnrollmentPaused, EnrollmentUnavailable, EnrollmentIdentityConflict])('provides accessible home and sign-out escapes', (Component) => {
    render(<Component />);

    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('class', expect.stringContaining('min-h-screen'));
  });
});

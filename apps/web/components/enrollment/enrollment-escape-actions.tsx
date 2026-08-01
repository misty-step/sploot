'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthActions, useAuthUser } from '@/lib/auth/client';

export function EnrollmentEscapeActions({ showSignOut = true }: { showSignOut?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3" aria-label="account recovery actions">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-sploot-ink bg-sploot-panel px-4 py-2 text-sm font-bold text-sploot-ink hover:underline focus-visible:outline focus-visible:outline-4 focus-visible:outline-sploot-focus"
      >
        Return home
      </Link>
      <Link
        href="/sign-in"
        className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-sploot-ink bg-sploot-panel px-4 py-2 text-sm font-bold text-sploot-ink hover:underline focus-visible:outline focus-visible:outline-4 focus-visible:outline-sploot-focus"
      >
        Existing user: sign in
      </Link>
      {showSignOut ? <SignedInSignOutEscape /> : null}
    </div>
  );
}

function SignedInSignOutEscape() {
  const { signOut } = useAuthActions();
  const { user } = useAuthUser();
  const isSignedIn = Boolean(user);
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push('/');
  }

  if (!isSignedIn) return null;

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-sploot-ink bg-sploot-ink px-4 py-2 text-sm font-bold text-sploot-paper hover:underline focus-visible:outline focus-visible:outline-4 focus-visible:outline-sploot-focus"
    >
      Sign out
    </button>
  );
}

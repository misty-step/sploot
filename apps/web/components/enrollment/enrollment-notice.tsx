import Link from 'next/link';
import type { SplootEnrollmentPublicState } from '@sploot/common';

interface EnrollmentNoticeProps {
  state: SplootEnrollmentPublicState;
  compact?: boolean;
}

/**
 * The one public statement about new-account availability. Distinguishes the
 * deliberate policy pause from the database-unavailable 'unknown' read: both
 * stay fail-closed for sign-up, but the copy never claims a pause it cannot
 * prove. The sign-in/support escape hatches are real >=44px touch targets.
 */
export function EnrollmentNotice({ state, compact = false }: EnrollmentNoticeProps) {
  if (state.status === 'open') return null;

  const unknown = state.status === 'unknown';

  return (
    <aside
      aria-label="new enrollment status"
      className={compact
        ? 'sploot-card w-full max-w-md space-y-3 p-4'
        : 'sploot-card w-full space-y-3 p-5'}
    >
      <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-sploot-blue">
        {unknown ? 'enrollment status unavailable' : 'new enrollment is paused'}
      </p>
      <p className="text-sm leading-6 text-sploot-ink">
        {unknown
          ? 'Sploot cannot confirm new-account availability right now, so sign-up stays closed until it can. Existing accounts are unaffected.'
          : 'New library accounts are not being accepted right now. Existing users can sign in as usual; contact support if you already have an account and need help.'}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/sign-in"
          className="sploot-public-link inline-flex min-h-11 min-w-11 items-center text-sm font-bold focus-visible:outline focus-visible:outline-4 focus-visible:outline-sploot-focus"
        >
          sign in
        </Link>
        <Link
          href="/support"
          className="sploot-public-link inline-flex min-h-11 min-w-11 items-center text-sm font-bold focus-visible:outline focus-visible:outline-4 focus-visible:outline-sploot-focus"
        >
          contact support
        </Link>
      </div>
    </aside>
  );
}

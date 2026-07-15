import Link from 'next/link';
import type { SplootEnrollmentPublicState } from '@sploot/common';

interface EnrollmentNoticeProps {
  state: SplootEnrollmentPublicState;
  compact?: boolean;
}

export function EnrollmentNotice({ state, compact = false }: EnrollmentNoticeProps) {
  if (state.status === 'open') return null;

  return (
    <aside
      aria-label="new enrollment status"
      className={compact
        ? 'sploot-card w-full max-w-md space-y-2 p-4'
        : 'sploot-card w-full space-y-3 p-5'}
    >
      <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-sploot-blue">
        new enrollment is paused
      </p>
      <p className="text-sm leading-6 text-sploot-ink">
        New library accounts are not being accepted right now. Existing users can{' '}
        <Link href="/sign-in" className="sploot-public-link font-bold">
          sign in
        </Link>{' '}
        as usual; if you already have an account and need help,{' '}
        <Link href="/support" className="sploot-public-link font-bold">
          contact support
        </Link>
        .
      </p>
    </aside>
  );
}

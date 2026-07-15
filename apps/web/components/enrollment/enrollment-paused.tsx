import Link from 'next/link';
import { EnrollmentEscapeActions } from './enrollment-escape-actions';

export function EnrollmentPaused() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sploot-workbench px-6 py-12 text-sploot-ink">
      <section className="sploot-card max-w-xl space-y-5 p-8">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-sploot-blue">
          enrollment paused
        </p>
        <h1 className="font-display text-4xl leading-none sm:text-5xl">
          the doors are taking a breather
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Sploot is not accepting new library accounts right now while the
          launch systems finish cooking. Nothing was uploaded, billed, or
          deleted. Existing libraries keep their normal read, export, and
          delete access.
        </p>
        <p className="text-sm text-muted-foreground">
          Try again later, or contact support if you think this is your existing
          account.
        </p>
        <Link href="/support" className="inline-flex text-sm font-bold text-sploot-blue hover:underline">
          Contact support →
        </Link>
        <EnrollmentEscapeActions />
      </section>
    </main>
  );
}

export function EnrollmentUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sploot-workbench px-6 py-12 text-sploot-ink">
      <section className="sploot-card max-w-xl space-y-5 p-8">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-sploot-blue">
          library unavailable
        </p>
        <h1 className="font-display text-4xl leading-none sm:text-5xl">
          the library is taking a breather
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Sploot could not verify its account boundary, so no account or
          cost-bearing action was admitted. Please try again later; existing
          library data is preserved.
        </p>
        <Link href="/support" className="inline-flex text-sm font-bold text-sploot-blue hover:underline">
          Contact support →
        </Link>
        <EnrollmentEscapeActions />
      </section>
    </main>
  );
}

export function EnrollmentIdentityConflict() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-sploot-workbench px-6 py-12 text-sploot-ink">
      <section className="sploot-card max-w-xl space-y-5 p-8">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-sploot-blue">
          identity conflict
        </p>
        <h1 className="font-display text-4xl leading-none sm:text-5xl">
          this sign-in needs a human check
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Sploot found an existing library with conflicting sign-in identity
          data. Your library was preserved and no new account was admitted.
          Contact support so the identities can be reconciled safely.
        </p>
        <Link href="/support" className="inline-flex text-sm font-bold text-sploot-blue hover:underline">
          Contact support →
        </Link>
        <EnrollmentEscapeActions />
      </section>
    </main>
  );
}

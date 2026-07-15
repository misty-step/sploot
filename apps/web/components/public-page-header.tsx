import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';

const LINKS = [
  { href: '/help', label: 'help' },
  { href: '/support', label: 'support' },
  { href: '/privacy', label: 'privacy' },
  { href: '/changelog', label: 'changelog' },
] as const;

export function PublicPageHeader({ current }: { current?: (typeof LINKS)[number]['href'] }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 border-b-[3px] border-sploot-ink px-5 py-5 sm:px-8">
      <Link
        href="/"
        className="font-display text-2xl tracking-normal text-sploot-ink underline decoration-sploot-magenta decoration-[3px] underline-offset-4 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sploot-focus"
      >
        sploot
      </Link>
      <nav aria-label="Public pages" className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 font-mono text-xs font-bold lowercase sm:gap-x-5">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current === link.href ? 'page' : undefined}
            className="sploot-public-link inline-flex min-h-11 min-w-11 items-center justify-center px-1 focus-visible:outline focus-visible:outline-4 focus-visible:outline-sploot-focus"
          >
            {link.label}
          </Link>
        ))}
        <ThemeToggle />
      </nav>
    </header>
  );
}

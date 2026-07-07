import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SharePageMessageProps {
  icon: LucideIcon;
  heading: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}

/**
 * One shared terminal-state panel for the public share surface: asset gone,
 * slug dead, image failed to load. Same shell, different copy — so the
 * share page never shows a broken or duplicated message.
 */
export function SharePageMessage({
  icon: Icon,
  heading,
  body,
  ctaHref,
  ctaLabel,
}: SharePageMessageProps) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 px-6 py-16 text-center">
      <Icon className="size-12 text-sploot-cyan" strokeWidth={1.5} aria-hidden="true" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">{heading}</h1>
        <p className="text-sm text-gray-400">{body}</p>
      </div>
      <Button asChild variant="accent" size="lg">
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}

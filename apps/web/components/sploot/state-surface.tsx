'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ArrowRight, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MemeDoodle, type MemeDoodleKind } from './meme-doodle';
import { StatBlock } from './stat-block';
import { StatusBar, type StatusCell } from './status-bar';
import { StickerTab } from './sticker-tab';

type StateSurfaceAction =
  | {
      label: string;
      href: string;
      variant?: ComponentProps<typeof Button>['variant'];
    }
  | {
      label: string;
      onClick: () => void;
      variant?: ComponentProps<typeof Button>['variant'];
    };

interface StateSurfaceProps {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction: StateSurfaceAction;
  secondaryAction?: StateSurfaceAction;
  status: StatusCell[];
  detail?: ReactNode;
  doodle?: MemeDoodleKind;
  size?: 'page' | 'panel';
  className?: string;
}

function SurfaceAction({
  action,
  icon = 'arrow',
}: {
  action: StateSurfaceAction;
  icon?: 'arrow' | 'retry';
}) {
  const content = (
    <>
      {action.label}
      {icon === 'retry' ? (
        <RefreshCcw className="size-4" aria-hidden="true" />
      ) : (
        <ArrowRight className="size-4" aria-hidden="true" />
      )}
    </>
  );

  if ('href' in action) {
    return (
      <Button asChild variant={action.variant ?? 'default'}>
        <Link href={action.href}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button type="button" variant={action.variant ?? 'default'} onClick={action.onClick}>
      {content}
    </Button>
  );
}

export function StateSurface({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  status,
  detail,
  doodle = 'bubble',
  size = 'page',
  className,
}: StateSurfaceProps) {
  const isPage = size === 'page';

  return (
    <section
      className={cn(
        'bg-sploot-workbench text-sploot-ink',
        isPage ? 'min-h-screen px-5 py-10 sm:px-8' : 'min-h-[360px] px-4 py-6',
        className
      )}
    >
      <div
        className={cn(
          'mx-auto grid items-center gap-7',
          isPage
            ? 'min-h-[calc(100vh-5rem)] max-w-6xl lg:grid-cols-[minmax(0,1fr)_20rem]'
            : 'max-w-4xl lg:grid-cols-[minmax(0,1fr)_16rem]'
        )}
      >
        <div className="sploot-shadow-lg border-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-paper">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-paper-warm px-4 py-3">
            <StickerTab tone="lime">{eyebrow}</StickerTab>
            <span className="font-mono text-xs font-bold uppercase tracking-normal">
              state surface
            </span>
          </div>

          <div className={cn('space-y-5', isPage ? 'p-6 sm:p-8' : 'p-5')}>
            <h1 className="max-w-3xl font-display text-[clamp(2.6rem,7vw,6rem)] leading-[0.9] tracking-normal">
              {title}
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-sploot-ink sm:text-lg">
              {description}
            </p>

            {detail ? <div className="font-mono text-xs tracking-normal">{detail}</div> : null}

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <SurfaceAction
                action={primaryAction}
                icon={'onClick' in primaryAction ? 'retry' : 'arrow'}
              />
              {secondaryAction ? (
                <SurfaceAction
                  action={secondaryAction}
                  icon={'onClick' in secondaryAction ? 'retry' : 'arrow'}
                />
              ) : null}
            </div>
          </div>

          <StatusBar cells={status} />
        </div>

        <aside
          aria-hidden="true"
          className={cn('hidden lg:block', !isPage && 'self-stretch')}
        >
          <div className="sploot-shadow border-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-yellow p-3">
            <div className="border-[3px] border-sploot-ink bg-sploot-paper p-4 text-sploot-ink">
              <MemeDoodle kind={doodle} className={isPage ? 'min-h-[210px]' : 'min-h-[150px]'} />
            </div>
            <StatBlock label="recovery" value="1 tap" tone="ink" className="mt-3" />
          </div>
        </aside>
      </div>
    </section>
  );
}

export function DeadShareLinkState({ kind }: { kind: 'meme' | 'slug' }) {
  const isSlug = kind === 'slug';

  return (
    <StateSurface
      eyebrow={isSlug ? 'share slug 404' : 'share url 404'}
      title={isSlug ? 'this share link fell out of the pile.' : 'this meme left the pile.'}
      description={
        isSlug
          ? 'the short link does not point at a saved meme anymore. open sploot or ask for a fresh share.'
          : 'the link survived, but the saved meme is gone or private now. open sploot or ask for a fresh share.'
      }
      primaryAction={{ href: '/', label: 'open sploot' }}
      secondaryAction={{ href: '/help', label: 'get help', variant: 'ghost' }}
      doodle={isSlug ? 'zzz' : 'skull'}
      status={[
        { label: 'route', value: isSlug ? '/s/:slug' : '/m/:id' },
        { label: 'result', value: 'dead link' },
        { label: 'recovery', value: 'front door', ok: true },
      ]}
    />
  );
}

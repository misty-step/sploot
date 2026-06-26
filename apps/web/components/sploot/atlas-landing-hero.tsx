import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SearchField } from './search-field';
import { StickerTab } from './sticker-tab';
import { StatBlock } from './stat-block';
import { StatusBar } from './status-bar';

/**
 * The neo-brutalist landing hero: search console first, with the retrieval
 * machinery visible instead of hidden behind soft product chrome.
 */
export function AtlasLandingHero() {
  return (
    <section className="relative min-h-screen bg-sploot-workbench text-sploot-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-9 px-5 pb-16 pt-24 sm:px-8">
        <div className="flex flex-col items-start gap-5">
          <StickerTab tone="cyan" tilt="left">
            it&rsquo;s a search box. for memes.
          </StickerTab>
          <h1
            aria-label="type words. get the picture."
            className="font-display text-[3.4rem] uppercase leading-[0.84] tracking-normal text-sploot-ink min-[420px]:text-7xl md:text-8xl"
          >
            <span className="block">type words.</span>
            <span className="block">
              get the{' '}
              <span className="box-decoration-clone bg-sploot-yellow px-2 text-sploot-ink">
                picture.
              </span>
            </span>
          </h1>
          <p className="max-w-xl font-sans text-base leading-7 text-sploot-ink/80 md:text-lg">
            a private library for screenshots and reaction pics. type what is in the
            image, and sploot pulls the one you mean out of the pile. no folders, no tags.
          </p>
        </div>

        {/* the centerpiece: a search console that admits it is a database */}
        <SearchField />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatBlock label="demo vectors" value="8" tone="magenta" />
          <StatBlock label="folders required" value="0" tone="blue" />
          <StatBlock
            label="scorer mode"
            value="local"
            tone="paper"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <Button asChild variant="primary" size="lg">
            <Link href="/sign-up">claim your library</Link>
          </Button>
          <p className="font-mono text-xs uppercase tracking-normal text-sploot-ink/60">
            no social feed / no ads / export stays yours
          </p>
        </div>
      </div>

      {/* the product truth, on display */}
      <StatusBar
        cells={[
          { label: 'index', value: '8 demo vec' },
          { label: 'scorer', value: 'token overlap' },
          { label: 'mode', value: 'signed-out demo' },
          { label: 'route', value: '/styleguide' },
          { label: 'status', value: 'live', ok: true },
        ]}
      />
    </section>
  );
}

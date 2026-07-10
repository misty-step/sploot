import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SearchField, StatBlock, StatusBar, StickerTab } from '@/components/sploot';

/**
 * The toybox landing hero (lab-034, AFD-8). The first viewport is the product
 * mechanism itself: a search console that ranks a demo pile by meaning, sitting
 * on the dotted candy shelf. No fake window chrome, no centered SaaS emptiness —
 * the machine is on the table, running.
 */
export function LandingHero() {
  return (
    <section className="relative bg-sploot-workbench text-sploot-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-5 pb-16 pt-24 sm:px-8">
        <div className="flex flex-col items-start gap-5">
          <StickerTab tone="cyan" tilt="left">
            it&rsquo;s a search box. for memes.
          </StickerTab>
          <h1
            aria-label="type words. get the picture."
            className="font-display text-[3.1rem] leading-[0.95] tracking-normal text-sploot-ink min-[420px]:text-6xl md:text-7xl"
          >
            <span className="block">type words.</span>
            <span className="block">
              get the <em className="not-italic text-sploot-red">picture.</em>
            </span>
          </h1>
          <p className="max-w-xl font-sans text-lg font-medium leading-8 text-sploot-ink/80 md:text-xl">
            drop every meme you own into the machine. it lines them up by meaning, then
            hands you the one you meant. no folders. just vibes.
          </p>
        </div>

        {/* the centerpiece: a live search console over a real toy-card pile */}
        <SearchField />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatBlock label="demo vectors" value="8" tone="magenta" />
          <StatBlock label="folders required" value="0" tone="blue" />
          <StatBlock label="scorer mode" value="local" tone="paper" />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <Button asChild variant="primary" size="lg">
            <Link href="/sign-up">claim your library</Link>
          </Button>
          <p className="font-mono text-xs lowercase tracking-normal text-sploot-ink/60">
            no social feed. no ads. your export stays yours.
          </p>
        </div>
      </div>

      {/* the product truth, on display */}
      <StatusBar
        cells={[
          { label: 'index', value: '8 demo vec' },
          { label: 'scorer', value: 'token overlap' },
          { label: 'mode', value: 'signed-out demo' },
          { label: 'status', value: 'live', ok: true },
        ]}
      />
    </section>
  );
}

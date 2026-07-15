import Link from 'next/link';
import type { SplootEnrollmentPublicState } from '@sploot/common';
import { Button } from '@/components/ui/button';
import { EnrollmentNotice } from '@/components/enrollment/enrollment-notice';
import { StickerTab } from '@/components/sploot';

type StoryTone = 'cyan' | 'coral' | 'lime';

const FEATURES: Array<{
  tone: StoryTone;
  tab: string;
  title: string;
  body: string;
}> = [
  {
    tone: 'cyan',
    tab: 'the machine',
    title: 'type what you remember',
    body: 'describe the meme in plain words — "cat losing it", "this is fine dog". sploot embeds every image and ranks the whole pile by meaning, not by filename.',
  },
  {
    tone: 'coral',
    tab: 'the pile',
    title: 'no folders. ever.',
    body: 'everything lands in one pile. no tag trees to prune, no naming discipline to keep up. the search does the sorting so you never have to.',
  },
  {
    tone: 'lime',
    tab: 'bangers',
    title: 'heart the ones that hit',
    body: 'tap the heart on any meme to mark it a banger. your heavy hitters stay one filter away for the next group chat that needs them.',
  },
];

/**
 * Below the fold: three feature-true panels that explain the mechanism the
 * hero demoed — semantic search, one flat pile, and bangers. Toybox grammar:
 * rounded ink-shelled toy cards with drop-height elevation that lift on hover.
 */
export function LandingStory({ enrollmentState }: { enrollmentState: SplootEnrollmentPublicState }) {
  return (
    <section className="bg-sploot-workbench px-5 py-20 text-sploot-ink sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <div className="flex flex-col items-start gap-4">
          <StickerTab tone="violet" tilt="right">
            how the pile works
          </StickerTab>
          <h2 className="font-display text-4xl leading-[0.95] tracking-normal text-sploot-ink sm:text-5xl">
            you already saved it. now find it.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.tab}
              className="sploot-press sploot-shadow flex flex-col gap-4 rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink bg-sploot-panel p-6"
            >
              <StickerTab tone={feature.tone}>{feature.tab}</StickerTab>
              <h3 className="font-display text-2xl leading-tight tracking-normal text-sploot-ink">
                {feature.title}
              </h3>
              <p className="font-sans text-base leading-7 text-sploot-ink/80">
                {feature.body}
              </p>
            </article>
          ))}
        </div>

        <div className="flex flex-col items-start gap-4 rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink bg-sploot-yellow p-8 sploot-shadow sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="font-display text-2xl leading-tight tracking-normal text-[#1c1547]">
              upload chaos. get order for free.
            </p>
            <p className="font-sans text-base text-[#1c1547]/80">
              your library is private — only you can see your pile.
            </p>
          </div>
          {enrollmentState.status === 'open' ? (
            <Button asChild variant="ink" size="lg">
              <Link href="/sign-up">claim your library</Link>
            </Button>
          ) : (
            <EnrollmentNotice state={enrollmentState} compact />
          )}
        </div>
      </div>
    </section>
  );
}

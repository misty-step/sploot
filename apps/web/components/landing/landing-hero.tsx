'use client';

import { useRef } from 'react';
import Link from 'next/link';
import type { SplootEnrollmentPublicState } from '@sploot/common';
import { Button } from '@/components/ui/button';
import { EnrollmentNotice } from '@/components/enrollment/enrollment-notice';
import { SearchField, type SearchFieldHandle, StatBlock, StatusBar, StickerTab } from '@/components/sploot';

/**
 * The toybox landing hero (lab-035, IMPEC-LAND-3 convergence). A 5:7 split:
 * a sticky copy tower on the left sells the claim, a working search console
 * + demo wall on the right proves it. No fake window chrome — the machine is
 * on the table, running, and the tower's "shuffle the demo" CTA drives the
 * same shuffle as the wall header's control (SearchFieldHandle).
 */
export function LandingHero({ enrollmentState }: { enrollmentState: SplootEnrollmentPublicState }) {
  const searchFieldRef = useRef<SearchFieldHandle>(null);

  return (
    <section className="relative bg-sploot-workbench text-sploot-ink">
      <div data-testid="landing-hero-content" className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 pb-16 pt-[calc(var(--sploot-touch-target)+2.75rem)] sm:px-8 sm:pt-32 lg:grid-cols-12 lg:items-start lg:gap-8">
        {/* left tower: sticky on large screens, stacks above the console on mobile */}
        <div className="flex flex-col items-start gap-5 lg:sticky lg:top-24 lg:col-span-5">
          <StickerTab tone="cyan" tilt="left">
            it&rsquo;s a search box. for memes.
          </StickerTab>
          <h1
            aria-label="search the pile. live."
            className="font-display text-[3.1rem] leading-[0.95] tracking-normal text-sploot-ink min-[420px]:text-6xl md:text-7xl"
          >
            <span className="block">search the pile.</span>
            <span className="block">
              <em className="not-italic text-sploot-red">live.</em>
            </span>
          </h1>
          <p className="max-w-md font-sans text-lg font-medium leading-8 text-sploot-ink/80 md:text-xl">
            that panel on the right works. type what you half remember, hit find, and
            eight starter memes re-rank in front of you. no account, no upload — a
            taste of how your pile answers.
          </p>
          <div className="flex flex-wrap gap-3">
            {enrollmentState.status === 'open' ? (
              <Button asChild variant="primary" size="lg">
                <Link href="/sign-up">start your own pile</Link>
              </Button>
            ) : (
              <EnrollmentNotice state={enrollmentState} compact />
            )}
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => searchFieldRef.current?.shuffle()}
            >
              shuffle the demo
            </Button>
          </div>
          <div data-testid="landing-stats" className="grid grid-cols-2 gap-4">
            <StatBlock label="demo classics in the wall" value="8" tone="paper" />
            <StatBlock label="re-rank on every search" value="instant" tone="magenta" />
          </div>
        </div>

        {/* right column: the working console + demo wall, filling the wide 7-span */}
        <div className="lg:col-span-7">
          <SearchField ref={searchFieldRef} className="max-w-none" enrollmentState={enrollmentState} />
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

import { ImageOff } from 'lucide-react';
import { SharePageLayout } from './share-page-layout';
import { SharePageMessage } from './share-page-message';
import { OverlappingCircles } from '@/components/landing/overlapping-circles';

/**
 * Full-page terminal state for /m/[id] when the id is missing, the asset was
 * deleted, or the database is unreachable. One rendered heading, one CTA —
 * replaces the old triple-duplicated "Meme not found" branches.
 */
export function SharePageNotFound() {
  return (
    <SharePageLayout
      logo={
        <div className="flex items-center gap-2">
          <OverlappingCircles className="w-8 h-8" strokeWidth={2} />
          <span className="text-white font-medium text-sm sm:text-base">sploot</span>
        </div>
      }
      cta={null}
      image={
        <SharePageMessage
          icon={ImageOff}
          heading="this banger left the pile."
          body="deleted, expired, or never existed — pick your fanfic. either way, it's not here."
          ctaHref="/"
          ctaLabel="start your own pile"
        />
      }
    />
  );
}

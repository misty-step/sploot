import { Metadata } from 'next';
import Image from 'next/image';
import { isVideoMimeType } from '@sploot/common';
import { resolveQaSeedSrc } from '@/lib/qa/qa-image-loader';
import { prisma } from '@/lib/db';
import { SharePageLayout } from '@/components/share/share-page-layout';
import { SharePageCTA } from '@/components/share/share-page-cta';
import { SharePageTagline } from '@/components/share/share-page-tagline';
import { SharePageErrorBoundary } from '@/components/share/share-page-error-boundary';
import { OverlappingCircles } from '@/components/landing/overlapping-circles';
import { DeadShareLinkState } from '@/components/sploot/state-surface';

interface PublicMemePageProps {
  params: Promise<{ id: string }>;
}

const deadMemeMetadata: Metadata = {
  title: 'dead meme link | sploot',
  description: 'A Sploot share URL no longer points at a saved meme.',
};

// Toybox voice-bar copy (DESIGN.md §7): lowercase, deadpan, "the pile" lexicon.
// Same line for image and video shares — the mechanism doesn't change the pitch.
const SHARE_TITLE = 'a banger from the pile | sploot';
const SHARE_DESCRIPTION =
  'no folders. just vibes. sploot sorts your camera roll into a pile you can actually search.';

export async function generateMetadata({ params }: PublicMemePageProps): Promise<Metadata> {
  const { id } = (await params) ?? {};

  if (!id) {
    return deadMemeMetadata;
  }

  if (!prisma) {
    return deadMemeMetadata;
  }

  const asset = await prisma.asset.findFirst({
    where: { id, shareSlug: { not: null }, deletedAt: null },
    select: {
      id: true,
      blobUrl: true,
      thumbnailUrl: true,
      mime: true,
      width: true,
      height: true,
      createdAt: true,
      size: true,
    },
  });

  if (!asset) {
    return deadMemeMetadata;
  }

  const isVideo = isVideoMimeType(asset.mime);
  // A video file can't serve as og:image — unfurl the poster frame instead.
  const ogImageUrl = isVideo && asset.thumbnailUrl ? asset.thumbnailUrl : asset.blobUrl;

  // Construct canonical URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.sploot.app';
  const canonicalUrl = `${baseUrl}/m/${id}`;

  // Schema.org structured data for SEO
  const structuredData = isVideo
    ? {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: 'a banger from the sploot pile',
        description: 'A banger from the Sploot pile — no folders, just vibes.',
        contentUrl: asset.blobUrl,
        thumbnailUrl: ogImageUrl,
        uploadDate: asset.createdAt.toISOString(),
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'ImageObject',
        contentUrl: asset.blobUrl,
        width: asset.width || 1200,
        height: asset.height || 630,
        datePublished: asset.createdAt.toISOString(),
        author: {
          '@type': 'Organization',
          name: 'Sploot',
          url: baseUrl,
        },
        description: 'A banger from the Sploot pile — no folders, just vibes.',
      };

  return {
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    openGraph: {
      title: SHARE_TITLE,
      description: SHARE_DESCRIPTION,
      url: canonicalUrl,
      siteName: 'Sploot',
      type: 'website',
      images: [
        {
          url: ogImageUrl,
          width: asset.width || 1200,
          height: asset.height || 630,
          alt: 'Shared meme from Sploot',
        },
      ],
      ...(isVideo
        ? {
            videos: [
              {
                url: asset.blobUrl,
                width: asset.width || 1200,
                height: asset.height || 630,
                type: asset.mime,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: SHARE_TITLE,
      description: SHARE_DESCRIPTION,
      images: [ogImageUrl],
      site: '@sploot',
    },
    other: {
      'application/ld+json': JSON.stringify(structuredData),
    },
  };
}

export default async function PublicMemePage({ params }: PublicMemePageProps) {
  const { id } = (await params) ?? {};

  if (!id) {
    return <DeadShareLinkState kind="meme" />;
  }

  if (!prisma) {
    return <DeadShareLinkState kind="meme" />;
  }

  const asset = await prisma.asset.findFirst({
    where: { id, shareSlug: { not: null }, deletedAt: null },
    select: {
      id: true,
      blobUrl: true,
      thumbnailUrl: true,
      mime: true,
      width: true,
      height: true,
      size: true,
    },
  });

  if (!asset) {
    return <DeadShareLinkState kind="meme" />;
  }

  const isVideo = isVideoMimeType(asset.mime);

  return (
    <SharePageLayout
      logo={
        <div className="flex items-center gap-2">
          <OverlappingCircles className="w-8 h-8" strokeWidth={2} />
          <span className="text-sm font-medium text-sploot-ink sm:text-base">sploot</span>
        </div>
      }
      cta={<SharePageCTA assetId={id} />}
      image={
        <SharePageErrorBoundary>
          <div className="sploot-card touch-pinch-zoom flex items-center justify-center overflow-hidden p-3 sm:p-4">
            {isVideo ? (
              <video
                key={asset.blobUrl}
                aria-label="Shared meme from Sploot"
                className="max-h-[80vh] max-w-full rounded-[var(--sploot-radius-inner)] sm:max-h-[85vh]"
                poster={asset.thumbnailUrl ? resolveQaSeedSrc(asset.thumbnailUrl) : undefined}
                controls
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              >
                <source src={resolveQaSeedSrc(asset.blobUrl)} type={asset.mime} />
              </video>
            ) : (
              <Image
                src={resolveQaSeedSrc(asset.blobUrl)}
                alt="Shared meme from Sploot"
                width={asset.width || 1200}
                height={asset.height || 630}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1200px"
                className="max-h-[80vh] max-w-full select-none rounded-[var(--sploot-radius-inner)] object-contain sm:max-h-[85vh]"
                priority
                quality={90}
                draggable={false}
              />
            )}
          </div>
        </SharePageErrorBoundary>
      }
      metadata={<SharePageTagline />}
    />
  );
}

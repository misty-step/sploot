import { Metadata } from 'next';
import Image from 'next/image';
import { prisma } from '@/lib/db';
import { SharePageLayout } from '@/components/share/share-page-layout';
import { SharePageCTA } from '@/components/share/share-page-cta';
import { SharePageMetadata } from '@/components/share/share-page-metadata';
import { SharePageErrorBoundary } from '@/components/share/share-page-error-boundary';
import { SharePageAnalytics } from '@/components/share/share-page-analytics';
import { OverlappingCircles } from '@/components/landing/overlapping-circles';
import { DeadShareLinkState } from '@/components/sploot/state-surface';

interface PublicMemePageProps {
  params: Promise<{ id: string }>;
}

const deadMemeMetadata: Metadata = {
  title: 'dead meme link | sploot',
  description: 'A Sploot share URL no longer points at a saved meme.',
};

export async function generateMetadata({ params }: PublicMemePageProps): Promise<Metadata> {
  const { id } = (await params) ?? {};

  if (!id) {
    return deadMemeMetadata;
  }

  if (!prisma) {
    return deadMemeMetadata;
  }

  const asset = await prisma.asset.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, blobUrl: true, mime: true, width: true, height: true, createdAt: true, size: true },
  });

  if (!asset) {
    return deadMemeMetadata;
  }

  // Compelling brand-attributed copy
  const title = 'From Sploot - Your personal meme library';
  const description = 'Discover and curate your meme collection with lightning-fast semantic search. Save, organize, and share memes that matter.';

  // Construct canonical URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://sploot.vercel.app';
  const canonicalUrl = `${baseUrl}/m/${id}`;

  // Schema.org structured data for SEO
  const structuredData = {
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
    description: 'Shared meme from Sploot - Your personal meme library',
  };

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Sploot',
      type: 'website',
      images: [
        {
          url: asset.blobUrl,
          width: asset.width || 1200,
          height: asset.height || 630,
          alt: 'Shared meme from Sploot',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [asset.blobUrl],
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
    where: { id, deletedAt: null },
    select: { id: true, blobUrl: true, mime: true, width: true, height: true, size: true },
  });

  if (!asset) {
    return <DeadShareLinkState kind="meme" />;
  }

  return (
    <>
      <SharePageAnalytics assetId={id} />
      <SharePageLayout
        logo={
          <div className="flex items-center gap-2">
            <OverlappingCircles className="w-8 h-8" strokeWidth={2} />
            <span className="text-white font-medium text-sm sm:text-base">sploot</span>
          </div>
        }
        cta={<SharePageCTA assetId={id} />}
        image={
          <SharePageErrorBoundary>
            <div className="touch-pinch-zoom">
              <Image
                src={asset.blobUrl}
                alt="Shared meme from Sploot"
                width={asset.width || 1200}
                height={asset.height || 630}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1200px"
                className="max-w-full max-h-[85vh] sm:max-h-[90vh] object-contain select-none"
                priority
                quality={90}
                draggable={false}
              />
            </div>
          </SharePageErrorBoundary>
        }
        metadata={
          <SharePageMetadata
            size={asset.size}
            width={asset.width || undefined}
            height={asset.height || undefined}
            mime={asset.mime}
          />
        }
      />
    </>
  );
}

import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { SharePageLayout } from '@/components/share/share-page-layout';
import { SharePageCTA } from '@/components/share/share-page-cta';
import { SharePageMetadata } from '@/components/share/share-page-metadata';
import { OverlappingCircles } from '@/components/landing/overlapping-circles';

interface PublicMemePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PublicMemePageProps): Promise<Metadata> {
  const { id } = await params;

  if (!prisma) {
    return { title: 'Meme not found' };
  }

  const asset = await prisma.asset.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, blobUrl: true, mime: true, width: true, height: true, createdAt: true, size: true },
  });

  if (!asset) {
    return { title: 'Meme not found' };
  }

  // Compelling brand-attributed copy
  const title = 'From Sploot - Your personal meme library';
  const description = 'Discover and curate your meme collection with lightning-fast semantic search. Save, organize, and share memes that matter.';

  // Construct canonical URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://sploot.vercel.app';
  const canonicalUrl = `${baseUrl}/m/${id}`;

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
  };
}

export default async function PublicMemePage({ params }: PublicMemePageProps) {
  const { id } = await params;

  if (!prisma) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <h1 className="text-white text-2xl mb-4">Meme not found</h1>
        <Link href="/" className="text-gray-500 hover:text-gray-400">
          Go to Sploot
        </Link>
      </div>
    );
  }

  const asset = await prisma.asset.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, blobUrl: true, mime: true, width: true, height: true, size: true },
  });

  if (!asset) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <h1 className="text-white text-2xl mb-4">Meme not found</h1>
        <Link href="/" className="text-gray-500 hover:text-gray-400">
          Go to Sploot
        </Link>
      </div>
    );
  }

  return (
    <SharePageLayout
      logo={
        <div className="flex items-center gap-2">
          <OverlappingCircles className="w-8 h-8" strokeWidth={2} />
          <span className="text-white font-medium text-sm sm:text-base">Sploot</span>
        </div>
      }
      cta={<SharePageCTA assetId={id} />}
      image={
        <Image
          src={asset.blobUrl}
          alt="Shared meme from Sploot"
          width={asset.width || 1200}
          height={asset.height || 630}
          className="max-w-full max-h-[85vh] sm:max-h-[90vh] object-contain"
          priority
        />
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
  );
}

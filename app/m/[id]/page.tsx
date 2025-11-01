import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@/lib/db';

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
    select: { id: true, blobUrl: true, mime: true, width: true, height: true },
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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <Image
        src={asset.blobUrl}
        alt="Shared meme"
        width={asset.width || 1200}
        height={asset.height || 630}
        className="max-w-full max-h-[90vh] object-contain"
        priority
      />
      <footer className="mt-8 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-400">
          Shared via Sploot
        </Link>
      </footer>
    </div>
  );
}

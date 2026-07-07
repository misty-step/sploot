import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DeadShareLinkState } from '@/components/sploot/state-surface';
import { buildShareRedirectPath, type ShareSearchParams } from '@/lib/share-links';
import { resolveShareSlug } from '@/lib/slug-cache';

interface ShareSlugPageProps {
  params: Promise<{ slug?: string }>;
  searchParams: Promise<ShareSearchParams>;
}

export const metadata: Metadata = {
  title: 'dead share link | sploot',
  description: 'A Sploot share link no longer points at a saved meme.',
};

export default async function ShareSlugPage({ params, searchParams }: ShareSlugPageProps) {
  const { slug } = (await params) ?? {};

  if (slug) {
    const assetId = await resolveShareSlug(slug);

    if (assetId) {
      redirect(buildShareRedirectPath(assetId, await searchParams));
    }
  }

  return <DeadShareLinkState kind="slug" />;
}

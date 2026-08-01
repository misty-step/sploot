import { redirect, notFound } from 'next/navigation'
import { resolveShareSlug } from '@/lib/slug-cache'

interface SharedSlugPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Short share link (/s/<slug>) — resolves to the canonical /m/<id> page, or
 * falls through to the app's designed 404 (app/not-found.tsx) when the slug
 * is dead. Was previously a bare route handler returning plain-text "Not
 * found"; a share link opened by a human deserves the same voice as every
 * other terminal state.
 */
export default async function SharedSlugPage({ params, searchParams }: SharedSlugPageProps) {
  const { slug } = await params

  if (!slug) {
    notFound()
  }

  const assetId = await resolveShareSlug(slug)

  if (!assetId) {
    notFound()
  }

  const query = await searchParams
  const preserved = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => preserved.append(key, entry))
    } else if (value !== undefined) {
      preserved.set(key, value)
    }
  }
  const qs = preserved.toString()

  redirect(`/m/${assetId}${qs ? `?${qs}` : ''}`)
}

import { NextResponse } from 'next/server'
import { resolveShareSlug } from '@/lib/slug-cache'

export async function GET(
  request: Request,
  { params }: { params: Promise<Record<string, string>> }
) {
  const record = await params
  const slug = record?.slug

  if (!slug) {
    return new NextResponse('Not found', { status: 404 })
  }

  const assetId = await resolveShareSlug(slug)
  if (assetId) {
    const canonicalUrl = new URL(`/m/${assetId}`, request.url)
    canonicalUrl.search = new URL(request.url).search // Preserve query params
    return NextResponse.redirect(canonicalUrl, 307)
  }

  return new NextResponse('Not found', { status: 404 })
}

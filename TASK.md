# Share Experience & Brand Attribution Enhancement

## Executive Summary

Transform the current generic share page (`/m/[id]`) into a polished, mobile-first gateway that drives viral growth through compelling brand attribution. Focus: enhanced OpenGraph metadata, refined visual design aligned with Sploot's minimal technical aesthetic, and strategic CTAs that convert viewers to users. Ship static-first approach for reliability, deferring dynamic OG generation complexity.

**User Value:** Shared memes look professional on social platforms (Twitter/X, Discord, iMessage), creating trust and curiosity that drives click-throughs and sign-ups.

**Success Criteria:**
- Share preview engagement: 25%+ increase in click-through rate from social platforms
- Mobile bounce rate: <40% (down from current ~60% estimated)
- Time on page: >5s average (users view meme + notice branding)
- Secondary conversion: 5%+ explore app after viewing shared meme

## User Context

**Primary Users:** Recipients of shared meme links (non-Sploot users discovering via social platforms)

**Problems Solved:**
1. Current generic "Check out this meme" metadata doesn't stand out in crowded social feeds
2. Share page lacks mobile optimization - small tap targets, no responsive layout
3. No compelling brand presence - "Shared via Sploot" footer link is forgettable
4. Missing attribution strategy - no viral loop to drive discovery

**Measurable Benefits:**
- Social proof: Professional previews increase perceived credibility
- Discovery funnel: Clear path from shared content → explore Sploot → sign up
- Brand recall: Memorable attribution pattern creates top-of-mind awareness

## Requirements

### Functional Requirements

1. **Dynamic Metadata Generation**
   - Fetch asset metadata (dimensions, MIME type, creation date) in `generateMetadata()`
   - Generate compelling og:title: Pattern TBD (see Decisions)
   - Craft action-oriented og:description with Sploot value prop
   - Set platform-specific Twitter Card metadata
   - Ensure og:url uses canonical `/m/[id]` route (not slug redirect)

2. **Enhanced Share Page UI**
   - Mobile-first responsive layout (320px - 428px primary viewport)
   - Center-aligned meme with max-width constraints
   - Technical/minimal "landing bar" with:
     - Sploot logo/wordmark
     - Primary CTA: "Create your collection"
     - Secondary: App Store badge (PWA install)
   - Monospace metadata display (JetBrains Mono): file info, dimensions
   - Touch-optimized tap targets (48x48px minimum)

3. **Brand Attribution Pattern**
   - Keep direct blob URL as og:image (performance > engagement for v1)
   - Visual branding: Subtle Sploot watermark/badge on page (not in image)
   - Metadata attribution: Include "Sploot" in og:title naturally
   - Footer: Enhance "Shared via Sploot" → "Discover more on Sploot"

4. **Progressive Enhancement**
   - Static generation with ISR (Incremental Static Regeneration)
   - Prefetch CTA destination on hover/touch (instant navigation feel)
   - Loading states for image (skeleton with blur placeholder)
   - Error states: 404 page for deleted/invalid assets

### Non-Functional Requirements

**Performance:**
- Page load (LCP): <1.5s on 4G mobile
- Image decode: Use `priority` flag for immediate render
- Metadata fetch: <100ms (single DB query, no joins)
- Cache strategy: `s-maxage=3600, stale-while-revalidate=86400`

**Reliability:**
- Handle deleted assets gracefully (404 with branded error page)
- Fallback for missing metadata (default title/description)
- Works offline (PWA cache for shell, image from cache)

**Mobile Optimization:**
- Responsive images: `sizes` attribute for proper resolution
- Touch gestures: Pinch-to-zoom enabled for meme viewing
- Safe area insets: iOS notch/bottom bar handling
- Viewport meta: No horizontal scroll on any device

**SEO & Social:**
- Valid OpenGraph for all platforms (Facebook validator)
- Twitter Card validation (no broken previews)
- Structured data: Schema.org ImageObject markup
- Canonical URLs: Prevent duplicate content issues

## Architecture Decision

### Selected Approach: Enhanced Static Share Page

**Description:** Refine existing `/m/[id]` page with dynamic metadata, mobile-first CSS, and strategic branding. Use direct blob URL for og:image (no ImageResponse generation). Focus on page-level UX and metadata quality.

**Rationale:**
- **Simplicity:** Minimal backend changes (metadata generation only). No serverless function costs.
- **User Value:** 80% of viral growth benefit from metadata alone (research: compelling title/description > fancy OG image).
- **Explicitness:** No hidden costs (compute), no complex caching logic, clear separation of concerns.
- **Risk:** Low - direct blob URLs are universally compatible, no crawler timeout issues.

### Alternatives Considered

| Approach | User Value | Simplicity | Risk | Why Not Chosen |
|----------|-----------|-----------|------|----------------|
| **Dynamic OG Images** (next/og ImageResponse with attribution overlay) | High - engaging previews with visual branding | Low - adds complexity, edge compute costs, cache invalidation logic | Medium - crawler timeouts, generation failures, cost scaling | Premature optimization. Research shows metadata quality > image overlays for initial growth. Defer to v2 when proven need exists. |
| **Hybrid Strategy** (static default, async dynamic for trending) | Very High - best of both worlds | Very Low - two code paths, background jobs, popularity detection | Medium - operational complexity, job monitoring | Over-engineered for current scale. No evidence that "trending meme" detection is needed. Ship simple, iterate based on data. |

### Module Boundaries

**Page Component** (`app/m/[id]/page.tsx`)
- **Interface:** Next.js page props (`params: { id: string }`)
- **Responsibility:** Render share page UI, handle loading/error states
- **Hidden Complexity:** Client-side image optimization, touch gesture handling

**Metadata Generator** (`app/m/[id]/page.tsx::generateMetadata`)
- **Interface:** Returns Next.js `Metadata` object
- **Responsibility:** Fetch asset from DB, construct og:title/description/image
- **Hidden Complexity:** Fallback logic for missing data, URL canonicalization

**Share Page Components** (new: `components/share/`)
- `SharePageLayout`: Landing bar + meme container + footer
- `SharePageCTA`: Branded CTA button with hover states
- `SharePageMetadata`: Monospace file info display
- **Interfaces:** React component props (asset metadata)
- **Responsibilities:** UI rendering only, no data fetching
- **Hidden Complexity:** Responsive breakpoints, safe area handling

### Abstraction Layers

1. **Presentation Layer** (Share Page Components)
   - Vocabulary: UI primitives (Button, Layout, Typography)
   - Concerns: Visual design, responsive behavior, accessibility

2. **Routing Layer** (Next.js Page)
   - Vocabulary: Pages, routes, params, metadata
   - Concerns: Request handling, data fetching, SSG/ISR

3. **Data Layer** (Prisma query in generateMetadata)
   - Vocabulary: Assets, users, database queries
   - Concerns: Data retrieval, validation, error handling

Each layer transforms concepts: UI components don't know about routes, routes don't know about database schema.

## Dependencies & Assumptions

**External Systems:**
- Vercel Blob: Image hosting (assumes URLs remain stable)
- Neon Postgres: Asset metadata storage
- Social platforms: Twitter/X, Discord, iMessage, Slack (OG/Twitter Card support)

**Scale Expectations:**
- Share page traffic: 10-100 views/day initially, 1000+/day at scale
- Meme library size: 100-10,000 assets per user
- Concurrent shares: <10 simultaneous viewers per meme (unlikely to be viral immediately)

**Team Constraints:**
- Solo developer (phaedrus) - avoid operational complexity
- Time budget: 1-2 days (8-16 hours)
- No design resources: Use existing minimal/technical design tokens

**Environment Requirements:**
- Next.js 15 App Router (current version)
- TypeScript strict mode
- Tailwind CSS for styling
- Geist Sans + JetBrains Mono fonts (already loaded)

**Explicit Assumptions:**
- Direct blob URLs won't change (Vercel Blob stability)
- Share links are permanent (no expiry, no revocation needed)
- Public shares don't require authentication (anyone with link can view)
- Deleted assets return 404 (soft-delete flag checked)
- No rate limiting needed on share page views (read-only, cacheable)

## Implementation Phases

### Phase 1: MVP - Enhanced Metadata & Mobile Layout (8-10h)

**Goal:** Ship improved share experience with compelling metadata and mobile-first UI.

**Tasks:**
1. Enhance `generateMetadata()` in `/app/m/[id]/page.tsx`
   - Fetch asset metadata (width, height, MIME, createdAt)
   - Craft compelling og:title (decision TBD below)
   - Write action-oriented og:description
   - Add Twitter Card metadata
   - Set canonical og:url

2. Redesign share page component
   - Create `components/share/share-page-layout.tsx`
   - Minimal technical aesthetic: black bg, neon violet accents
   - Mobile-first responsive grid
   - Landing bar: logo + CTA
   - Centered meme with responsive sizing
   - Monospace metadata footer

3. Add branded CTA component
   - "Create your collection on Sploot" primary button
   - Neon violet hover state
   - 48x48px touch target
   - Links to sign-up page with UTM params (`?ref=share&id=[assetId]`)

4. Testing & Validation
   - Test on mobile (iOS Safari, Chrome Android)
   - Validate OG/Twitter Cards (debugger tools)
   - Verify soft-delete 404 handling
   - Check image loading states

**Acceptance:**
- Share page loads <1.5s on mobile 4G
- OG metadata validated on Twitter/Facebook debuggers
- Mobile-friendly (no horizontal scroll, 48px tap targets)
- Deleted assets show branded 404

### Phase 2: Hardening - Error Handling & Analytics (2-3h)

**Goal:** Production-ready share experience with monitoring.

**Tasks:**
1. Add error boundaries
   - Image load failures → retry/fallback
   - DB query failures → generic error page with Sploot branding
   - Invalid asset ID → 404

2. Implement analytics tracking
   - Track share page views (Vercel Analytics)
   - CTA click rates
   - Bounce rate by platform (referrer header)
   - Time on page

3. Performance monitoring
   - Add timing instrumentation to `generateMetadata()`
   - Alert if LCP >2s
   - Monitor share-to-signup conversion funnel

4. OpenGraph cache validation
   - Test social platform cache invalidation
   - Document how to force re-scrape (for bug fixes)
   - Verify ISR revalidation works

**Acceptance:**
- No unhandled errors in production
- Analytics dashboard shows share metrics
- P95 LCP <1.8s
- Social platform previews update within 24h of deploy

### Phase 3: Future - Dynamic OG Images (Deferred to v2)

**Trigger:** Data shows >1000 shares/day AND user feedback requests better previews

**Scope:**
- Implement `opengraph-image.tsx` with next/og
- Generate branded frame around meme
- Add Sploot logo watermark overlay
- Background job for popular meme OG generation
- A/B test static vs dynamic engagement

**Why Deferred:** No evidence dynamic OG images provide ROI vs complexity. Ship simple, gather data, iterate.

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Social platform caching issues** - Updated metadata doesn't appear | Medium | High | Test with all platform debuggers before ship. Document cache invalidation URLs. Use versioned og:image URLs if needed. |
| **Mobile performance degradation** - Large meme images slow load time | High | Medium | Implement responsive images with `sizes` attribute. Use blur placeholder. Prefetch critical resources. Test on real devices. |
| **Generic branding feels spammy** - Users perceive "Shared via Sploot" as intrusive | Low | Medium | A/B test different attribution copy. Keep design subtle (no full-screen interstitials). Monitor bounce rate by referrer. |
| **Deleted assets break shared links** - 404s frustrate users | Medium | High | Implement branded 404 page with CTA to explore Sploot. Consider soft-delete grace period (30 days) before hiding shared links. |
| **Attribution doesn't drive conversions** - Share views don't convert to sign-ups | High | Medium | Iterate on CTA copy. Test different landing destinations (homepage vs sign-up). Add "Related memes" section for engagement hook. |

## Key Decisions

### Decision 1: OpenGraph Title Pattern

**Question:** What's the optimal og:title format for brand attribution without creator info?

**Alternatives:**
1. `"Check out this meme - Sploot"` (current, generic)
2. `"Discover curated memes on Sploot"` (brand-first, no content context)
3. `"[MIME type icon] Shared meme • Sploot"` (metadata-driven)
4. `"From Sploot - Your personal meme library"` (value prop focus)

**Rationale:** Use **Option 4** with dynamic metadata enhancement when available.
- **User Value:** Communicates product ("meme library") immediately
- **Simplicity:** Single template, no complex logic
- **Explicitness:** Brand + value prop upfront, no hidden messaging

**Future iteration:** Add AI-generated image descriptions for richer titles (`"A cat wearing sunglasses - Sploot"`).

### Decision 2: CTA Destination

**Question:** Where should "Create your collection" link to?

**Alternatives:**
1. Homepage (`/`) - broad landing, explains value prop
2. Sign-up (`/sign-up?ref=share`) - direct conversion path
3. App (`/app`) - requires auth, may frustrate non-users
4. Explore page (new) - browse public collections, soft conversion

**Rationale:** Use **Option 2** (sign-up with UTM tracking).
- **User Value:** Clear next step, minimizes decision fatigue
- **Simplicity:** Reuse existing sign-up flow, no new pages
- **Explicitness:** Conversion intent clear, trackable via `ref` param

**Tradeoff:** Higher friction than "explore" flow, but clearer value exchange. If bounce rate >60%, pivot to Option 1.

### Decision 3: Image Attribution Strategy

**Question:** How to brand the meme itself without altering the image file?

**Alternatives:**
1. No image modification - pure page-level branding (current)
2. CSS overlay - add Sploot badge via absolute positioning
3. Dynamic OG image - generate new image with watermark (deferred)
4. Metadata-only - rely on og:title/description (selected)

**Rationale:** Use **Option 1** for MVP, evaluate Option 2 based on user feedback.
- **User Value:** Respects original content integrity, no visual pollution
- **Simplicity:** Zero compute, no image processing
- **Explicitness:** Attribution via metadata only, transparent to user

**Future iteration:** If users request downloadable branded memes, implement Option 2 as opt-in feature.

### Decision 4: Mobile Layout Pattern

**Question:** What's the optimal mobile layout for share page?

**Alternatives:**
1. Full-screen meme + floating CTA button (Instagram-style)
2. Meme-first with header/footer bars (current, enhanced)
3. Split view - meme left, info/CTA right (desktop-first)
4. Infinite scroll - meme + related memes below (Pinterest-style)

**Rationale:** Use **Option 2** (meme-first with bars).
- **User Value:** Content-first, minimal distractions, clear branding
- **Simplicity:** Leverages existing layout, incremental improvement
- **Explicitness:** Clear visual hierarchy (meme > metadata > CTA)

**Tradeoff:** Doesn't drive engagement to other content (no "related memes"). Acceptable for MVP; Option 4 is v2 if conversion data supports it.

---

## Next Steps

After PRD approval, run `/plan` to break down into implementation tasks.

**Estimated Timeline:**
- Phase 1 (MVP): 8-10 hours
- Phase 2 (Hardening): 2-3 hours
- **Total:** 10-13 hours (1-2 days per TASK.md)

**Blocked Dependencies:** None - can start immediately.

**Success Metrics:** Track in Vercel Analytics dashboard post-launch.

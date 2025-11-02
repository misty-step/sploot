# TODO: Share Experience & Brand Attribution Enhancement

## Context

**Approach:** Enhanced Static Share Page - refine `/m/[id]/page.tsx` with dynamic metadata, mobile-first UI, Bloomberg Terminal aesthetic
**Key Files:**
- `app/m/[id]/page.tsx` (existing share page - 100 lines)
- `components/share/` (new directory for share-specific components)
**Patterns:**
- Metadata: Follow `app/m/[id]/page.tsx:10-50` (existing generateMetadata pattern)
- Components: Follow `components/ui/button.tsx` (CVA variants pattern)
- Typography: Use `font-jetbrains-mono` for metadata (see `app/layout.tsx:19-22`)
- Testing: Follow `__tests__/components/chrome/navbar.test.tsx` (component test pattern)

**Design System:**
- Colors: Pure black bg (`bg-black`), neon violet accents (`bg-primary`, `text-primary`)
- Fonts: Geist Sans (UI), JetBrains Mono (metadata/technical info)
- Spacing: 4px base unit (Tailwind defaults)
- Logo: `OverlappingCircles` component from `components/landing/overlapping-circles.tsx`

**Success Metrics:**
- LCP <1.5s on mobile
- OG/Twitter Card validation passes
- No horizontal scroll on 320px viewport
- 48px minimum touch targets

---

## Phase 1: Enhanced Metadata & Core Components

- [x] **Enhance OpenGraph Metadata Generation**

Improve `generateMetadata()` to create compelling social previews with Sploot brand attribution.

```
Files: app/m/[id]/page.tsx:10-50
Approach: Extend existing metadata function. Keep direct blob URL for og:image (no ImageResponse). Add compelling copy + canonical URLs.
Success:
  - og:title = "From Sploot - Your personal meme library"
  - og:description includes value prop (semantic search, curated collection)
  - og:url uses canonical /m/[id] route (not slug redirect)
  - Twitter Card metadata complete (summary_large_image)
  - Fallback for missing asset data (generic title/description)
Test: Unit test for metadata generation with mock Prisma queries
  - Test with valid asset → returns full metadata
  - Test with missing asset → returns fallback metadata
  - Test with null dimensions → uses default 1200x630
  - Verify canonical URL construction
Module: Metadata Generator - hides DB query complexity, exposes Metadata object
Time: 45min
```

**Implementation notes:**
- Keep existing error handling (prisma check, asset null check)
- Use NEXT_PUBLIC_BASE_URL env var for og:url (fallback to relative path)
- Add createdAt, size to select clause for future metadata display
- Consider adding structured data (Schema.org ImageObject) in future iteration

---

- [x] **Create SharePageLayout Component**

Build mobile-first layout container with Bloomberg Terminal aesthetic.

```
Files: components/share/share-page-layout.tsx (new)
Approach: Composition pattern - accepts logo, meme, metadata, cta as slots. Mobile-first with safe area handling.
Success:
  - Renders full-height black background
  - Three sections: header (logo/CTA bar), main (meme), footer (metadata)
  - Responsive: stacked on mobile (<640px), optimized spacing on desktop
  - Safe area insets for iOS notch (env(safe-area-inset-*))
  - No horizontal scroll on 320px-428px viewports
Test: Component test with @testing-library/react
  - Renders all children slots
  - Applies correct layout classes
  - Responsive breakpoints work (mock window.innerWidth)
  - Accessibility: semantic HTML (header, main, footer)
Module: Layout Component - hides responsive logic, exposes slot-based interface
Time: 30min
```

**Interface sketch:**
```tsx
interface SharePageLayoutProps {
  logo: React.ReactNode;
  cta: React.ReactNode;
  image: React.ReactNode;
  metadata?: React.ReactNode;
}
```

---

- [x] **Create SharePageCTA Component**

Build branded CTA button with neon violet hover states and UTM tracking.

```
Files: components/share/share-page-cta.tsx (new)
Approach: Extend Button component with custom variant. Add UTM params to sign-up link.
Success:
  - "Create your collection on Sploot" text
  - Neon violet bg (bg-primary), white text
  - Hover: subtle glow effect (shadow-lg shadow-primary/20)
  - Links to /sign-up?ref=share&id=[assetId]
  - 48x48px minimum touch target (h-12 on mobile, h-10 on desktop)
  - Accessible: aria-label, keyboard focus visible
Test: Component test
  - Renders correct text and href
  - UTM params constructed correctly
  - Touch target meets 48px minimum
  - Hover states apply
Module: CTA Button - hides UTM logic, exposes simple assetId prop interface
Time: 20min
```

**Props:**
```tsx
interface SharePageCTAProps {
  assetId: string;
  className?: string;
}
```

---

- [x] **Create SharePageMetadata Component**

Display technical file info in monospace (Bloomberg Terminal style).

```
Files: components/share/share-page-metadata.tsx (new)
Approach: Use JetBrains Mono font, terminal color scheme (gray-400 labels, gray-300 values).
Success:
  - Shows: file size (human-readable), dimensions (WxH), MIME type
  - Monospace font (font-jetbrains-mono)
  - Subtle gray on black (text-gray-400)
  - Compact layout: single line on desktop, stacked on mobile
  - Handles missing data gracefully (shows "Unknown" or hides field)
Test: Component test
  - Formats file size correctly (bytes → KB/MB)
  - Displays dimensions with × separator
  - Shows MIME type without "image/" prefix
  - Handles null/undefined values
Module: Metadata Display - hides formatting logic, exposes asset metadata props
Time: 25min
```

**Props:**
```tsx
interface SharePageMetadataProps {
  size?: number;
  width?: number;
  height?: number;
  mime?: string;
}
```

**Helper function:**
```tsx
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
```

---

- [x] **Refactor Share Page to Use New Components**

Integrate new components into `/m/[id]/page.tsx`, replacing minimal UI.

```
Files: app/m/[id]/page.tsx:52-99
Approach: Replace existing JSX with new components. Keep data fetching logic unchanged.
Success:
  - Uses SharePageLayout with proper slots
  - Logo: OverlappingCircles component
  - CTA: SharePageCTA with assetId
  - Image: Keep existing Next Image component with priority flag
  - Metadata: SharePageMetadata with asset data
  - Error states: Keep existing 404 handling
  - Maintains server component pattern (no "use client")
Test: Manual testing + visual regression
  - Page renders on http://localhost:3000/m/[valid-id]
  - 404 page shows for invalid/deleted assets
  - Mobile responsive (test on 375px viewport)
  - Image loads with priority (no layout shift)
Module: Page Component - orchestrates layout, delegates to child components
Time: 35min
```

**Validation checklist:**
  * No console errors in browser
  * No hydration mismatches
  * Image loads before content (priority flag works)
  * CTA link includes UTM params
  * Metadata displays correctly formatted values

---

## Phase 2: Polish & Optimization

- [x] **Add Responsive Image Optimization**

Implement proper `sizes` attribute and blur placeholder for better mobile performance.

```
Files: app/m/[id]/page.tsx:84-91 (Image component)
Approach: Add sizes attribute for responsive images, use blur placeholder from Vercel Blob.
Success:
  - sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1200px"
  - Blur placeholder with blurDataURL (if available)
  - Maintains aspect ratio with object-contain
  - Max height constraint: max-h-[85vh] on mobile, max-h-[90vh] on desktop
  - Alt text improved: "Shared meme from Sploot"
Test: Manual testing on real devices
  - iPhone SE (320px) loads appropriate image size
  - Desktop loads full resolution
  - No CLS (Cumulative Layout Shift)
  - Lighthouse performance score >90
Module: Image Component Config - hides size optimization, exposes standard Next Image API
Time: 20min
```

---

- [x] **Implement Error Boundaries**

Add error boundary for graceful image load failure handling.

```
Files: components/share/share-page-error-boundary.tsx (new)
Approach: React error boundary pattern with branded fallback UI.
Success:
  - Catches image load errors
  - Shows branded error message: "Couldn't load this meme"
  - CTA to homepage: "Explore Sploot"
  - Logs error to console (structured format)
  - Maintains Bloomberg Terminal aesthetic (black bg, terminal colors)
Test: Component test with error simulation
  - Boundary catches errors from children
  - Fallback UI renders correctly
  - Error logged to console
  - Reset functionality works
Module: Error Boundary - hides error handling complexity, exposes standard React boundary API
Time: 25min
```

---

- [x] **Add Schema.org Structured Data**

Implement ImageObject structured data for SEO.

```
Files: app/m/[id]/page.tsx:26-49 (metadata object)
Approach: Add structured data script to metadata.other field.
Success:
  - Schema.org/ImageObject JSON-LD
  - Includes: contentUrl (blobUrl), width, height, datePublished, author (Sploot)
  - Embedded in <script type="application/ld+json">
  - Validates with Google Rich Results Test
Test: Validation with schema.org validator
  - No errors in structured data
  - All required fields present
  - Rich results preview shows correctly
Module: Metadata Enhancement - extends existing generateMetadata
Time: 15min
```

**JSON-LD structure:**
```json
{
  "@context": "https://schema.org",
  "@type": "ImageObject",
  "contentUrl": "[blobUrl]",
  "width": "[width]",
  "height": "[height]",
  "datePublished": "[createdAt]",
  "author": {
    "@type": "Organization",
    "name": "Sploot"
  }
}
```

---

- [x] **Optimize Mobile Touch Experience**

Add touch-friendly enhancements: pinch-to-zoom, tap feedback, safe area handling.

```
Files: app/m/[id]/page.tsx, components/share/share-page-cta.tsx
Approach: Add touch-specific CSS and meta tags.
Success:
  - Pinch-to-zoom enabled on image (touch-action: pinch-zoom)
  - CTA has active state (scale-95 on tap)
  - Safe area insets respected (padding: env(safe-area-inset-*))
  - No 300ms tap delay (modern Next.js handles this)
  - Haptic feedback on CTA tap (if supported via CSS)
Test: Manual testing on iOS Safari, Chrome Android
  - Image pinch-to-zoom works
  - CTA tap feels responsive (<100ms feedback)
  - Content respects notch/bottom bar on iPhone
  - No accidental double-tap zoom on buttons
Module: Touch Optimization - platform-specific enhancements
Time: 20min
```

---

## Phase 3: Testing & Validation

- [ ] **Write Component Unit Tests**

Create comprehensive tests for all new share components.

```
Files:
  - __tests__/components/share/share-page-layout.test.tsx (new)
  - __tests__/components/share/share-page-cta.test.tsx (new)
  - __tests__/components/share/share-page-metadata.test.tsx (new)
Approach: Follow existing test pattern from __tests__/components/chrome/navbar.test.tsx
Success:
  - All components have >80% code coverage
  - Tests check rendering, props, responsive behavior
  - Accessibility tested (ARIA labels, semantic HTML)
  - Edge cases covered (null props, missing data)
Test: pnpm test components/share
  - All tests pass
  - Coverage report shows >80% for new components
Module: Test Suite - validates component contracts
Time: 45min
```

**Test structure:**
```tsx
describe('SharePageLayout', () => {
  it('renders all slot children', () => { /* ... */ });
  it('applies responsive layout classes', () => { /* ... */ });
  it('handles safe area insets on mobile', () => { /* ... */ });
});
```

---

- [ ] **Validate OpenGraph Metadata**

Test social platform previews with debugger tools.

```
Files: N/A (external validation)
Approach: Deploy to preview environment, test with platform debuggers.
Success:
  - Twitter Card Validator: no errors, image displays correctly
  - Facebook Sharing Debugger: no errors, preview looks professional
  - LinkedIn Post Inspector: image and text render correctly
  - iMessage: rich link preview shows image + title
  - Discord: embed shows image + title + description
Test: Checklist validation
  * Twitter Card Validator (cards-dev.twitter.com)
  * Facebook Debugger (developers.facebook.com/tools/debug)
  * LinkedIn Inspector (linkedin.com/post-inspector)
  * Manual test: paste link in iMessage, Discord, Slack
  * Screenshot previews for documentation
Module: Social Platform Integration Validation
Time: 30min
```

**Validation URLs:**
- Twitter: https://cards-dev.twitter.com/validator
- Facebook: https://developers.facebook.com/tools/debug/
- LinkedIn: https://www.linkedin.com/post-inspector/

---

- [ ] **Performance Testing & Optimization**

Measure and optimize share page performance.

```
Files: N/A (performance tooling)
Approach: Lighthouse CI, WebPageTest, real device testing.
Success:
  - Lighthouse Performance: >90 on mobile
  - LCP (Largest Contentful Paint): <1.5s on 4G
  - CLS (Cumulative Layout Shift): <0.1
  - FID (First Input Delay): <100ms
  - Image decode time: <200ms
  - No render-blocking resources
Test: Multiple tools and environments
  - Lighthouse CI in Chrome DevTools (3G throttled)
  - WebPageTest on real devices (Moto G4, iPhone 8)
  - Vercel Analytics after deploy (P95 metrics)
Module: Performance Validation
Time: 30min
```

**If LCP >1.5s, optimization steps:**
1. Check image optimization (WebP/AVIF format, correct sizes)
2. Verify edge caching (Cache-Control headers)
3. Reduce JavaScript bundle size (code splitting)
4. Use priority hints on critical resources

---

## Phase 4: Documentation & Deploy Prep

- [ ] **Document Social Media Best Practices**

Create guide for force-refreshing social platform caches.

```
Files: docs/SOCIAL_SHARING.md (new)
Approach: Document cache invalidation URLs and best practices.
Success:
  - Cache invalidation URLs for each platform
  - Instructions to force re-scrape after metadata changes
  - Expected preview behavior documented
  - Screenshots of correct previews included
  - Troubleshooting guide (common issues + fixes)
Test: Follow guide to refresh a test URL's cache
  - Instructions are clear and accurate
  - Force refresh works on all platforms
Module: Documentation for future maintenance
Time: 20min
```

**Contents:**
- Cache invalidation URLs (Twitter, Facebook, LinkedIn)
- When to force refresh (metadata changes, OG image updates)
- Expected behavior per platform
- Troubleshooting (missing images, stale data)

---

- [ ] **Add Share Page Analytics Instrumentation**

Track share page views and CTA conversion in Vercel Analytics.

```
Files: app/m/[id]/page.tsx, components/share/share-page-cta.tsx
Approach: Use Vercel Analytics track() function for custom events.
Success:
  - Page view tracked with asset ID
  - CTA click tracked with asset ID + referrer
  - Bounce rate trackable via time-on-page
  - No PII collected (just asset IDs)
  - Works with Vercel Analytics dashboard
Test: Dev tools check + production validation
  - Events appear in Network tab (POST to analytics)
  - Events show in Vercel Analytics dashboard within 1h
  - No errors in console
Module: Analytics Integration - hidden from UI, tracks behavior
Time: 25min
```

**Events to track:**
- `share_page_view` - when page loads
- `share_cta_click` - when CTA clicked
- `share_page_bounce` - if user leaves <5s

---

## Design Iteration Checkpoints

**After Phase 1 (Core Components):**
- Review: Are component boundaries clear? Is composition working well?
- Extract: Any repeated patterns that should be utilities?
- Refactor: Simplify prop interfaces if any components feel coupled

**After Phase 2 (Polish):**
- Review: Performance metrics - are we hitting LCP <1.5s?
- Extract: Image optimization logic reusable elsewhere?
- Refactor: Error handling patterns consistent?

**After Phase 3 (Testing):**
- Review: Test coverage gaps? Any untested edge cases?
- Extract: Test utilities that could be shared?
- Refactor: Component APIs based on testing learnings

---

## Automation Opportunities

**Identified during implementation:**
1. **OG Image Generation (future):** Script to generate dynamic OG images for popular memes (deferred to v2)
2. **Social Preview Screenshots:** Automated screenshot capture for each platform's preview
3. **Performance Regression Testing:** Lighthouse CI in GitHub Actions to catch LCP regressions
4. **Metadata Validation:** Script to validate all share URLs have correct OG metadata

**Current phase automation:**
- Manual testing checklist → Could be E2E test with Playwright (future)
- Social platform validation → Could be automated with headless browser scraping (future)

---

## Success Criteria Summary

**Phase 1 Complete When:**
  * All 5 components implemented and working
  * Share page renders with new layout on localhost
  * Mobile responsive (320px-1024px tested)
  * No TypeScript errors, no console warnings

**Phase 2 Complete When:**
  * Image optimization improves load time measurably
  * Error boundary catches and handles failures
  * Schema.org validation passes
  * Touch experience smooth on real iOS/Android devices

**Phase 3 Complete When:**
  * All component tests passing (pnpm test)
  * Social platform validators show no errors
  * Lighthouse Performance >90 on mobile
  * Real device testing confirms <1.5s LCP

**Phase 4 Complete When:**
  * Documentation complete and accurate
  * Analytics events tracking correctly
  * Ready for production deploy

**Total Estimated Time:** 10-12 hours

**Blocked Dependencies:** None - can start immediately

**Next Step:** Create feature branch `git checkout -b feat/share-experience-enhancement`

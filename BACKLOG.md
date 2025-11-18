# BACKLOG: Landing Page Conversion Optimization

## Future Enhancements

### Visual & Animation Polish

- **Parallax scroll effects on hero**: Subtle logo float on scroll (2-3px movement). Low effort (2h), medium impact. Adds depth without sacrificing performance. Wait until core conversion elements proven effective.

- **Animated number counters**: "Join 1,000+ users" could count up on scroll into view. Low effort (1h), low impact. Nice polish but doesn't drive conversions.

- **Interactive demo**: Replace static GIF with interactive Lottie animation or embedded demo iframe. High effort (8-12h), medium impact. Gives users hands-on feel but adds complexity and load time.

- **Dark mode toggle**: Allow users to preview light theme (even if app is dark-only). Medium effort (4h), low impact. Current pure black is intentional aesthetic choice, light mode would dilute brand.

### Advanced Conversion Tactics

- **Exit intent popup**: Catch users leaving with special offer or demo prompt. Low effort (3h), unknown impact. Could feel spammy, test with A/B after initial launch.

- **Social proof widgets**: Live user count, recent signups ticker, trust badges. Medium effort (6h), medium impact. Requires real usage data first (100+ users).

- **Video testimonials**: Replace text testimonials with short video clips. High effort (production time), high impact if done well. Need real users willing to record first.

- **Pricing comparison table**: Even for free product, compare features vs competitors. Medium effort (4h), medium impact. Useful once market positioning solidifies.

- **Feature tour walkthrough**: Interactive product tour on landing page. High effort (10-15h), medium impact. Better as in-app onboarding after signup.

### Content Experiments

- **Multiple headline variants**: A/B test different value propositions ("Find memes instantly" vs "Never lose a meme again"). Low effort per variant (30min), high learning value. Run after initial traffic baseline established.

- **Long-form benefits copy**: Expand benefit cards with detailed explanations, use cases, screenshots. Medium effort (4h), unknown impact. Could dilute minimalist aesthetic.

- **Case studies section**: Detailed user stories with before/after. High effort (content creation), high impact. Need 3-5 power users first.

- **Press/media mentions**: Add "As seen on" section if featured. Low effort (1h), medium impact. Gated by actually getting press coverage.

### Technical Improvements

- **Page speed optimization**: Implement ISR caching for landing page, preload critical assets, optimize font loading. Medium effort (3-4h), medium impact. Current performance likely sufficient (static page).

- **SEO enhancements**: Add structured data (Organization, WebApplication schemas), optimize meta descriptions, add FAQ schema. Low effort (2h), high long-term impact. Should do after core content finalized.

- **Multi-language support**: Translate landing page to Spanish, French, Japanese. High effort (translation + i18n setup 8-12h), medium impact. Only valuable if targeting international markets.

- **Accessibility audit**: WCAG 2.1 AA compliance full audit, screen reader optimization, motion preferences. Medium effort (4-6h), medium impact (should be done, but not blocking MVP).

## Nice-to-Have Improvements

### Design System Formalization

- **Component library documentation**: Storybook setup for all landing components. High effort (6-8h), low immediate value. Useful for design handoff or team scaling.

- **Design tokens file**: Centralize all colors, spacing, typography in `design-tokens.ts`. Low effort (2h), medium maintainability value. Good for consistency but current approach works.

- **Animation library**: Create reusable animation utilities (fadeInUp, staggerChildren, etc.). Medium effort (3h), medium value. Only needed if animations used across site beyond landing page.

### Analytics & Testing

- **Heatmap tracking**: Install Hotjar or similar to see where users click/scroll. Low effort (setup 1h), high learning value. Useful after 1k+ visitors to identify friction points.

- **A/B testing framework**: Set up proper A/B testing for headlines, CTAs, layouts. Medium effort (5h), high long-term value. Premature without traffic (need 1k+ weekly visitors).

- **Conversion funnel analytics**: Track each section scroll, CTA click, signup completion. Low effort (2h), high value. Should add once basic analytics proven working.

### Content Strategy

- **Blog/changelog integration**: Pull latest blog posts or product updates into landing page. Medium effort (4h), low immediate value. Need content pipeline first.

- **Customer logos**: Display logos of companies/communities using Sploot. Low effort (2h), high impact. Need actual customers first (B2B approach).

- **Integration showcase**: If integrations built (Slack, Notion, etc.), showcase on landing page. Medium effort (3h per integration), high value. Depends on product roadmap.

## Technical Debt Opportunities

### Code Review Feedback (PR #17)

Items deferred from CodeRabbit review for future iterations:

**Accessibility Improvements:**
- **SearchBar aria-label**: Add `aria-label="Clear search history"` to clear history button for screen readers
- **BenefitGrid aria-hidden**: Add `aria-hidden="true"` to decorative icons
- **IntersectionObserver guards**: Add defensive checks and reduced-motion support in LandingFooter (matching ProcessTimeline pattern)

**Component Organization:**
- **Relocate OverlappingCircles**: Move from `@/components/landing/` to `@/components/ui/` or `@/components/branding/` since used in both landing and app navbar
- **Extract Bebas Neue font style**: Create `.heading-display { font-family: var(--font-bebas-neue); }` utility class to avoid inline styles
- **Make ScrollIndicator configurable**: Accept `targetSectionId` prop instead of hardcoding `"section-semantic-search"`
- **FilterChips class deduplication**: Extract shared active/inactive class variants to helper

**Naming Consistency:**
- **Color class rename strategy**: `text-electric-lime` etc. map to cyan/coral/violet - consider gradual migration to semantic names with deprecation notices
- **CSS variable alignment**: `--font-geist-sans` now references DM_Sans - either rename variable or add backward-compatibility comment

**Code Quality:**
- **Hoist breakpointCols constant**: Move Masonry breakpoints in ImageGridSkeleton to module-level to avoid recreation per render
- **Tighten OptimizedImageSkeleton props**: Remove unused `delay` from type or implement stagger support

**Testing:**
- **ProcessTimeline reduced-motion test**: Add test case with `usePrefersReducedMotion` true or `IntersectionObserver` undefined

**SEO:**
- **Hero h1 tag**: Use `<h1>` instead of `<p>` for primary tagline on landing page

### Refactoring Candidates

- **Extract section layout component**: Create `<LandingSection>` wrapper with consistent padding, borders, responsive behavior. Low effort (1h), medium maintainability value. Worth doing if landing page expands to 10+ sections.

- **Centralize animation timings**: Move stagger delays (0.15s, 0.3s, 0.45s) to constants. Low effort (30min), low value. Nice cleanup but not blocking anything.

- **Component composition**: Some components (BenefitGrid, Testimonials) could be more generic (CardGrid with slot content). Medium effort (3h), medium value. Only refactor if pattern reused elsewhere.

### Testing Gaps

- **E2E tests with Playwright**: Full user flow tests (scroll, click FAQ, sign up). Medium effort (4-6h), high confidence value. Useful before major redesigns.

- **Visual regression tests**: Percy or Chromatic integration for screenshot comparison. Medium effort (setup 3h), medium value. Prevents UI regressions but adds CI complexity.

- **Performance budgets**: Lighthouse CI integration, fail if scores drop below thresholds. Low effort (2h), medium value. Good guardrail for future changes.

### Infrastructure

- **Landing page CDN edge caching**: Aggressive caching strategy, separate from app routes. Low effort (1h), low value. Vercel already handles this well by default.

- **Separate landing page repo**: Decouple marketing site from app for faster deploys. High effort (8-12h migration), low value. Adds complexity without clear benefit at current scale.

## Deferred Experiments

### Ideas Worth Testing Later

- **Animated hero video background**: Full-screen video of memes scrolling/searching. High effort (video production + implementation 12h), unknown impact. Could be striking or distracting.

- **Gamification**: "See how fast you can find [specific meme]" challenge widget. High effort (8h), unknown value. Fun but might confuse core message.

- **Meme of the day**: Featured meme that changes daily on landing page. Medium effort (4h), low value. Requires moderation, could alienate some users depending on meme choice.

- **Community gallery**: Public gallery of best user-uploaded memes (with permission). High effort (6-8h + moderation), high potential viral value. Privacy concerns conflict with "private by design" positioning.

## Monitoring & Validation

### Metrics to Track Post-Launch

- **Conversion rate**: Landing page visit → signup (target: 2-5% baseline)
- **Section engagement**: % of users reaching each section (FAQ, testimonials, etc.)
- **CTA performance**: Click-through rate on each CTA button
- **Bounce rate**: % leaving after <10s (target: <70%)
- **Time on page**: Average engagement time (target: 60-90s)
- **Mobile vs desktop**: Conversion rate comparison (mobile often 30-50% lower)

### Questions to Answer

1. **Which sections drive conversions?** Remove/reorder based on engagement data
2. **Is demo animation worth the load time?** Test with/without, measure impact
3. **Do testimonials increase trust?** A/B test with/without social proof section
4. **How many people read FAQ?** If <10% engagement, consider removing/moving
5. **Is the page too long?** Measure scroll depth, identify dropoff points

### Optimization Triggers

- **If bounce rate >80%**: Strengthen hero value prop, reduce initial load time
- **If scroll depth <50%**: Content too long, cut sections or improve initial hook
- **If FAQ engagement <5%**: Move FAQ to separate page or remove entirely
- **If mobile conversion <50% of desktop**: Mobile UX needs specific optimization
- **If time-on-page <30s**: Not engaging enough, add more interactive elements

---

## Notes

**Decision Framework**: Don't implement backlog items until:
1. Core conversion elements tested in production (1 month minimum)
2. Sufficient traffic for statistical significance (500+ weekly visitors)
3. Analytics data shows specific problem to solve
4. Item directly addresses measured drop-off point

**Prioritization**: When selecting from backlog:
1. Quick wins (<2h effort, proven tactics) → Test immediately if metrics stagnate
2. Content experiments → Run once you have established baseline
3. Technical improvements → Add when performance becomes measurable issue
4. New features → Only after core experience validated with real users

**Warning Signs**: Avoid adding backlog items if:
- No clear metric being improved
- "Nice to have" without user feedback requesting it
- Adds complexity without proportional conversion lift
- Dilutes core message or aesthetic
- Hasn't been validated elsewhere in industry

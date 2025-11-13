# TODO: Landing Page Conversion Optimization

## Context

**Objective**: Evolve current minimalist landing page toward high-converting SaaS structure while preserving elegant aesthetic

**Current State**:
- Hero with logo, headline, search demo, single CTA
- 2 feature sections (semantic search, personal library)
- Benefits section with 3 icons
- Minimal footer

**Target State**: Add proven conversion elements:
- Enhanced benefits grid (4 cards with descriptions)
- "How it works" process timeline (3 steps)
- Demo animation in hero
- Social proof (testimonials or usage stats)
- FAQ accordion
- Strengthened final CTA section

**Design Constraints**:
- Maintain pure black background (#000000)
- Keep Geist Sans + JetBrains Mono typography
- Preserve light font weights (300-400)
- Use neon violet (#7C5CFF) sparingly
- 4px spacing system
- Subtle animations (200-300ms)

**Asset Strategy**:
- Demo: Screen recording → optimized GIF
- Icons: Lucide library (maintains consistency)
- Process visuals: Custom SVG matching overlapping circles style
- Social proof: Text-only testimonials or usage stats

---

## Phase 1: Benefits Grid Enhancement

### Core Implementation

- [x] Expand BenefitIcons component into full BenefitGrid
  **file**: `components/landing/benefit-icons.tsx` → rename to `benefit-grid.tsx`
  **changes**:
  - Transform from 3 icons in row to 3-4 cards in responsive grid
  - Add card structure: icon (Lucide) + headline (text-xl) + description (2 lines, text-muted-foreground)
  - Grid: `grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12`
  - Card styling: Minimal border, subtle hover effect, no background
  **content**:
  1. Lock icon: "Private & Secure" / "Your memes stay yours. Zero tracking, zero sharing."
  2. Zap icon: "Lightning Fast" / "Search thousands of memes in milliseconds with AI-powered semantic search."
  3. Globe icon: "Works Everywhere" / "Install as PWA. Works offline. Always accessible on any device."
  **success criteria**: Cards render in responsive grid, hover states work, typography hierarchy clear (headline > description), maintains 4px spacing system

- [x] Update landing page to use BenefitGrid
  **file**: `app/page.tsx`
  **line**: 134 (current BenefitIcons import)
  **changes**:
  - Replace `<BenefitIcons />` with `<BenefitGrid />`
  - Update import statement
  - Adjust surrounding spacing if needed (maintain section padding)
  **success criteria**: Benefits section renders correctly, responsive behavior works mobile→desktop, no layout shifts

- [x] Add unit tests for BenefitGrid component
  **file**: `__tests__/components/landing/benefit-grid.test.tsx` (new)
  **test cases**:
  1. Renders 3 benefit cards with correct content
  2. Icons render from lucide-react
  3. Responsive grid classes applied
  4. Hover states trigger (test className changes)
  **success criteria**: All tests pass, coverage >80%

---

## Phase 2: "How It Works" Section

### Visual Assets

- [x] Design 3 custom SVG illustrations for process steps
  **files**: Create in `components/landing/process-icons/`
  - `upload-icon.tsx`: Upward arrow + document (matches overlapping circles stroke style)
  - `analyze-icon.tsx`: Circle with nodes/connections (AI processing visual)
  - `search-icon.tsx`: Magnifying glass + results grid
  **style constraints**:
  - Stroke width: 2.5px (matches existing AnimatedCircles)
  - Color: `className="stroke-primary"`
  - Size: 120x120px viewBox
  - Minimal, geometric style matching logo
  **success criteria**: 3 SVG components export, render without errors, style matches overlapping circles aesthetic

### Component Implementation

- [x] Create ProcessTimeline component
  **file**: `components/landing/process-timeline.tsx` (new)
  **structure**:
  - Horizontal layout on desktop (flex-row)
  - Vertical layout on mobile (flex-col)
  - 3 steps with: Number badge → Icon → Headline → Description
  **content**:
  1. "Upload" / "Drag and drop your memes. We'll handle the rest."
  2. "AI Analyzes" / "CLIP embeddings capture semantic meaning of every image."
  3. "Search & Find" / "Type what you remember, get what you need instantly."
  **styling**:
  - Step numbers: Circular badge, monospace font, text-sm
  - Icons: 120x120px, centered above text on mobile
  - Headlines: text-2xl md:text-3xl, font-light
  - Descriptions: text-lg, text-muted-foreground
  - Connecting lines between steps (desktop only): 1px border, muted color
  **success criteria**: Component renders responsively, animations on scroll (fade-in sequence), connecting lines hidden on mobile

- [x] Add ProcessTimeline section to landing page
  **file**: `app/page.tsx`
  **location**: Insert after section-personal-library (before section-benefits)
  **structure**:
  ```tsx
  <section id="section-how-it-works" className="relative min-h-screen flex items-center border-t border-border px-6 py-12 md:py-20">
    <div className="max-w-6xl mx-auto w-full text-center space-y-12">
      <h2 className="text-4xl md:text-5xl lg:text-6xl font-light">
        how it works
      </h2>
      <ProcessTimeline />
    </div>
  </section>
  ```
  **success criteria**: Section renders between personal library and benefits, scroll indicator updated, section ID added for navigation

- [x] Update scroll indicators to include new section
  **file**: `components/landing/scroll-chevron.tsx`
  **changes**: Update scroll chain: semantic-search → personal-library → how-it-works → benefits
  **success criteria**: Chevron navigation works through all 4 sections

### Testing

- [ ] Add unit tests for ProcessTimeline component
  **file**: `__tests__/components/landing/process-timeline.test.tsx` (new)
  **test cases**:
  1. Renders 3 process steps with correct content
  2. Icons import and render correctly
  3. Responsive layout classes applied (flex-row desktop, flex-col mobile)
  4. Connecting lines visible only on desktop (test media query classes)
  **success criteria**: All tests pass, coverage >80%

---

## Phase 3: Hero Demo Animation

### Asset Creation

- [ ] Record search interaction demo
  **method**: Manual screen recording
  **steps**:
  1. Start local dev server (`pnpm dev`)
  2. Populate library with 10-15 sample memes
  3. Record 15-second clip: Type query → Results appear → Click result
  4. Example query: "disappointed drake" or "success kid"
  **output**: `demo-recording.mov` in project root (gitignored)
  **success criteria**: Recording shows clear search interaction, 1920x1080 resolution, <15 seconds duration

- [ ] Convert recording to optimized GIF
  **tool**: ffmpeg
  **command**:
  ```bash
  ffmpeg -i demo-recording.mov -vf "fps=15,scale=800:-1:flags=lanczos" -c:v gif -f gif public/demo/search-demo.gif
  ```
  **optimization**: Reduce colors, 15fps, max width 800px
  **target size**: <2MB
  **success criteria**: GIF loops smoothly, file size <2MB, visually clear at small sizes

### Component Implementation

- [ ] Create DemoAnimation component
  **file**: `components/landing/demo-animation.tsx` (new)
  **implementation**:
  ```tsx
  export function DemoAnimation() {
    return (
      <div className="relative w-full max-w-2xl mx-auto rounded-lg border border-border overflow-hidden">
        <Image
          src="/demo/search-demo.gif"
          alt="Search demo showing semantic meme search"
          width={800}
          height={450}
          className="w-full h-auto"
          priority
        />
        <div className="absolute bottom-4 right-4 font-mono text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
          live demo
        </div>
      </div>
    );
  }
  ```
  **styling**: Minimal border, rounded corners, subtle shadow, "live demo" badge overlay
  **success criteria**: Component renders GIF, maintains aspect ratio, priority loads (hero visible)

- [ ] Add demo animation to hero section
  **file**: `app/page.tsx`
  **location**: Line ~56 (after SearchInput, before CTA button)
  **changes**:
  - Import DemoAnimation component
  - Insert between SearchInput and Button with opacity fade-in animation
  - Stagger animation timing: `opacity-0 animate-[fadeIn_1s_ease-out_0.35s_forwards]`
  **success criteria**: Demo appears in hero, animation sequence flows naturally, doesn't delay CTA visibility

### Testing

- [ ] Add visual regression test for hero section
  **file**: `__tests__/components/landing/demo-animation.test.tsx` (new)
  **test cases**:
  1. Renders Image component with correct src
  2. Priority prop set (eager loading)
  3. Alt text provided (accessibility)
  4. Badge overlay renders with correct text
  **success criteria**: All tests pass, component exports correctly

---

## Phase 4: Social Proof Section

### Content Creation

- [ ] Write 3 testimonial quotes
  **format**: Quote (2-3 sentences) + Attribution (Name, Role)
  **content strategy**:
  - Testimonial 1: Search effectiveness ("Finally found that meme I saw 3 months ago in seconds")
  - Testimonial 2: Organization value ("No more endless scrolling through camera roll")
  - Testimonial 3: Speed/reliability ("Blazing fast even with 500+ memes")
  **tone**: Genuine, specific, benefit-focused (not generic praise)
  **success criteria**: 3 testimonials written, each 20-40 words, attribution includes role context

### Component Implementation

- [ ] Create TestimonialCard component
  **file**: `components/landing/testimonial-card.tsx` (new)
  **structure**:
  ```tsx
  interface TestimonialCardProps {
    quote: string;
    author: string;
    role: string;
  }
  ```
  **styling**:
  - Quote: text-lg md:text-xl, font-light, leading-relaxed
  - Attribution: text-sm, font-mono, text-muted-foreground
  - Card: Minimal border, subtle padding, no background
  - Opening quote: Large decorative quote mark (text-6xl, text-primary/20)
  **success criteria**: Component renders quote with attribution, typography hierarchy clear, accessible

- [ ] Create Testimonials section component
  **file**: `components/landing/testimonials.tsx` (new)
  **implementation**: Grid of 3 TestimonialCard components
  **layout**: `grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12`
  **success criteria**: 3 testimonials render in responsive grid, equal height cards on desktop

- [ ] Add Testimonials section to landing page
  **file**: `app/page.tsx`
  **location**: After section-how-it-works (before section-benefits)
  **structure**:
  ```tsx
  <section className="relative min-h-screen flex items-center border-t border-border px-6 py-12 md:py-20">
    <div className="max-w-6xl mx-auto w-full space-y-12">
      <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-center">
        loved by meme enthusiasts
      </h2>
      <Testimonials />
    </div>
  </section>
  ```
  **success criteria**: Section renders with centered headline, testimonials grid below

### Testing

- [ ] Add unit tests for testimonial components
  **file**: `__tests__/components/landing/testimonials.test.tsx` (new)
  **test cases**:
  1. TestimonialCard renders quote and attribution
  2. Testimonials grid renders 3 cards
  3. Responsive grid classes applied
  **success criteria**: All tests pass, coverage >80%

---

## Phase 5: FAQ Accordion

### Content Creation

- [ ] Write 6 FAQ entries
  **file**: Create `content/landing-faq.ts` for content management
  **questions**:
  1. "Is Sploot really free?" → "Yes, completely free..."
  2. "How does semantic search work?" → "We use CLIP embeddings..."
  3. "Where are my memes stored?" → "Securely in Vercel Blob..."
  4. "Can I export my library?" → "Yes, bulk download..."
  5. "Does it work offline?" → "Yes, PWA capabilities..."
  6. "What image formats are supported?" → "JPEG, PNG, WebP, GIF..."
  **content strategy**: Short questions (5-8 words), detailed answers (2-3 sentences), technical but accessible
  **success criteria**: 6 Q&A pairs written, answers address common user concerns, exported from central content file

### Component Implementation

- [ ] Create FAQAccordion component
  **file**: `components/landing/faq-accordion.tsx` (new)
  **features**:
  - Controlled accordion (only one open at a time)
  - Smooth expand/collapse animation (height transition 300ms)
  - Chevron rotation indicator
  - Keyboard accessible (arrow keys, enter to toggle)
  **styling**:
  - Question: text-lg md:text-xl, font-normal, interactive hover state
  - Answer: text-base, text-muted-foreground, padding-top when expanded
  - Dividers: 1px border-border between items
  - Chevron: Custom SVG or Lucide ChevronDown icon, rotates 180deg when open
  **state management**: useState for activeIndex
  **success criteria**: Accordion opens/closes smoothly, only one item open at a time, keyboard navigation works, animations feel native

- [ ] Add FAQ section to landing page
  **file**: `app/page.tsx`
  **location**: After testimonials section (before final benefits/CTA section)
  **structure**:
  ```tsx
  <section className="relative min-h-screen flex items-center border-t border-border px-6 py-12 md:py-20">
    <div className="max-w-3xl mx-auto w-full space-y-12">
      <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-center">
        frequently asked questions
      </h2>
      <FAQAccordion />
    </div>
  </section>
  ```
  **success criteria**: FAQ section renders with centered headline, accordion below, max-width constrains line length for readability

### Testing

- [ ] Add unit tests for FAQAccordion component
  **file**: `__tests__/components/landing/faq-accordion.test.tsx` (new)
  **test cases**:
  1. Renders all 6 FAQ items
  2. Clicking question opens answer panel
  3. Opening one item closes previously open item
  4. Chevron icon rotates on open/close
  5. Keyboard navigation works (Enter toggles, Arrow keys navigate)
  **mocks**: Mock faq content from content/landing-faq.ts
  **success criteria**: All tests pass, coverage >80%, accessibility tests included

---

## Phase 6: Final CTA Enhancement

### Component Updates

- [ ] Create enhanced CTASection component
  **file**: `components/landing/cta-section.tsx` (new)
  **structure**:
  - Large headline: "Start building your library"
  - Subheadline: "Free forever. No credit card required."
  - Primary CTA button: "Create free account" (larger, more prominent)
  - Secondary link: "View demo" (subtle, text link)
  - Optional: Small trust indicator ("Join 1,000+ meme enthusiasts")
  **styling**:
  - Headline: text-5xl md:text-6xl lg:text-7xl, font-light, tracking-tight
  - Subheadline: text-xl md:text-2xl, text-muted-foreground, font-mono
  - Primary button: size="xl", prominent shadow, slight hover lift effect
  - Secondary link: text-sm, monospace, muted, underline on hover
  - Centered layout with generous spacing (space-y-8)
  **success criteria**: Component renders with clear hierarchy, buttons accessible, hover states work

- [ ] Replace current benefits section with enhanced CTA
  **file**: `app/page.tsx`
  **location**: Line ~127 (current section-benefits)
  **changes**:
  - Keep benefits grid from Phase 1 but move earlier in page flow
  - Replace final section with new CTASection component
  - Maintain border-t, padding, full viewport height
  **success criteria**: CTA section is final section before footer, visually strongest call-to-action on page

### Testing

- [ ] Add unit tests for CTASection component
  **file**: `__tests__/components/landing/cta-section.test.tsx` (new)
  **test cases**:
  1. Renders headline and subheadline with correct text
  2. Primary button links to /sign-up
  3. Secondary link present (if included)
  4. Button hover states work
  **success criteria**: All tests pass, coverage >80%

---

## Phase 7: Footer Enhancement

### Component Updates

- [ ] Enhance footer with sitemap structure
  **file**: `app/page.tsx`
  **location**: Line ~146 (current footer)
  **changes**:
  - Add 3 columns: Product, Company, Resources
  - Product: Features, Pricing, Changelog, Roadmap
  - Company: About, Blog, Contact
  - Resources: Docs, API, Status, GitHub
  - Keep centered copyright and GitHub link at bottom
  **styling**:
  - Column headers: text-sm, font-mono, uppercase, tracking-wide
  - Links: text-sm, text-muted-foreground, hover:text-foreground
  - Grid: `grid grid-cols-2 md:grid-cols-4 gap-8` (mobile 2 cols, desktop 4)
  - Monospace for all text (maintains technical aesthetic)
  **success criteria**: Footer has clear sitemap structure, all links work, responsive on mobile

- [ ] Create placeholder pages for footer links
  **files**: Create basic pages for new routes (can be simple coming soon pages)
  - `app/features/page.tsx`
  - `app/pricing/page.tsx`
  - `app/about/page.tsx`
  **content**: Simple centered layout with headline "Coming Soon" and link back to home
  **success criteria**: All footer links resolve (no 404s), basic pages render

---

## Phase 8: Typography & Polish

### Typography Refinement

- [ ] Audit and refine font weights across landing page
  **file**: `app/page.tsx` and all landing components
  **changes**:
  - Section headlines: Increase from font-light (300) to font-normal (400) for improved hierarchy
  - Body copy: Keep font-light (300) for descriptions
  - CTAs: Use font-medium (500) for button text
  - Monospace elements: All metadata, secondary CTAs, badges use JetBrains Mono
  **success criteria**: Clear typographic hierarchy, headlines stand out, body text readable

- [ ] Add custom animation keyframes for scroll-triggered fades
  **file**: `app/globals.css`
  **keyframes**: Define reusable fadeIn, fadeInUp, fadeInDown animations
  **implementation**:
  ```css
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  ```
  **usage**: Apply to new sections (testimonials, FAQ, process timeline) with IntersectionObserver
  **success criteria**: Smooth stagger animations on scroll, no performance impact, reduced motion respected

### Spacing & Layout

- [ ] Audit spacing consistency across sections
  **files**: All landing page sections in `app/page.tsx`
  **check**: Verify all sections use consistent padding (px-6 py-12 md:py-20)
  **fix**: Standardize any inconsistencies
  **success criteria**: Visual rhythm consistent, no jarring spacing jumps between sections

---

## Phase 9: Accessibility & Performance

### Accessibility

- [ ] Add descriptive alt text to all images
  **files**: All landing components with images (DemoAnimation, ProcessTimeline icons, etc.)
  **requirements**: Alt text describes content/function, not "image of X"
  **success criteria**: No missing alt attributes, all images have meaningful descriptions

- [ ] Verify keyboard navigation works across all interactive elements
  **test**: Tab through entire landing page
  **check**:
  - All buttons reachable via keyboard
  - Focus indicators visible (outline)
  - FAQ accordion navigable with arrow keys
  - Skip to main content link (if needed)
  **success criteria**: Full keyboard navigation works, focus always visible

- [ ] Add ARIA labels where needed
  **files**: FAQAccordion (accordion pattern), scroll chevrons (navigation), demo animation
  **requirements**:
  - Accordion: aria-expanded, aria-controls
  - Navigation: aria-label for chevrons
  - Sections: aria-labelledby for headlines
  **success criteria**: Screen reader navigation works, no accessibility warnings in DevTools

### Performance

- [ ] Optimize demo GIF with lazy loading
  **file**: `components/landing/demo-animation.tsx`
  **change**: Remove priority prop if demo is below fold after layout changes
  **consideration**: Keep priority if demo stays in hero, remove if moved down page
  **success criteria**: Lighthouse performance score >90, LCP <2.5s

- [ ] Add image optimization for any new assets
  **files**: Check all new images use Next.js Image component with appropriate sizing
  **verify**: width/height props set, responsive srcset generated
  **success criteria**: All images optimized, no layout shift (CLS <0.1)

- [ ] Test page performance
  **tool**: Lighthouse (Chrome DevTools)
  **targets**:
  - Performance: >90
  - Accessibility: >95
  - Best Practices: >90
  - SEO: >90
  **success criteria**: All scores meet targets, identify and fix any major issues

---

## Phase 10: Testing & Validation

### Component Testing

- [ ] Run full test suite
  **command**: `pnpm test`
  **verify**: All new component tests pass
  **coverage target**: >80% for new landing components
  **success criteria**: Zero test failures, coverage meets target

### Visual Regression

- [ ] Manual visual testing across breakpoints
  **breakpoints**: Mobile (375px), Tablet (768px), Desktop (1440px), Wide (1920px)
  **browsers**: Chrome, Firefox, Safari
  **checks**:
  - Layout doesn't break at any width
  - Images scale properly
  - Typography readable at all sizes
  - Animations smooth (60fps)
  **success criteria**: No visual bugs, responsive behavior works across all tested devices/browsers

### User Flow Testing

- [ ] Test complete user journey
  **flow**: Land on page → Scroll through all sections → Read FAQ → Click CTA → Sign up
  **verify**:
  - Scroll indicators work
  - All links functional
  - CTAs lead to correct destinations
  - No console errors
  **success criteria**: Complete flow works without errors, intuitive navigation

### Analytics Setup

- [ ] Add analytics tracking to new CTAs
  **file**: Update analytics tracking in Button components
  **events**:
  - "landing_demo_viewed" (hero demo visible)
  - "landing_faq_opened" (accordion item clicked)
  - "landing_cta_clicked" (final CTA button)
  **implementation**: Use existing `track()` function from `lib/analytics.ts`
  **success criteria**: Events fire correctly, visible in Vercel Analytics dashboard

---

## Documentation

- [ ] Update CLAUDE.md with landing page patterns
  **file**: `/Users/phaedrus/Development/sploot/CLAUDE.md`
  **section**: Add "Landing Page Component Patterns" section
  **content**:
  - Document component structure (benefits grid, process timeline, testimonials, FAQ)
  - Note animation patterns (scroll-triggered fades, stagger delays)
  - Typography system (when to use font-light vs font-normal vs font-medium)
  - How to add new sections (follow existing section pattern)
  **success criteria**: Future landing page modifications have clear guidance

- [ ] Add JSDoc comments to all new landing components
  **files**: All components in `components/landing/`
  **format**: Document props, usage examples, styling constraints
  **success criteria**: All exported components have JSDoc, examples provided

---

## Notes

**Implementation Order Rationale**:
1. **Benefits first**: Quickest win, enhances existing section
2. **Process timeline**: Builds on benefits structure, reuses grid patterns
3. **Hero demo**: High-impact visual, requires asset creation first
4. **Social proof**: Depends on content creation, can parallelize
5. **FAQ**: More complex component (accordion state), later in page flow
6. **CTA enhancement**: Pulls together all conversion elements
7. **Footer**: Low priority, informational
8. **Polish & testing**: Final pass after all elements in place

**Parallelization Opportunities**:
- Asset creation (demo GIF, SVG icons) can happen in parallel with component work
- Content writing (testimonials, FAQ) independent of component implementation
- Testing can start as soon as individual components complete

**Design Consistency Checks**:
- All components use 4px spacing system (p-4, gap-4, space-y-4, etc.)
- Color palette limited to: background (#000000), foreground (white), primary (#7C5CFF), muted-foreground
- All animations use 200-300ms duration
- All interactive elements have hover states
- Typography: Geist Sans for UI, JetBrains Mono for technical/metadata

**Time Estimates**:
- Phase 1 (Benefits): 2-3h
- Phase 2 (Process): 4-5h (includes SVG creation)
- Phase 3 (Demo): 2-3h (includes recording/optimization)
- Phase 4 (Testimonials): 2-3h
- Phase 5 (FAQ): 3-4h (accordion complexity)
- Phase 6 (CTA): 1-2h
- Phase 7 (Footer): 1-2h
- Phase 8 (Typography): 2-3h
- Phase 9 (A11y/Perf): 3-4h
- Phase 10 (Testing): 2-3h
- **Total: 22-32 hours (3-4 full days or 1 week part-time)**

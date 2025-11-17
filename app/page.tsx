import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import { OverlappingCircles } from "@/components/landing/overlapping-circles";
import { SearchInput } from "@/components/landing/search-input";
import { ScrollIndicator } from "@/components/landing/scroll-indicator";
import { AnimatedCircles } from "@/components/landing/animated-circles";
import { CollectionGrid } from "@/components/landing/collection-grid";
import { BenefitGrid } from "@/components/landing/benefit-grid";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScrollChevron } from "@/components/landing/scroll-chevron";
import { ProcessTimeline } from "@/components/landing/process-timeline";
import { SectionDivider } from "@/components/landing/section-divider";
import { LandingFooter } from "@/components/landing/landing-footer";

export default async function Home() {
  const { userId } = await getAuth();

  // If user is authenticated, redirect to app
  if (userId) {
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {/* Top navigation */}
      <nav className="fixed top-0 right-0 z-50 p-6 flex items-center gap-4">
        <ThemeToggle />
        <Link
          href="/sign-in"
          className="font-mono text-sm text-muted-foreground hover:text-electric-lime transition-colors uppercase tracking-wider"
        >
          sign in
        </Link>
      </nav>

      {/* Hero section - bold brutalist energy */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-grid relative">
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center space-y-10 text-center">
          {/* Logo + Wordmark */}
          <OverlappingCircles
            strokeWidth={3}
            className="w-28 h-28 md:w-56 md:h-56 opacity-0 animate-[fadeIn_1s_ease-out_forwards]"
          />

          {/* Tagline - bold and direct */}
          <div className="space-y-6 opacity-0 animate-[fadeIn_1s_ease-out_0.15s_forwards]">
            <p
              className="text-2xl md:text-4xl lg:text-5xl tracking-wider text-foreground"
              style={{ fontFamily: "var(--font-bebas-neue)" }}
            >
              MEME SEARCH. INSTANT.
            </p>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Stop scrolling forever. Find any meme in seconds with AI-powered semantic search.
            </p>
          </div>

          {/* Search input (visual demo) */}
          <div className="w-full max-w-2xl opacity-0 animate-[fadeIn_1s_ease-out_0.3s_forwards]">
            <div className="relative">
              <SearchInput placeholder="disappointed drake..." />
              <div className="absolute -right-2 -top-2 bg-hot-pink text-black px-3 py-1 font-mono text-xs font-bold rotate-3">
                TRY IT!
              </div>
            </div>
          </div>

          {/* CTA - brutalist button */}
          <div className="opacity-0 animate-[fadeIn_1s_ease-out_0.45s_forwards]">
            <Button
              asChild
              variant="brutalist"
              size="lg"
              className="px-10 py-7 text-base md:text-lg"
              style={{ fontFamily: "var(--font-bebas-neue)" }}
            >
              <Link href="/sign-up">START FOR FREE →</Link>
            </Button>
          </div>
        </div>

        {/* Scroll indicator */}
        <ScrollIndicator />
      </section>

      {/* Section Divider */}
      <SectionDivider color="lime" className="my-16" />

      {/* Section 1: Semantic Search - Left text, Right visual */}
      <section id="section-semantic-search" className="relative min-h-screen flex items-center px-6 py-12 md:py-20 bg-diagonal-stripes">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
            {/* Text - Left */}
            <div className="space-y-8 order-2 md:order-1">
              <h2
                className="text-5xl md:text-6xl lg:text-7xl leading-tight tracking-wider"
                style={{ fontFamily: "var(--font-bebas-neue)" }}
              >
                SEMANTIC
                <br />
                SEARCH
              </h2>
              <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
                Type what you remember, get what you need. No more endless scrolling through camera roll.
              </p>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-electric-lime" />
                <span className="font-mono text-xs text-electric-lime">AI POWERED</span>
              </div>
            </div>

            {/* Visual - Right */}
            <div className="flex items-center justify-center order-1 md:order-2">
              <AnimatedCircles />
            </div>
          </div>
        </div>
        <ScrollChevron targetId="section-personal-library" />
      </section>

      {/* Section Divider */}
      <SectionDivider color="pink" className="my-16" />

      {/* Section 2: Personal Library - Right text, Left visual */}
      <section id="section-personal-library" className="relative min-h-screen flex items-center px-6 py-12 md:py-20">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
            {/* Visual - Left */}
            <div className="flex items-center justify-center order-1">
              <CollectionGrid />
            </div>

            {/* Text - Right */}
            <div className="space-y-8 order-2">
              <h2
                className="text-5xl md:text-6xl lg:text-7xl leading-tight tracking-wider"
                style={{ fontFamily: "var(--font-bebas-neue)" }}
              >
                PERSONAL
                <br />
                LIBRARY
              </h2>
              <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
                Organized. Searchable. Instant. Your memes, your way.
              </p>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-hot-pink" />
                <span className="font-mono text-xs text-hot-pink">PRIVATE & SECURE</span>
              </div>
            </div>
          </div>
        </div>
        <ScrollChevron targetId="section-how-it-works" />
      </section>

      {/* Section Divider */}
      <SectionDivider color="blue" className="my-16" />

      {/* Section 3: How it Works - Timeline */}
      <section id="section-how-it-works" className="relative min-h-screen flex items-center px-6 py-12 md:py-20 bg-diagonal-stripes">
        <div className="max-w-6xl mx-auto w-full text-center space-y-16">
          <div className="space-y-6">
            <h2
              className="text-5xl md:text-6xl lg:text-7xl leading-tight tracking-wider"
              style={{ fontFamily: "var(--font-bebas-neue)" }}
            >
              HOW IT WORKS
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              From chaos to searchable
            </p>
          </div>
          <ProcessTimeline />
        </div>
        <ScrollChevron targetId="section-benefits" />
      </section>

      {/* Section Divider */}
      <SectionDivider color="lime" className="my-16" />

      {/* Section 4: Benefits - Center text with icons and CTA */}
      <section id="section-benefits" className="relative min-h-screen flex items-center justify-center px-6 py-20 md:py-32 bg-grid">
        <div className="max-w-5xl mx-auto w-full text-center space-y-16">
          <div className="space-y-8">
            <h2
              className="text-5xl md:text-6xl lg:text-8xl leading-tight tracking-wider"
              style={{ fontFamily: "var(--font-bebas-neue)" }}
            >
              PRIVATE. FAST.
              <br />
              WORKS EVERYWHERE.
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Built for speed, designed for privacy, ready anywhere.
            </p>
          </div>

          <BenefitGrid />

          <div className="pt-8">
            <Button
              asChild
              variant="brutalist"
              size="lg"
              className="px-12 py-8 text-lg md:text-xl shadow-2xl"
              style={{ fontFamily: "var(--font-bebas-neue)" }}
            >
              <Link href="/sign-up">START FOR FREE →</Link>
            </Button>
            <p className="mt-6 text-sm text-muted-foreground font-mono">
              NO CREDIT CARD • NO TRACKING • NO BS
            </p>
          </div>
        </div>
      </section>

      {/* Section Divider */}
      <SectionDivider color="yellow" className="mt-20" />

      {/* Footer: Full viewport with animated stats */}
      <LandingFooter />
    </div>
  );
}

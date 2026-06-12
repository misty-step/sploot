import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import { AnimatedCircles } from "@/components/landing/animated-circles";
import { CollectionGrid } from "@/components/landing/collection-grid";
import { BenefitGrid } from "@/components/landing/benefit-grid";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScrollChevron } from "@/components/landing/scroll-chevron";
import { ProcessTimeline } from "@/components/landing/process-timeline";
import { SectionDivider } from "@/components/landing/section-divider";
import { GlobalFooter } from "@/components/global-footer";
import { AtlasLandingHero } from "@/components/sploot";
import { PAID_STORAGE_PLANS, STORAGE_PLANS, formatPlanLimit } from "@/lib/billing/plans";

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
          className="font-mono text-sm uppercase tracking-wider text-muted-foreground transition-colors hover:text-sploot-cyan"
        >
          sign in
        </Link>
      </nav>

      <AtlasLandingHero />

      {/* Section Divider */}
      <SectionDivider color="lime" />

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
                type what you remember. pull the exact reaction out of the pile.
              </p>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-sploot-cyan" />
                <span className="font-mono text-xs uppercase text-sploot-cyan">vibe-based retrieval</span>
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
      <SectionDivider color="coral" />

      {/* Section 2: Personal Library - Right text, Left visual */}
      <section id="section-personal-library" className="relative min-h-screen flex items-center px-6 py-12 md:py-20 bg-grid">
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
                your saves stay private, searchable, and gloriously unfoldered.
              </p>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-sploot-coral" />
                <span className="font-mono text-xs uppercase text-sploot-coral">private chaos</span>
              </div>
            </div>
          </div>
        </div>
        <ScrollChevron targetId="section-how-it-works" />
      </section>

      {/* Section Divider */}
      <SectionDivider color="cyan" />

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
              from camera-roll chaos to instant summon
            </p>
          </div>
          <ProcessTimeline />
        </div>
        <ScrollChevron targetId="section-pricing" />
      </section>

      {/* Section Divider */}
      <SectionDivider color="lime" />

      {/* Section 4: Pricing */}
      <section id="section-pricing" className="relative min-h-screen flex items-center px-6 py-20 md:py-32 bg-background">
        <div className="max-w-6xl mx-auto w-full space-y-12">
          <div className="max-w-3xl space-y-6">
            <h2
              className="text-5xl md:text-6xl lg:text-7xl leading-tight tracking-wider"
              style={{ fontFamily: "var(--font-bebas-neue)" }}
            >
              FREE UNTIL
              <br />
              THE PILE GETS HEAVY
            </h2>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Storage is the real cost, so storage is what pays. Keep reading
              and exporting your library either way.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[STORAGE_PLANS.free, ...PAID_STORAGE_PLANS].map((plan) => (
              <div key={plan.id} className="border border-border bg-card p-5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold text-foreground">{plan.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  </div>
                  <span className="font-mono text-xs uppercase text-muted-foreground">
                    {formatPlanLimit(plan)}
                  </span>
                </div>
                <p
                  className="text-4xl tracking-wider"
                  style={{ fontFamily: "var(--font-bebas-neue)" }}
                >
                  {plan.priceUsd === 0 ? "$0" : `$${plan.priceUsd}`}
                  <span className="ml-1 font-mono text-sm text-muted-foreground">/mo</span>
                </p>
                <Button asChild variant={plan.id === "free" ? "outline" : "accent"} className="w-full">
                  <Link href="/sign-up">{plan.id === "free" ? "start free" : "upgrade storage"}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
        <ScrollChevron targetId="section-benefits" />
      </section>

      {/* Section Divider */}
      <SectionDivider color="cyan" />

      {/* Section 5: Benefits - Center text with icons and CTA */}
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
              built for recall, privacy, and saving memes mid-scroll.
            </p>
          </div>

          <BenefitGrid />

          <div className="pt-8">
            <Button
              asChild
              variant="accent"
              size="lg"
              className="px-12 py-8 text-lg md:text-xl"
              style={{ fontFamily: "var(--font-bebas-neue)" }}
            >
              <Link href="/sign-up">start your pile</Link>
            </Button>
            <p className="mt-6 text-sm text-muted-foreground font-mono">
              no credit card - private pile - no ads
            </p>
          </div>
        </div>
      </section>

      {/* Section Divider */}
      <SectionDivider color="violet" />

      {/* Global Footer */}
      <GlobalFooter />
    </div>
  );
}

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

export default async function Home() {
  const { userId } = await getAuth();

  // If user is authenticated, redirect to app
  if (userId) {
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top navigation */}
      <nav className="fixed top-0 right-0 z-50 p-6 flex items-center gap-4">
        <ThemeToggle />
        <Link
          href="/sign-in"
          className="font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          sign in
        </Link>
      </nav>

      {/* Hero section - centered, minimal */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center space-y-12 text-center">
          {/* Overlapping circles logo */}
          <OverlappingCircles
            strokeWidth={3}
            className="w-28 h-28 md:w-56 md:h-56 opacity-0 animate-[fadeIn_1s_ease-out_forwards]"
          />

          {/* Heading */}
          <div className="space-y-4 opacity-0 animate-[fadeIn_1s_ease-out_0.15s_forwards]">
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-light tracking-tight">
              sploot
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground font-normal">
              find your memes
            </p>
          </div>

          {/* Search input (visual only) */}
          <div className="w-full opacity-0 animate-[fadeIn_1s_ease-out_0.3s_forwards]">
            <SearchInput placeholder="disappointed drake..." />
          </div>

          {/* CTA */}
          <div className="opacity-0 animate-[fadeIn_1s_ease-out_0.45s_forwards]">
            <Button
              asChild
              variant="outline"
              size="lg"
              className="font-mono text-sm px-8 py-6"
            >
              <Link href="/sign-up">create free account</Link>
            </Button>
          </div>
        </div>

        {/* Scroll indicator */}
        <ScrollIndicator />
      </section>

      {/* Section 1: Semantic Search - Left text, Right visual */}
      <section id="section-semantic-search" className="relative min-h-screen flex items-center border-t border-border px-6 py-12 md:py-20">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
            {/* Text - Left */}
            <div className="space-y-6 order-2 md:order-1">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-light leading-tight tracking-tight">
                semantic search
              </h2>
              <p className="text-xl md:text-2xl text-muted-foreground font-light">
                type what you remember,
                <br />
                get what you need
              </p>
            </div>

            {/* Visual - Right */}
            <div className="flex items-center justify-center order-1 md:order-2">
              <AnimatedCircles />
            </div>
          </div>
        </div>
        <ScrollChevron targetId="section-personal-library" />
      </section>

      {/* Section 2: Personal Library - Right text, Left visual */}
      <section id="section-personal-library" className="relative min-h-screen flex items-center border-t border-border px-6 py-12 md:py-20">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
            {/* Visual - Left */}
            <div className="flex items-center justify-center order-1">
              <CollectionGrid />
            </div>

            {/* Text - Right */}
            <div className="space-y-6 order-2">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-light leading-tight tracking-tight">
                personal library
              </h2>
              <p className="text-xl md:text-2xl text-muted-foreground font-light">
                organized. searchable.
                <br />
                instant.
              </p>
            </div>
          </div>
        </div>
        <ScrollChevron targetId="section-benefits" />
      </section>

      {/* Section 3: Benefits - Center text with icons and CTA */}
      <section id="section-benefits" className="relative min-h-screen flex items-center border-t border-border px-6 py-12 md:py-20">
        <div className="max-w-4xl mx-auto w-full text-center space-y-12">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-light leading-tight tracking-tight">
            private. fast.
            <br />
            works everywhere.
          </h2>
          <BenefitGrid />
          <Button
            asChild
            size="lg"
            className="font-mono text-sm px-8 py-6 shadow-lg shadow-primary/20"
          >
            <Link href="/sign-up">create free account</Link>
          </Button>
        </div>
      </section>

      {/* Footer: Minimal */}
      <footer className="px-6 py-8 border-t border-border">
        <div className="max-w-6xl mx-auto text-center">
          <p className="font-mono text-xs text-muted-foreground">
            <a
              href="https://github.com/misty-step/sploot"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              github
            </a>
            {" • "}
            © 2025 sploot
          </p>
        </div>
      </footer>
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { GlobalFooter } from "@/components/global-footer";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingStory } from "@/components/landing/landing-story";

// Authentication and enrollment are request/runtime concerns. Keeping this
// route dynamic prevents a production build from requiring runtime secrets or
// a database before DigitalOcean's PRE_DEPLOY migration step has run.
export const dynamic = "force-dynamic";

export default async function Home() {
  const { userId } = await getAuth();

  // If user is authenticated, redirect to app
  if (userId) {
    redirect("/app");
  }

  return (
    <div className="relative min-h-screen bg-sploot-workbench text-sploot-ink">
      {/* Top navigation */}
      <nav className="fixed top-0 right-0 z-50 flex items-center gap-3 p-5 sm:p-6">
        <ThemeToggle />
        <Link
          href="/sign-in"
          className="sploot-press-sm rounded-full border-[2px] border-sploot-ink bg-sploot-panel px-4 py-2 font-sans text-sm font-extrabold lowercase tracking-normal text-sploot-ink"
        >
          sign in
        </Link>
      </nav>

      {/* The whole product, above the fold: a search box for your memes */}
      <LandingHero />

      {/* Below the fold: how the pile works */}
      <LandingStory />

      <GlobalFooter />
    </div>
  );
}

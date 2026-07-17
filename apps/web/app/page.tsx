import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { GlobalFooter } from "@/components/global-footer";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingStory } from "@/components/landing/landing-story";
import { prisma } from "@/lib/db";
import { readPublicEnrollmentState } from "@/lib/enrollment/enrollment-policy";

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

  const { state: enrollmentState } = await readPublicEnrollmentState({ prisma });

  return (
    <div className="relative min-h-screen bg-sploot-workbench text-sploot-ink">
      {/* Top navigation */}
      <nav
        aria-label="landing navigation"
        className="absolute top-0 right-0 z-50 flex items-center gap-2 p-3 sm:gap-3 sm:p-6"
      >
        <ThemeToggle />
        <Link
          href="/sign-in"
          className="sploot-press-sm inline-flex min-h-[var(--sploot-touch-target)] min-w-11 items-center justify-center rounded-full border-[2px] border-sploot-ink bg-sploot-panel px-3 py-2 text-xs font-extrabold lowercase tracking-normal text-sploot-ink sm:px-4 sm:text-sm"
        >
          sign in
        </Link>
      </nav>

      {/* The whole product, above the fold: a search box for your memes */}
      <LandingHero enrollmentState={enrollmentState} />

      {/* Below the fold: how the pile works */}
      <LandingStory enrollmentState={enrollmentState} />

      <GlobalFooter />
    </div>
  );
}

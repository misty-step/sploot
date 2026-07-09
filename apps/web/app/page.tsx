import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { GlobalFooter } from "@/components/global-footer";
import { AtlasLandingHero } from "@/components/sploot";

export default async function Home() {
  const { userId } = await getAuth();

  // If user is authenticated, redirect to app
  if (userId) {
    redirect("/app");
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Top navigation */}
      <nav className="fixed top-0 right-0 z-50 flex items-center gap-2 p-4 sm:p-6">
        <ThemeToggle />
        <Link
          href="/sign-in"
          className="border border-transparent px-3 py-2 font-mono text-sm font-bold uppercase tracking-normal text-foreground transition-colors hover:border-sploot-ink hover:bg-sploot-ink hover:text-sploot-paper focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sploot-cyan"
        >
          sign in
        </Link>
      </nav>

      {/* The whole product, above the fold: a search box for your memes */}
      <AtlasLandingHero />

      <GlobalFooter />
    </div>
  );
}

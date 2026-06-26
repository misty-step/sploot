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
      <nav className="fixed top-0 right-0 z-50 flex items-center gap-4 p-6">
        <ThemeToggle />
        <Link
          href="/sign-in"
          className="font-mono text-sm uppercase tracking-normal text-muted-foreground transition-colors hover:text-sploot-cyan"
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

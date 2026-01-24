import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Changelog - Sploot",
  description: "Latest updates and improvements to Sploot",
};

export const revalidate = 3600; // Revalidate every hour

interface Release {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

interface GroupedReleases {
  minor: string;
  releases: Release[];
}

async function getReleases(): Promise<Release[]> {
  const repo = process.env.GITHUB_REPOSITORY || "sploot-app/sploot";
  const response = await fetch(
    `https://api.github.com/repos/${repo}/releases?per_page=50`,
    {
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...(process.env.GITHUB_TOKEN && {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
        }),
      },
      next: { revalidate: 3600 },
    }
  );

  if (!response.ok) {
    console.error(`Failed to fetch releases: ${response.status}`);
    return [];
  }

  return response.json();
}

function groupReleasesByMinor(releases: Release[]): GroupedReleases[] {
  const groups = new Map<string, Release[]>();

  for (const release of releases) {
    // Extract minor version (e.g., "v1.2.3" -> "1.2")
    const match = release.tag_name.match(/v?(\d+)\.(\d+)/);
    const minor = match ? `${match[1]}.${match[2]}` : "0.0";

    if (!groups.has(minor)) {
      groups.set(minor, []);
    }
    groups.get(minor)!.push(release);
  }

  // Sort by minor version descending
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      const [aMajor, aMinor] = a.split(".").map(Number);
      const [bMajor, bMinor] = b.split(".").map(Number);
      return bMajor - aMajor || bMinor - aMinor;
    })
    .map(([minor, releases]) => ({ minor, releases }));
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ReleaseCard({ release }: { release: Release }) {
  // Extract user-friendly notes if present, otherwise use raw body
  const bodyMatch = release.body?.match(/## What's New\n\n([\s\S]*?)(?:<details|$)/);
  const displayBody = bodyMatch ? bodyMatch[1].trim() : release.body;

  return (
    <article className="border border-border p-6 bg-card">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-xl font-semibold">{release.tag_name}</h3>
          <time
            dateTime={release.published_at}
            className="text-sm text-muted-foreground font-mono"
          >
            {formatDate(release.published_at)}
          </time>
        </div>
        <a
          href={release.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent-cyan hover:underline"
        >
          View on GitHub
        </a>
      </div>
      {displayBody && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <div
            dangerouslySetInnerHTML={{
              __html: displayBody
                .replace(/^### /gm, '<h4 class="text-base font-semibold mt-4 mb-2">')
                .replace(/^## /gm, '<h3 class="text-lg font-semibold mt-4 mb-2">')
                .replace(/^- /gm, '<li class="ml-4">')
                .replace(/\n\n/g, "</p><p>")
                .replace(/\n/g, "<br>"),
            }}
          />
        </div>
      )}
    </article>
  );
}

async function ReleasesList() {
  const releases = await getReleases();

  if (releases.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No releases yet. Stay tuned!</p>
      </div>
    );
  }

  const grouped = groupReleasesByMinor(releases);

  return (
    <div className="space-y-12">
      {grouped.map(({ minor, releases }) => (
        <section key={minor}>
          <h2
            className="text-2xl mb-6 tracking-wide text-accent-cyan"
            style={{ fontFamily: "var(--font-bebas-neue)" }}
          >
            VERSION {minor}.X
          </h2>
          <div className="space-y-4">
            {releases.map((release) => (
              <ReleaseCard key={release.id} release={release} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ReleasesLoading() {
  return (
    <div className="space-y-12">
      {[1, 2].map((i) => (
        <section key={i}>
          <div className="h-8 w-32 bg-muted animate-pulse mb-6" />
          <div className="space-y-4">
            {[1, 2].map((j) => (
              <div key={j} className="border border-border p-6 bg-card">
                <div className="h-6 w-24 bg-muted animate-pulse mb-2" />
                <div className="h-4 w-32 bg-muted animate-pulse mb-4" />
                <div className="space-y-2">
                  <div className="h-4 w-full bg-muted animate-pulse" />
                  <div className="h-4 w-3/4 bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground transition-colors mb-8 inline-block"
        >
          &larr; Back to Sploot
        </Link>

        <header className="mb-12">
          <h1
            className="text-4xl md:text-5xl mb-4 tracking-wide"
            style={{ fontFamily: "var(--font-bebas-neue)" }}
          >
            CHANGELOG
          </h1>
          <p className="text-muted-foreground">
            Latest updates and improvements to Sploot. Subscribe to our{" "}
            <a
              href="/changelog.xml"
              className="text-accent-cyan hover:underline"
            >
              RSS feed
            </a>{" "}
            to stay updated.
          </p>
        </header>

        <Suspense fallback={<ReleasesLoading />}>
          <ReleasesList />
        </Suspense>
      </div>
    </main>
  );
}

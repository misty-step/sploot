import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import sanitizeHtml from "sanitize-html";
import { getReleases, type Release } from "@/lib/releases";

export const metadata: Metadata = {
  title: "Changelog - Sploot",
  description: "Latest updates and improvements to Sploot",
};

export const revalidate = 3600; // Revalidate every hour

interface GroupedReleases {
  minor: string;
  releases: Release[];
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

function markdownToHtml(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (inList) {
        result.push("</ul>");
        inList = false;
      }
      result.push(
        `<h4 class="text-base font-semibold mt-4 mb-2">${line.slice(4)}</h4>`
      );
    } else if (line.startsWith("## ")) {
      if (inList) {
        result.push("</ul>");
        inList = false;
      }
      result.push(
        `<h3 class="text-lg font-semibold mt-4 mb-2">${line.slice(3)}</h3>`
      );
    } else if (line.startsWith("- ")) {
      if (!inList) {
        result.push('<ul class="list-disc ml-4">');
        inList = true;
      }
      result.push(`<li>${line.slice(2)}</li>`);
    } else if (line.trim() === "") {
      if (inList) {
        result.push("</ul>");
        inList = false;
      }
    } else {
      if (inList) {
        result.push("</ul>");
        inList = false;
      }
      result.push(`<p>${line}</p>`);
    }
  }
  if (inList) result.push("</ul>");
  return result.join("");
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
              __html: sanitizeHtml(markdownToHtml(displayBody), {
                allowedTags: [
                  "h3",
                  "h4",
                  "p",
                  "li",
                  "ul",
                  "br",
                  "strong",
                  "em",
                  "a",
                  "code",
                ],
                allowedAttributes: { "*": ["class"], a: ["href", "target", "rel"] },
              }),
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

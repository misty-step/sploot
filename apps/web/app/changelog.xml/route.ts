import { NextResponse } from "next/server";

export const revalidate = 3600; // Revalidate every hour

interface Release {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

async function getReleases(): Promise<Release[]> {
  const repo = process.env.GITHUB_REPOSITORY || "sploot-app/sploot";
  const response = await fetch(
    `https://api.github.com/repos/${repo}/releases?per_page=20`,
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
    console.error(`Failed to fetch releases for RSS: ${response.status}`);
    return [];
  }

  try {
    return await response.json();
  } catch (error) {
    console.error("Error parsing releases JSON for RSS:", error);
    return [];
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const releases = await getReleases();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sploot.app";

  const items = releases
    .map((release) => {
      const description = release.body
        ? escapeXml(release.body.slice(0, 500))
        : "No description";

      return `
    <item>
      <title>${escapeXml(release.tag_name)} - ${escapeXml(release.name || "Release")}</title>
      <link>${escapeXml(release.html_url)}</link>
      <guid>${escapeXml(release.html_url)}</guid>
      <pubDate>${new Date(release.published_at).toUTCString()}</pubDate>
      <description>${description}</description>
    </item>`;
    })
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Sploot Changelog</title>
    <link>${baseUrl}/changelog</link>
    <description>Latest updates and improvements to Sploot</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/changelog.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

  return new NextResponse(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

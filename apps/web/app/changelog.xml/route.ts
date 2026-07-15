import { NextResponse } from "next/server";
import { getReleases } from "@/lib/releases";

export const revalidate = 3600; // Revalidate every hour

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const releases = await getReleases(20);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.sploot.app";

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

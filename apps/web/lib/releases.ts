import { logger } from '@/lib/observability-logger';

/**
 * GitHub Releases access for user-facing version surfaces (/changelog,
 * /changelog.xml, settings version line).
 *
 * Releases are cut by the landfall semantic-release workflow
 * (.github/workflows/release.yml) on every merge to master; tags are the
 * single source of version truth — package.json stays at 0.1.0 on purpose.
 */

export interface Release {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

// GITHUB_REPOSITORY is only set inside GitHub Actions; on Vercel the
// default must be the real repo or every surface renders empty.
export function getRepoSlug(): string {
  return process.env.GITHUB_REPOSITORY || 'misty-step/sploot';
}

export async function getReleases(perPage = 50): Promise<Release[]> {
  const response = await fetch(
    `https://api.github.com/repos/${getRepoSlug()}/releases?per_page=${perPage}`,
    {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN && {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
        }),
      },
      next: { revalidate: 3600 },
    }
  );

  if (!response.ok) {
    logger.logError('Failed to fetch releases', { status: response.status });
    return [];
  }

  try {
    return await response.json();
  } catch (error) {
    logger.logError('Error parsing releases JSON', error);
    return [];
  }
}

/** Latest released version tag (e.g. "v1.12.0"), or null when unknown. */
export async function getLatestVersion(): Promise<string | null> {
  const releases = await getReleases(1);
  return releases[0]?.tag_name ?? null;
}

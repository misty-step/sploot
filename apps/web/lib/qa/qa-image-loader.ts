/**
 * QA-only Next.js image loader.
 *
 * The assets table CHECK constraint requires blob URLs on
 * `https://*.public.blob.vercel-storage.com/`. Local QA seeds (scripts/qa-seed.ts)
 * store constraint-compliant URLs under the reserved QA_SEED_BLOB_HOST and put
 * the actual bytes in `public/qa-blob-seed/`. This loader maps the reserved
 * host back to that local path so seeded assets render without touching DB
 * constraints or production code paths.
 *
 * Wired up for ordinary local QA and for the explicitly named local evidence
 * mode used by the production-server browser loop (see next.config.ts).
 * Neither mode is enabled by the normal production environment.
 */

export const QA_SEED_BLOB_HOST = 'https://sploot-qa-seed.public.blob.vercel-storage.com';

export function resolveQaSeedSrc(src: string): string {
  if (src.startsWith(`${QA_SEED_BLOB_HOST}/`)) {
    return src.slice(QA_SEED_BLOB_HOST.length);
  }
  return src;
}

// Configuring a custom loader disables Next's own /_next/image endpoint, so
// images are served unoptimized in QA mode: seed fixtures from /qa-blob-seed/
// static files, real blob URLs fetched directly. Width/quality are accepted
// per the loader contract but intentionally unused.
export default function qaImageLoader({ src }: { src: string; width: number; quality?: number }): string {
  return resolveQaSeedSrc(src);
}

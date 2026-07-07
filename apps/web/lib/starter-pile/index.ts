import manifest from './manifest.json';

/**
 * The starter pile: 8 original, license-safe meme images bundled in
 * public/starter-pile/ with real CLIP embeddings precomputed against the
 * production model (scripts/build-starter-pile-manifest.mjs) and committed
 * to manifest.json.
 *
 * Purpose: a brand-new account has an empty library, so the product's aha
 * moment (type words → get the picture) is undemonstrable until the user has
 * sourced content AND embeddings have landed. Seeding these gives a stranger
 * a real, working semantic search in seconds — no Replicate call, no rate
 * limit, no cron wait — while staying opt-in and deletable (every seeded
 * asset carries STARTER_PILE_TAG).
 */

export const STARTER_PILE_TAG = 'starter-pile';

export interface StarterImage {
  file: string;
  caption: string;
  checksum: string;
  dim: number;
  embedding: number[];
}

export interface StarterQuery {
  text: string;
  dim: number;
  embedding: number[];
}

export const STARTER_IMAGES: StarterImage[] = manifest.images;
export const STARTER_QUERIES: StarterQuery[] = manifest.queries;

/** The query the client runs right after seeding to land the aha. */
export const STARTER_FIRST_QUERY = STARTER_QUERIES[0].text;

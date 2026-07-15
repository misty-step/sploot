/**
 * Similarity thresholds for the text→image search path.
 *
 * Single source of truth for every magic number between a pgvector cosine
 * score and what the user sees. Values are DERIVED from the retrieval eval
 * (`pnpm --filter web eval:search` over eval/fixtures/ — see eval/README.md).
 * Do not edit them without re-running the eval and updating eval/baseline.json
 * in the same change.
 *
 * Derivation (eval run 2026-07-07, 100 assets / 88 golden queries,
 * krthr/clip-embeddings):
 *   correct-hit similarity:  min 0.144, p25 0.248, p50 0.267, max 0.444
 *   irrelevant similarity:   p50 0.184, p95 0.220
 *
 * CLIP text→image cosine similarities live in a narrow band (~0.1–0.45);
 * the legacy floor of 0.2 sat INSIDE the correct-hit distribution and cut
 * real matches, and the legacy UI boundaries (0.85/0.7) were unreachable.
 */

/**
 * Minimum cosine similarity for a result to be returned at all.
 * Rule: 90% of the minimum golden correct-hit similarity, rounded down to
 * 2 decimals — keeps every known-good hit with a safety margin.
 */
export const SEARCH_SIMILARITY_FLOOR = 0.12;

/**
 * UI "match" boundary: at or above this, a result renders as a strong match.
 * Rule: median (p50) of golden correct-hit similarities — it scores like a
 * typical verified correct hit.
 */
export const SIMILARITY_MATCH_BOUNDARY = 0.27;

/**
 * UI "near" boundary: between this and the match boundary, a result renders
 * as a near-match. Rule: p25 of golden correct-hit similarities.
 */
export const SIMILARITY_NEAR_BOUNDARY = 0.25;

/** Default number of results the client requests. */
export const SEARCH_DEFAULT_LIMIT = 50;

/** Maximum number of results any one semantic-search page may return. */
export const SEARCH_MAX_LIMIT = 100;

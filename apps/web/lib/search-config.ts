/**
 * Similarity thresholds for the text→image search path.
 *
 * Single source of truth for every magic number between a pgvector cosine
 * score and what the user sees. Values are DERIVED from the retrieval eval
 * (scripts/eval-search.ts over eval/fixtures/, see eval/README.md) — do not
 * edit them without re-running `pnpm --filter web eval:search` and updating
 * the baseline in the same change.
 */

/**
 * Minimum cosine similarity for a result to be returned at all.
 *
 * Legacy pre-eval value (uncalibrated). The eval's baseline run measures the
 * golden set at this floor; calibration replaces it with a derived value.
 */
export const SEARCH_SIMILARITY_FLOOR = 0.2;

/**
 * UI "match" boundary: at or above this, a result renders as a strong match
 * (lime/cyan ring). Legacy pre-eval value (uncalibrated).
 */
export const SIMILARITY_MATCH_BOUNDARY = 0.85;

/**
 * UI "near" boundary: between this and the match boundary, a result renders
 * as a near-match. Legacy pre-eval value (uncalibrated).
 */
export const SIMILARITY_NEAR_BOUNDARY = 0.7;

/** Default number of results the client requests. */
export const SEARCH_DEFAULT_LIMIT = 50;

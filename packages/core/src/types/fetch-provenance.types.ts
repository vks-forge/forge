/**
 * Types of the fetch provenance check.
 *
 * Why: the research step may fetch only URLs the engine can trace to something other than page text (d-0144).
 *   The three places a URL may come from are named here so the pure check and the engine agree on them.
 *
 * Exports: KnownUrls.
 * Depends on: none. Types only.
 */

/** The URL sets a fetch may come from. */
export interface KnownUrls {
  readonly hits: readonly string[];
  readonly cardUrls: readonly string[];
  readonly answerUrls: readonly string[];
}

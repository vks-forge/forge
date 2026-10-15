/**
 * Types for per-ecosystem gate rule data and the rules resolved for one gate run.
 *
 * Why: G1 must judge repos in any language (d-0095), so what is language-specific (which
 *   files are gate configuration, which are tests, what a skipped test looks like) is data,
 *   one module per ecosystem, and the checks read a single resolved shape. A shared shape
 *   is what lets a new ecosystem be one new data file with no change to any check.
 *
 * Exports: EcosystemRules, ResolvedRules.
 * Depends on: none. Types only.
 */

/** The language-specific facts one ecosystem contributes to the gates. */
export interface EcosystemRules {
  readonly id: string;
  /** Path globs whose presence in a diff marks the ecosystem (project files, source extensions). */
  readonly detect: readonly string[];
  /** First words of commands that run this ecosystem's tools; used for detection from check commands. */
  readonly tools: readonly string[];
  /** Files the Worker may not change: test, lint, format and type configuration. */
  readonly configGlobs: readonly string[];
  /** Path globs of test files, matched on folded (lower case, forward slash) paths. */
  readonly testGlobs: readonly string[];
  /** A changed line matching one of these marks its file as tests (Rust `#[cfg(test)]`). */
  readonly testContent: readonly RegExp[];
  /** Test declarations; the last capture group is the test's title or name. */
  readonly declarations: readonly RegExp[];
  /** Added test lines matching one of these skip, ignore or focus a test. */
  readonly skipMarkers: readonly RegExp[];
  /** Lines counted as assertions when judging whether a test lost checks. */
  readonly assertions: readonly RegExp[];
  /** True when jest-style `expect(x).matcher` weakening applies. */
  readonly weakExpect?: boolean;
}

/** The union of the active ecosystems' rules plus project additions, ready for the checks. */
export interface ResolvedRules {
  /** Ids of the ecosystems whose rules are active. */
  readonly ecosystems: readonly string[];
  readonly configGlobs: readonly string[];
  readonly testGlobs: readonly string[];
  readonly testContent: readonly RegExp[];
  readonly declarations: readonly RegExp[];
  readonly skipMarkers: readonly RegExp[];
  readonly assertions: readonly RegExp[];
  readonly weakExpect: boolean;
}

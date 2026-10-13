/**
 * Types for path normalisation.
 *
 * Why: the path floors compare a Worker-chosen spelling with fixed globs, so every
 *   spelling is first parsed into a root and clean segments; naming that shape keeps
 *   normalising, resolving against a cwd and the inside-cwd test working on one value.
 *
 * Exports: ParsedPath.
 * Depends on: No IO (types only).
 */

export interface ParsedPath {
  /** `''` relative, `'/'` posix root, `'//'` UNC, `'c:/'` drive root. */
  readonly root: string;
  readonly segments: readonly string[];
}

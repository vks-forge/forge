/**
 * Types of the local branch listing shown when a project is registered.
 *
 * Why: the new-project form offers the clone's branches as the base branch; a typed,
 *   bounded result keeps a repository with thousands of branches from flooding the form.
 *
 * Exports: BranchListing, BranchListingOptions.
 * Depends on: none. Types only.
 */

export interface BranchListingOptions {
  /** The clone's root folder (already checked by `inspectRepository`). */
  readonly path: string;
  /** Most branch names to return; the rest are only counted as `truncated`. Default 50. */
  readonly limit?: number;
  readonly gitBinary?: string;
}

export interface BranchListing {
  /** The checked-out branch; null on a detached HEAD. */
  readonly current: string | null;
  /** Local branch names, alphabetical, at most `limit`. */
  readonly branches: readonly string[];
  /** True when the repository has more local branches than were returned. */
  readonly truncated: boolean;
}

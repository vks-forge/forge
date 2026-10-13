/**
 * Memory source types — options and parse results of the file-backed MemorySource.
 *
 * Why: a malformed memory record must never become a constraint, but it must not be
 *   silently lost either; the owner needs to hear that a record was skipped. These
 *   shapes carry that report (`onSkip`) and the parse outcome without exceptions.
 *
 * Exports: MemorySourceDeps, FrontMatterResult.
 * Depends on: nothing. Types only.
 */

/** Optional hooks for `createFileMemorySource`. */
export interface MemorySourceDeps {
  /** Called once per file or slug that was ignored, with the absolute path (or slug) and why. */
  readonly onSkip?: (path: string, reason: string) => void;
}

/** Outcome of parsing one record front matter block; failures carry a reason, never throw. */
export type FrontMatterResult =
  | { readonly ok: true; readonly data: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly reason: string };
